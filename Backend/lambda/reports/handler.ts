import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { dbDelete, dbGet, dbPut, dbUpdate, dbQuery, dbScan } from '../shared/dynamo';
import { ok, created, badRequest, forbidden, notFound, serverError } from '../shared/response';
import { getCaller, isAdmin, isCrew } from '../shared/auth';
import { getPresignedGetUrl } from '../shared/s3';

const s3  = new S3Client({});
const eb  = new EventBridgeClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const REPORTS_TABLE = process.env.REPORTS_TABLE!;
const USERS_TABLE   = process.env.USERS_TABLE!;
const TASKS_TABLE   = process.env.TASKS_TABLE!;
const NOTIFICATIONS_TABLE = process.env.NOTIFICATIONS_TABLE!;
const MEDIA_BUCKET  = process.env.MEDIA_BUCKET!;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? '';
const STAGE         = process.env.STAGE ?? 'dev';

// ── Haversine distance (km) ───────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function resolveCrewCoordinates(profile: Record<string, any>): Promise<Record<string, any> | null> {
  const latitude = Number(profile.locationLat);
  const longitude = Number(profile.locationLng);
  if (Number.isFinite(latitude) && Number.isFinite(longitude) && profile.locationLat != null && profile.locationLng != null) {
    return { ...profile, locationLat: latitude, locationLng: longitude };
  }
  if (!profile.locationText || !GOOGLE_MAPS_API_KEY) return null;

  try {
    const address = encodeURIComponent(`${profile.locationText}, Buea, Cameroon`);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=${GOOGLE_MAPS_API_KEY}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const result = await response.json() as any;
    const point = result.status === 'OK' ? result.results?.[0]?.geometry?.location : null;
    if (!point || !Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lng))) return null;

    const locationLat = Number(point.lat);
    const locationLng = Number(point.lng);
    await dbUpdate({
      TableName: USERS_TABLE,
      Key: { userId: profile.userId },
      UpdateExpression: 'SET locationLat = :lat, locationLng = :lng, updatedAt = :now',
      ExpressionAttributeValues: { ':lat': locationLat, ':lng': locationLng, ':now': new Date().toISOString() },
    }).catch(error => console.warn('Could not cache geocoded crew location:', error));
    return { ...profile, locationLat, locationLng };
  } catch (error) {
    console.warn('Could not geocode crew location:', error);
    return null;
  }
}

// ── Auto-assign nearest crew member ──────────────────────────────────────────
async function autoAssignReport(
  report: Record<string, any>,
): Promise<void> {
  try {
    const reportId = report.reportId as string;
    const reportLat = Number(report.lat);
    const reportLng = Number(report.lng);
    if (report.lat === null || report.lat === undefined || report.lng === null || report.lng === undefined) {
      await alertAdminsForManualAssignment(report);
      return;
    }
    // Fetch all active crew profiles that have geocoded coordinates
    const scan = await ddb.send(new ScanCommand({
      TableName: USERS_TABLE,
      FilterExpression: '#r IN (:crew, :crewUpper) AND #s = :active',
      ExpressionAttributeNames: { '#r': 'role', '#s': 'status' },
      ExpressionAttributeValues: { ':crew': 'crew', ':crewUpper': 'CREW', ':active': 'active' },
    }));

    const resolvedCrew = await Promise.all((scan.Items ?? []).map(profile => resolveCrewCoordinates(profile)));
    const crew = resolvedCrew.filter((profile): profile is Record<string, any> => profile !== null);
    if (crew.length === 0) {
      console.log(`No geocoded crew available — report ${reportId} stays pending`);
      await alertAdminsForManualAssignment(report);
      return;
    }

    // Pick the crew member with the shortest distance to the report
    let nearest = crew[0];
    let minDist = haversineKm(reportLat, reportLng, nearest.locationLat, nearest.locationLng);

    for (let i = 1; i < crew.length; i++) {
      const dist = haversineKm(reportLat, reportLng, crew[i].locationLat, crew[i].locationLng);
      if (dist < minDist) {
        minDist  = dist;
        nearest  = crew[i];
      }
    }

    const maximumDistanceKm = Number(process.env.MAX_AUTO_ASSIGN_DISTANCE_KM ?? 25);
    if (minDist > maximumDistanceKm) {
      console.log(`Nearest crew is ${minDist.toFixed(1)} km away; report ${reportId} remains pending`);
      await alertAdminsForManualAssignment(report, minDist);
      return;
    }

    console.log(
      `Auto-assigning report ${reportId} to crew ${nearest.userId} (${nearest.name}) ` +
      `— distance: ${minDist.toFixed(2)} km`
    );

    const now = new Date().toISOString();
    const taskId = crypto.randomUUID();
    const dueAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    await dbPut({
      TableName: TASKS_TABLE,
      Item: {
        taskId,
        title: `Clean ${report.type === 'overflow' ? 'overflowing bin' : 'illegal dumping'}`,
        description: report.description ?? '',
        reportIds: [reportId],
        crewIds: [],
        crewLeadId: nearest.userId,
        scheduledAt: now,
        dueAt,
        status: 'assigned',
        evidencePhotoKeys: [],
        createdBy: 'automatic-assignment',
        createdAt: now,
        updatedAt: now,
      },
    });
    try {
      await dbUpdate({
        TableName: REPORTS_TABLE,
        Key: { reportId },
        UpdateExpression:
          'SET #s = :assigned, assignedTaskId = :taskId, assignedCrewId = :crewId, assignedCrewName = :crewName, ' +
          'assignedDistanceKm = :dist, updatedAt = :now REMOVE manualAssignmentAlertedAt, manualAssignmentAlertReason',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':pending': 'pending',
          ':assigned': 'assigned',
          ':taskId': taskId,
          ':crewId': nearest.userId,
          ':crewName': nearest.name,
          ':dist': Math.round(minDist * 10) / 10,
          ':now': now,
        },
        ConditionExpression: 'attribute_exists(reportId) AND #s = :pending',
      });
    } catch (e) {
      await dbDelete({ TableName: TASKS_TABLE, Key: { taskId } }).catch(() => undefined);
      throw e;
    }
    await writeNotification(
      nearest.userId,
      'task_assigned',
      'New task assigned',
      `You have been assigned to a report near ${report.address ?? 'your area'}. It is due ${new Date(dueAt).toLocaleString()}.`,
      taskId,
      reportId,
    );
  } catch (e) {
    // Auto-assign is best-effort — a failure must not roll back the report creation
    console.error('Auto-assign error (non-fatal):', e);
  }
}

async function alertAdminsForManualAssignment(report: Record<string, any>, distanceKm?: number) {
  if (!NOTIFICATIONS_TABLE) return;
  const now = new Date();
  const cooldown = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  try {
    await dbUpdate({
      TableName: REPORTS_TABLE,
      Key: { reportId: report.reportId },
      UpdateExpression: 'SET manualAssignmentAlertedAt = :now, manualAssignmentAlertReason = :reason',
      ExpressionAttributeValues: {
        ':now': now.toISOString(),
        ':reason': distanceKm === undefined ? 'location_or_crew_unavailable' : 'nearest_crew_too_far',
        ':cooldown': cooldown,
      },
      ConditionExpression: 'attribute_exists(reportId) AND (attribute_not_exists(manualAssignmentAlertedAt) OR manualAssignmentAlertedAt < :cooldown)',
    });
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return;
    throw error;
  }

  const { items } = await dbScan({
    TableName: USERS_TABLE,
    FilterExpression: '#r IN (:admin, :adminUpper)',
    ExpressionAttributeNames: { '#r': 'role' },
    ExpressionAttributeValues: { ':admin': 'admin', ':adminUpper': 'ADMIN' },
  });
  const distanceMessage = distanceKm === undefined ? 'No active crew member has a recorded location.' : `The closest crew member is ${distanceKm.toFixed(1)} km away.`;
  await Promise.allSettled(items.map(user => writeNotification(
    user.userId as string,
    'general',
    'Manual assignment required',
    `Report ${report.reportId} at ${report.address ?? 'an unknown location'} remains pending. ${distanceMessage}`,
    undefined,
    report.reportId as string,
  )));
}

async function writeNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  taskId?: string,
  reportId?: string,
) {
  if (!NOTIFICATIONS_TABLE) return;
  await dbPut({
    TableName: NOTIFICATIONS_TABLE,
    Item: {
      notificationId: crypto.randomUUID(), userId, type, title, body, taskId: taskId ?? null,
      reportId: reportId ?? null, read: false, createdAt: new Date().toISOString(),
    },
  });
}

async function notifyCommunityOfReport(report: Record<string, any>, submitterId?: string) {
  if (!NOTIFICATIONS_TABLE) return;

  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await dbScan({
      TableName: USERS_TABLE,
      FilterExpression: '#r IN (:citizen, :citizenUpper, :crew, :crewUpper)',
      ExpressionAttributeNames: { '#r': 'role' },
      ExpressionAttributeValues: {
        ':citizen': 'citizen',
        ':citizenUpper': 'CITIZEN',
        ':crew': 'crew',
        ':crewUpper': 'CREW',
      },
      Limit: 100,
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    });

    const recipients = result.items.filter(user => user.userId && user.userId !== submitterId);
    await Promise.allSettled(recipients.map(user => writeNotification(
      user.userId as string,
      'report_new',
      'New community report',
      `A ${report.type === 'overflow' ? 'overflowing bin' : 'illegal dumping'} issue was reported at ${report.address}.`,
      undefined,
      report.reportId as string,
    )));
    lastKey = result.lastKey as Record<string, unknown> | undefined;
  } while (lastKey);
}

// ── createReport ─────────────────────────────────────────────────────────────
export async function processPendingReports(): Promise<number> {
  let lastKey: Record<string, unknown> | undefined;
  let processed = 0;
  do {
    const result = await dbScan({
      TableName: REPORTS_TABLE,
      FilterExpression: '#s = :pending',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':pending': 'pending' },
      Limit: 100,
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    });
    await Promise.allSettled(result.items.map(report => autoAssignReport(report)));
    processed += result.items.length;
    lastKey = result.lastKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return processed;
}

async function createReport(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body ?? '{}');
  const {
    type: rawType,
    address,
    lat: latField,
    lng: lngField,
    latitude,
    longitude,
    description,
    guestName,
    guestPhone,
    photoKey,
  } = body;

  const type = normalizeType(rawType ?? '');
  const lat  = latField ?? latitude ?? null;
  const lng  = lngField ?? longitude ?? null;
  const ward = body.ward ?? (lat && lng ? `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}` : null);

  if (!type) return badRequest('type is required');
  if (!['overflow', 'dumping'].includes(type)) return badRequest('type must be overflow_bin or illegal_dumping');
  if (!address && !lat) return badRequest('address or location coordinates are required');

  const caller   = getCaller(event);
  const submitter = caller ? await dbGet({ TableName: USERS_TABLE, Key: { userId: caller.userId } }) : null;
  const reportId = crypto.randomUUID();
  const now      = new Date().toISOString();

  const report = {
    reportId,
    type,
    status: 'pending',
    ward,
    address:     address ?? `${lat},${lng}`,
    lat,
    lng,
    photoKey:    photoKey ?? null,
    description: description ?? '',
    submittedBy: caller?.userId ?? null,
    submittedByName: caller ? submitter?.name ?? caller.email.split('@')[0] : null,
    guestName:   caller ? null : (guestName ?? null),
    guestPhone:  caller ? null : (guestPhone ?? null),
    assignedTaskId: null,
    createdAt: now,
    updatedAt: now,
  };

  await dbPut({ TableName: REPORTS_TABLE, Item: report });

  await notifyCommunityOfReport(report, caller?.userId)
    .catch(error => console.error('Community report notification error:', error));

  // Fire EventBridge notification (non-blocking)
  eb.send(new PutEventsCommand({
    Entries: [{
      Source:      'cleanloop.reports',
      DetailType:  'ReportCreated',
      Detail:      JSON.stringify({ reportId, ward, type, status: 'pending' }),
      EventBusName: `cleanloop-events-${STAGE}`,
    }],
  })).catch(e => console.error('EventBridge error:', e));

  // Auto-assign to nearest crew member if coordinates are available (non-blocking)
  if (lat !== null && lng !== null) {
    autoAssignReport(report)
      .catch(e => console.error('autoAssignReport error:', e));
  } else {
    alertAdminsForManualAssignment(report)
      .catch(e => console.error('manual assignment alert error:', e));
  }

  return created({ report });
}

function normalizeType(raw: string): string {
  if (raw === 'overflow_bin')    return 'overflow';
  if (raw === 'illegal_dumping') return 'dumping';
  return raw;
}

// ── listReports ───────────────────────────────────────────────────────────────
async function listReports(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  const { status, ward, limit = '50', lastKey } = event.queryStringParameters ?? {};

  if (isAdmin(caller) || isCrew(caller)) {
    if (status) {
      const result = await dbQuery({
        TableName: REPORTS_TABLE,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#s = :s',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':s': status },
        Limit: parseInt(limit),
        ...(lastKey ? { ExclusiveStartKey: JSON.parse(Buffer.from(lastKey, 'base64').toString()) } : {}),
      });
      return ok({ reports: await enrichReports(result.items, caller?.userId), nextKey: result.lastKey ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64') : null });
    }

    if (ward) {
      const result = await dbQuery({
        TableName: REPORTS_TABLE,
        IndexName: 'LocationIndex',
        KeyConditionExpression: 'ward = :w',
        ExpressionAttributeValues: { ':w': ward },
        Limit: parseInt(limit),
        ...(lastKey ? { ExclusiveStartKey: JSON.parse(Buffer.from(lastKey, 'base64').toString()) } : {}),
      });
      return ok({ reports: await enrichReports(result.items, caller?.userId), nextKey: result.lastKey ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64') : null });
    }

    const { dbScan } = await import('../shared/dynamo');
    const result = await dbScan({
      TableName: REPORTS_TABLE,
      Limit: parseInt(limit),
      ...(lastKey ? { ExclusiveStartKey: JSON.parse(Buffer.from(lastKey, 'base64').toString()) } : {}),
    });
    return ok({ reports: await enrichReports(result.items, caller?.userId), nextKey: result.lastKey ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64') : null });
  }

  if (caller) {
    const { dbScan } = await import('../shared/dynamo');
    const result = await dbScan({
      TableName: REPORTS_TABLE,
      FilterExpression: 'submittedBy = :uid',
      ExpressionAttributeValues: { ':uid': caller.userId },
      Limit: parseInt(limit),
    });
    return ok({ reports: await enrichReports(result.items) });
  }

  const allowedStatuses = ['pending', 'assigned', 'in_progress', 'resolved'];
  const filterStatus = status && allowedStatuses.includes(status) ? status : null;

  if (filterStatus) {
    const result = await dbQuery({
      TableName: REPORTS_TABLE,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#s = :s',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':s': filterStatus },
      Limit: parseInt(limit),
      ScanIndexForward: false,
    });
    return ok({ reports: await enrichReports(result.items, getCaller(event)?.userId) });
  }

  const { dbScan } = await import('../shared/dynamo');
  const result = await dbScan({ TableName: REPORTS_TABLE, Limit: parseInt(limit) });
  return ok({ reports: await enrichReports(result.items, getCaller(event)?.userId) });
}

async function listMyReports(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!caller) return forbidden('Authentication required');

  const { limit = '50' } = event.queryStringParameters ?? {};
  const { dbScan } = await import('../shared/dynamo');
  const result = await dbScan({
    TableName: REPORTS_TABLE,
    FilterExpression: 'submittedBy = :uid',
    ExpressionAttributeValues: { ':uid': caller.userId },
    Limit: parseInt(limit),
  });
  return ok({ reports: await enrichReports(result.items, caller.userId) });
}

async function listPublicReports(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { status, limit = '50', lastKey } = event.queryStringParameters ?? {};
  const allowedStatuses = ['pending', 'assigned', 'in_progress', 'resolved'];
  const filterStatus = status && allowedStatuses.includes(status) ? status : null;

  if (filterStatus) {
    const result = await dbQuery({
      TableName: REPORTS_TABLE,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#s = :s',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':s': filterStatus },
      Limit: parseInt(limit),
      ...(lastKey ? { ExclusiveStartKey: JSON.parse(Buffer.from(lastKey, 'base64').toString()) } : {}),
    });
    return ok({
      reports: await enrichReports(result.items, getCaller(event)?.userId),
      nextKey: result.lastKey ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64') : null,
    });
  }

  const { dbScan } = await import('../shared/dynamo');
  const result = await dbScan({
    TableName: REPORTS_TABLE,
    Limit: parseInt(limit),
    ...(lastKey ? { ExclusiveStartKey: JSON.parse(Buffer.from(lastKey, 'base64').toString()) } : {}),
  });
  return ok({
    reports: await enrichReports(result.items, getCaller(event)?.userId),
    nextKey: result.lastKey ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64') : null,
  });
}

async function enrichReports(reports: Record<string, any>[], viewerId?: string) {
  return Promise.all(reports.map(async report => {
    const [author, task, photoUrl] = await Promise.all([
      report.submittedBy
        ? dbGet({ TableName: USERS_TABLE, Key: { userId: report.submittedBy } })
        : Promise.resolve(null),
      report.assignedTaskId && TASKS_TABLE
        ? dbGet({ TableName: TASKS_TABLE, Key: { taskId: report.assignedTaskId } })
        : Promise.resolve(null),
      report.photoKey ? getPresignedGetUrl(MEDIA_BUCKET, report.photoKey) : Promise.resolve(null),
    ]);
    const evidencePhotoUrls = task?.evidencePhotoKeys
      ? await Promise.all((task.evidencePhotoKeys as string[]).map(key => getPresignedGetUrl(MEDIA_BUCKET, key)))
      : [];
    return {
      ...sanitizeForGuest(report),
      submitterName: author?.name ?? report.submittedByName ?? report.guestName ?? 'Community member',
      photoUrl,
      evidencePhotoUrls,
      completedAt: task?.completedAt ?? report.completedAt ?? null,
      likeCount: report.likedBy?.size ?? report.likedBy?.length ?? 0,
      likedByMe: viewerId ? Array.from(report.likedBy ?? []).includes(viewerId) : false,
      comments: report.comments ?? [],
    };
  }));
}

function sanitizeForGuest(r: Record<string, unknown>) {
  const { reportId, type, status, ward, address, lat, lng, description, createdAt } = r;
  return { reportId, type, status, ward, address, lat, lng, description, createdAt };
}

async function getReport(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { reportId } = event.pathParameters ?? {};
  if (!reportId) return badRequest('reportId required');

  const report = await dbGet({ TableName: REPORTS_TABLE, Key: { reportId } });
  if (!report) return notFound('Report not found');

  const [enriched] = await enrichReports([report as Record<string, any>], getCaller(event)?.userId);
  return ok({ report: enriched });
}

async function deleteReport(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!isAdmin(caller)) return forbidden('Admin only');

  const { reportId } = event.pathParameters ?? {};
  if (!reportId) return badRequest('reportId required');

  const report = await dbGet({ TableName: REPORTS_TABLE, Key: { reportId } });
  if (!report) return notFound('Report not found');

  if (report.photoKey) {
    await s3.send(new DeleteObjectCommand({ Bucket: MEDIA_BUCKET, Key: report.photoKey as string }));
  }
  await dbDelete({ TableName: REPORTS_TABLE, Key: { reportId } });

  return ok({ reportId, deleted: true, imageDeleted: !!report.photoKey });
}

async function toggleReportLike(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!caller) return forbidden('Authentication required');
  const { reportId } = event.pathParameters ?? {};
  if (!reportId) return badRequest('reportId required');

  const report = await dbGet({ TableName: REPORTS_TABLE, Key: { reportId } });
  if (!report) return notFound('Report not found');
  const likedBy = new Set<string>(Array.from((report.likedBy ?? []) as Iterable<string>));
  const liked = !likedBy.has(caller.userId);
  await dbUpdate({
    TableName: REPORTS_TABLE,
    Key: { reportId },
    UpdateExpression: liked ? 'ADD likedBy :users' : 'DELETE likedBy :users',
    ExpressionAttributeValues: { ':users': new Set([caller.userId]) },
  });
  return ok({ reportId, liked, likeCount: likedBy.size + (liked ? 1 : -1) });
}

async function addReportComment(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!caller) return forbidden('Authentication required');
  const { reportId } = event.pathParameters ?? {};
  const { text } = JSON.parse(event.body ?? '{}');
  const body = typeof text === 'string' ? text.trim() : '';
  if (!reportId || !body || body.length > 1000) return badRequest('reportId and a comment of 1-1000 characters are required');
  const report = await dbGet({ TableName: REPORTS_TABLE, Key: { reportId } });
  if (!report) return notFound('Report not found');
  const user = await dbGet({ TableName: USERS_TABLE, Key: { userId: caller.userId } });
  const comment = {
    commentId: crypto.randomUUID(),
    userId: caller.userId,
    name: user?.name ?? 'Community member',
    text: body,
    createdAt: new Date().toISOString(),
  };
  await dbUpdate({
    TableName: REPORTS_TABLE,
    Key: { reportId },
    UpdateExpression: 'SET comments = list_append(if_not_exists(comments, :empty), :comment)',
    ExpressionAttributeValues: { ':empty': [], ':comment': [comment] },
  });
  return created({ comment });
}

async function updateReportStatus(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!isAdmin(caller)) return forbidden('Admin only');

  const { reportId } = event.pathParameters ?? {};
  if (!reportId) return badRequest('reportId required');

  const { status } = JSON.parse(event.body ?? '{}');
  const allowed = ['pending', 'assigned', 'in_progress', 'resolved'];
  if (!status || !allowed.includes(status)) return badRequest(`status must be one of: ${allowed.join(', ')}`);

  const now = new Date().toISOString();
  await dbUpdate({
    TableName: REPORTS_TABLE,
    Key: { reportId },
    UpdateExpression: 'SET #s = :s, updatedAt = :now',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':s': status, ':now': now },
    ConditionExpression: 'attribute_exists(reportId)',
  }).catch(() => { throw new Error('Report not found'); });

  return ok({ reportId, status });
}

async function getPresignedUpload(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { contentType = 'image/jpeg', filename } = event.queryStringParameters ?? {};
  const ext = filename?.split('.').pop() ?? 'jpg';
  const key = `reports/${crypto.randomUUID()}.${ext}`;

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: MEDIA_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 300 }
  );

  return ok({ url, key });
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if ((event as unknown as { source?: string }).source === 'aws.events') {
      const processed = await processPendingReports();
      return ok({ processed });
    }
    const { httpMethod, resource, path: reqPath } = event;
    console.log(`${httpMethod} ${reqPath}`);

    if (httpMethod === 'POST'  && resource === '/reports')                    return createReport(event);
    if (httpMethod === 'POST'  && resource === '/reports/guest')              return createReport(event);
    if (httpMethod === 'GET'   && resource === '/reports')                    return listReports(event);
    if (httpMethod === 'GET'   && resource === '/reports/public')             return listPublicReports(event);
    if (httpMethod === 'GET'   && resource === '/reports/public/authenticated') return listPublicReports(event);
    if (httpMethod === 'GET'   && resource === '/reports/mine')               return listMyReports(event);
    if (httpMethod === 'GET'   && resource === '/reports/presigned-upload')   return getPresignedUpload(event);
    if (httpMethod === 'GET'   && resource === '/reports/{reportId}')         return getReport(event);
    if (httpMethod === 'DELETE' && resource === '/reports/{reportId}')        return deleteReport(event);
    if (httpMethod === 'POST'  && resource === '/reports/{reportId}/like')    return toggleReportLike(event);
    if (httpMethod === 'POST'  && resource === '/reports/{reportId}/comments') return addReportComment(event);
    if (httpMethod === 'PATCH' && resource === '/reports/{reportId}/status')  return updateReportStatus(event);

    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not found' }) };
  } catch (e) {
    console.error('Unhandled error:', e);
    return serverError();
  }
}