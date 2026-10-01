import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { dbGet, dbPut, dbUpdate, dbQuery, dbScan, dbDelete } from '../shared/dynamo';
import { ok, created, badRequest, forbidden, notFound, serverError } from '../shared/response';
import { getCaller, isAdmin, isCrew } from '../shared/auth';
import { getPresignedPutUrl, getPresignedGetUrl } from '../shared/s3';

const ses = new SESClient({});
const s3 = new S3Client({});
const TASKS_TABLE = process.env.TASKS_TABLE!;
const REPORTS_TABLE = process.env.REPORTS_TABLE!;
const USERS_TABLE = process.env.USERS_TABLE!;
const NOTIFICATIONS_TABLE = process.env.NOTIFICATIONS_TABLE!;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL!;
const MEDIA_BUCKET = process.env.MEDIA_BUCKET!;
const MINIMUM_TASK_DURATION_MS = 2 * 24 * 60 * 60 * 1000;

function normalizeTaskDueAt(scheduledAt: string, requestedDueAt?: string | null): string | null {
  const scheduledTime = new Date(scheduledAt).getTime();
  if (!Number.isFinite(scheduledTime)) return null;
  const requestedDueTime = requestedDueAt ? new Date(requestedDueAt).getTime() : Number.NaN;
  if (requestedDueAt && !Number.isFinite(requestedDueTime)) return null;
  const earliestDueTime = scheduledTime + MINIMUM_TASK_DURATION_MS;
  return new Date(requestedDueAt ? Math.max(requestedDueTime, earliestDueTime) : earliestDueTime).toISOString();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sendCrewEmail(to: string, name: string, task: Record<string, unknown>) {
  await ses.send(new SendEmailCommand({
    Source: SES_FROM_EMAIL,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: `CleanLoop Task Assignment: ${task.title}` },
      Body: {
        Html: {
          Data: `
            <h2>You've been assigned a task</h2>
            <p>Hi ${name},</p>
            <p>You have been assigned to the following CleanLoop task:</p>
            <table style="border-collapse:collapse">
              <tr><td style="padding:4px 8px;font-weight:bold">Title</td><td>${task.title}</td></tr>
              <tr><td style="padding:4px 8px;font-weight:bold">Description</td><td>${task.description ?? '-'}</td></tr>
              <tr><td style="padding:4px 8px;font-weight:bold">Scheduled</td><td>${task.scheduledAt}</td></tr>
              <tr><td style="padding:4px 8px;font-weight:bold">Due</td><td>${task.dueAt ?? '-'}</td></tr>
              <tr><td style="padding:4px 8px;font-weight:bold">Status</td><td>${task.status}</td></tr>
            </table>
            <p>Please log in to the CleanLoop app to view full details.</p>
            <p>The CleanLoop Team</p>
          `,
        },
      },
    },
  })).catch(e => console.error('SES send error:', e));
}

async function createNotification(
  userId: string,
  type: 'task_assigned' | 'task_updated' | 'task_overdue' | 'report_new' | 'general',
  title: string,
  body: string,
  taskId?: string,
  reportId?: string,
) {
  if (!NOTIFICATIONS_TABLE) return;
  const notificationId = crypto.randomUUID();
  await dbPut({
    TableName: NOTIFICATIONS_TABLE,
    Item: {
      notificationId,
      userId,
      type,
      title,
      body,
      read: false,
      taskId: taskId ?? null,
      reportId: reportId ?? null,
      createdAt: new Date().toISOString(),
    },
  }).catch(e => console.error('Failed to create notification:', e));
}

async function notifyCommunityTaskCompleted(task: Record<string, any>) {
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

    await Promise.allSettled((result.items ?? [])
      .filter(user => !!user.userId)
      .map(user => createNotification(
        user.userId as string,
        'task_updated',
        'Community cleanup completed',
        `The crew completed "${task.title}".`,
        task.taskId as string,
        ((task.reportIds as string[] | undefined) ?? [])[0],
      )));
    lastKey = result.lastKey as Record<string, unknown> | undefined;
  } while (lastKey);
}

// ── POST /tasks ───────────────────────────────────────────────────────────────
async function createTask(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!isAdmin(caller)) return forbidden('Admin only');

  const body = JSON.parse(event.body ?? '{}');
  const { title, description, reportIds = [], crewLeadId, scheduledAt, notes } = body;
  const dueAt = normalizeTaskDueAt(scheduledAt, body.dueAt);
  const crewIds: string[] = body.crewIds ?? body.crewMemberIds ?? [];

  if (!title || !scheduledAt) return badRequest('title and scheduledAt are required');
  if (!dueAt) return badRequest('scheduledAt and dueAt must be valid dates');

  const taskId = crypto.randomUUID();
  const now = new Date().toISOString();

  const task = {
    taskId,
    title,
    description: description ?? '',
    reportIds,
    crewIds,
    crewLeadId: crewLeadId ?? null,
    scheduledAt,
    dueAt,
    status: 'assigned',
    notes: notes ?? '',
    evidencePhotoKeys: [],
    createdBy: caller!.userId,
    createdAt: now,
    updatedAt: now,
  };

  await dbPut({ TableName: TASKS_TABLE, Item: task });

  for (const reportId of reportIds) {
    await dbUpdate({
      TableName: REPORTS_TABLE,
      Key: { reportId },
      UpdateExpression: 'SET #s = :s, assignedTaskId = :tid, updatedAt = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':s': 'assigned', ':tid': taskId, ':now': now },
    }).catch(e => console.error(`Failed to update report ${reportId}:`, e));
  }

  const allCrewIds = [...new Set([...(crewLeadId ? [crewLeadId] : []), ...crewIds])];

  if (allCrewIds.length > 0) {
    await Promise.allSettled(
      allCrewIds.map(async (userId: string) => {
        const user = await dbGet({ TableName: USERS_TABLE, Key: { userId } });
        if (!user) return;

        if (user.email) {
          await sendCrewEmail(user.email as string, user.name as string, task);
        }

        await createNotification(
          userId,
          'task_assigned',
          'New task assigned',
          `You have been assigned to "${title}" scheduled for ${new Date(scheduledAt).toLocaleDateString()}.`,
          taskId,
        );
      })
    );
  }

  return created({ task });
}

// ── GET /tasks ────────────────────────────────────────────────────────────────
async function listTasks(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!caller) return forbidden();

  const { status, limit = '500' } = event.queryStringParameters ?? {};

  if (isAdmin(caller)) {
    if (status) {
      const result = await dbQuery({
        TableName: TASKS_TABLE,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#s = :s',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':s': status },
        Limit: parseInt(limit),
      });
      return ok({ tasks: result.items, total: result.items.length });
    }
    const result = await dbScan({ TableName: TASKS_TABLE, Limit: parseInt(limit) });
    return ok({ tasks: result.items, total: result.items.length });
  }

  if (isCrew(caller)) {
    const leadResult = await dbQuery({
      TableName: TASKS_TABLE,
      IndexName: 'CrewIndex',
      KeyConditionExpression: 'crewLeadId = :uid',
      ExpressionAttributeValues: { ':uid': caller.userId },
      Limit: parseInt(limit),
    });

    const memberResult = await dbScan({
      TableName: TASKS_TABLE,
      FilterExpression: 'contains(crewIds, :uid)',
      ExpressionAttributeValues: { ':uid': caller.userId },
    });

    const seen = new Set<string>();
    const combined: Record<string, unknown>[] = [];
    for (const t of [...leadResult.items, ...memberResult.items]) {
      const id = t.taskId as string;
      if (!seen.has(id)) { seen.add(id); combined.push(t); }
    }

    return ok({ tasks: combined, total: combined.length });
  }

  return forbidden('Only admin or crew can list tasks');
}

// ── GET /tasks/{taskId} ───────────────────────────────────────────────────────
async function getTask(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!caller) return forbidden();

  const { taskId } = event.pathParameters ?? {};
  if (!taskId) return badRequest('taskId required');

  const task = await dbGet({ TableName: TASKS_TABLE, Key: { taskId } });
  if (!task) return notFound('Task not found');

  if (isCrew(caller) && !isAdmin(caller)) {
    const crewIds = (task.crewIds as string[]) ?? [];
    if (!crewIds.includes(caller.userId) && task.crewLeadId !== caller.userId) {
      return forbidden('Not assigned to this task');
    }
  }

  return ok({ task });
}

// ── PATCH /tasks/{taskId} ─────────────────────────────────────────────────────
async function updateTask(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!isAdmin(caller)) return forbidden('Admin only');

  const { taskId } = event.pathParameters ?? {};
  if (!taskId) return badRequest('taskId required');

  const body = JSON.parse(event.body ?? '{}');
  const allowed = ['title', 'description', 'reportIds', 'crewIds', 'crewLeadId', 'scheduledAt', 'dueAt', 'notes'];
  const updates: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ':now': new Date().toISOString() };

  for (const key of allowed) {
    if (key in body) {
      updates.push(`#${key} = :${key}`);
      names[`#${key}`] = key;
      values[`:${key}`] = body[key];
    }
  }

  if (updates.length === 0) return badRequest('No updatable fields provided');

  updates.push('updatedAt = :now');

  await dbUpdate({
    TableName: TASKS_TABLE,
    Key: { taskId },
    UpdateExpression: `SET ${updates.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ConditionExpression: 'attribute_exists(taskId)',
  });

  const existingTask = await dbGet({ TableName: TASKS_TABLE, Key: { taskId } });
  if (existingTask) {
    const allCrewIds = [...new Set([
      ...((existingTask.crewIds as string[]) ?? []),
      ...(existingTask.crewLeadId ? [existingTask.crewLeadId as string] : []),
    ])];
    await Promise.allSettled(
      allCrewIds.map(uid =>
        createNotification(
          uid,
          'task_updated',
          'Task updated',
          `The task "${existingTask.title}" has been updated by an administrator.`,
          taskId,
        )
      )
    );
  }

  return ok({ taskId, updated: Object.keys(body).filter(k => allowed.includes(k)) });
}

// ── PATCH /tasks/{taskId}/status ──────────────────────────────────────────────
async function updateTaskStatus(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!caller) return forbidden();

  const { taskId } = event.pathParameters ?? {};
  if (!taskId) return badRequest('taskId required');

  const { status, evidencePhotoKeys } = JSON.parse(event.body ?? '{}');
  const allowedAdmin = ['scheduled', 'assigned', 'in_progress', 'completed', 'cancelled'];
  const allowedCrew = ['in_progress', 'completed'];

  const task = await dbGet({ TableName: TASKS_TABLE, Key: { taskId } });
  if (!task) return notFound('Task not found');
  const notifyCommunity = status === 'completed' && task.status !== 'completed';

  if (isAdmin(caller)) {
    if (!allowedAdmin.includes(status)) return badRequest(`status must be one of: ${allowedAdmin.join(', ')}`);
  } else if (isCrew(caller)) {
    if (!allowedCrew.includes(status)) return badRequest(`crew can only set: ${allowedCrew.join(', ')}`);
    const crewIds = (task.crewIds as string[]) ?? [];
    if (!crewIds.includes(caller.userId) && task.crewLeadId !== caller.userId) {
      return forbidden('Not assigned to this task');
    }
  } else {
    return forbidden();
  }

  // Crew must provide at least one evidence photo to complete a task
  if (status === 'completed' && isCrew(caller) && !isAdmin(caller)) {
    const keys: string[] = Array.isArray(evidencePhotoKeys) ? evidencePhotoKeys : [];
    if (keys.length === 0) {
      return badRequest('At least one evidence photo is required to complete a task');
    }

    await dbUpdate({
      TableName: TASKS_TABLE,
      Key: { taskId },
      UpdateExpression: 'SET #s = :s, updatedAt = :now, completedAt = :now, evidencePhotoKeys = :keys',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':s': status,
        ':now': new Date().toISOString(),
        ':keys': keys,
      },
      ConditionExpression: 'attribute_exists(taskId)',
    });
  } else {
    await dbUpdate({
      TableName: TASKS_TABLE,
      Key: { taskId },
      UpdateExpression: status === 'completed'
        ? 'SET #s = :s, updatedAt = :now, completedAt = :now'
        : 'SET #s = :s, updatedAt = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':s': status, ':now': new Date().toISOString() },
      ConditionExpression: 'attribute_exists(taskId)',
    });
  }

  if (status === 'completed') {
    await Promise.allSettled(
      ((task.reportIds as string[]) ?? []).map(reportId => dbUpdate({
        TableName: REPORTS_TABLE,
        Key: { reportId },
        UpdateExpression: 'SET #s = :resolved, completedAt = :now, updatedAt = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':resolved': 'resolved', ':now': new Date().toISOString() },
        ConditionExpression: 'attribute_exists(reportId)',
      }))
    );
    if (notifyCommunity) {
      await notifyCommunityTaskCompleted(task)
        .catch(error => console.error('Community task-completion notification error:', error));
    }
  }

  const allCrewIds = [...new Set([
    ...((task.crewIds as string[]) ?? []),
    ...(task.crewLeadId ? [task.crewLeadId as string] : []),
  ])];

  const statusLabels: Record<string, string> = {
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    scheduled: 'Scheduled',
    assigned: 'Assigned',
  };

  await Promise.allSettled(
    allCrewIds
      .filter(uid => uid !== caller!.userId)
      .map(uid =>
        createNotification(
          uid,
          'task_updated',
          `Task ${statusLabels[status] ?? status}`,
          `"${task.title}" has been marked as ${statusLabels[status] ?? status}.`,
          taskId,
        )
      )
  );

  return ok({ taskId, status });
}

// ── GET /tasks/{taskId}/evidence-upload ───────────────────────────────────────
async function getEvidenceUploadUrl(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!caller) return forbidden();

  const { taskId } = event.pathParameters ?? {};
  if (!taskId) return badRequest('taskId required');

  const task = await dbGet({ TableName: TASKS_TABLE, Key: { taskId } });
  if (!task) return notFound('Task not found');

  if (isCrew(caller) && !isAdmin(caller)) {
    const crewIds = (task.crewIds as string[]) ?? [];
    if (!crewIds.includes(caller.userId) && task.crewLeadId !== caller.userId) {
      return forbidden('Not assigned to this task');
    }
  }

  const { contentType = 'image/jpeg', filename = 'evidence.jpg' } = event.queryStringParameters ?? {};
  const ext = filename.split('.').pop() ?? 'jpg';
  const key = `evidence/${taskId}/${crypto.randomUUID()}.${ext}`;

  const url = await getPresignedPutUrl(MEDIA_BUCKET, key, contentType);

  return ok({ url, key });
}

// ── GET /tasks/{taskId}/evidence-photos ───────────────────────────────────────
async function getEvidencePhotos(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!caller) return forbidden();

  const { taskId } = event.pathParameters ?? {};
  if (!taskId) return badRequest('taskId required');

  const task = await dbGet({ TableName: TASKS_TABLE, Key: { taskId } });
  if (!task) return notFound('Task not found');

  if (isCrew(caller) && !isAdmin(caller)) {
    const crewIds = (task.crewIds as string[]) ?? [];
    if (!crewIds.includes(caller.userId) && task.crewLeadId !== caller.userId) {
      return forbidden('Not assigned to this task');
    }
  }

  const keys: string[] = (task.evidencePhotoKeys as string[]) ?? [];
  const urls = await Promise.all(
    keys.map(key => getPresignedGetUrl(MEDIA_BUCKET, key))
  );

  return ok({ photos: urls.map((url, i) => ({ url, key: keys[i] })) });
}

async function deleteEvidencePhoto(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!caller) return forbidden();

  const { taskId } = event.pathParameters ?? {};
  const { key } = JSON.parse(event.body ?? '{}');
  if (!taskId || typeof key !== 'string' || !key.startsWith(`evidence/${taskId}/`)) {
    return badRequest('A valid evidence photo key is required');
  }

  const task = await dbGet({ TableName: TASKS_TABLE, Key: { taskId } });
  if (!task) return notFound('Task not found');

  if (!isAdmin(caller)) {
    const crewIds = (task.crewIds as string[]) ?? [];
    if (!isCrew(caller) || (!crewIds.includes(caller.userId) && task.crewLeadId !== caller.userId)) {
      return forbidden('Not assigned to this task');
    }
    if (task.status === 'completed' || task.status === 'cancelled') {
      return forbidden('Evidence can only be removed before task completion');
    }
    if (((task.evidencePhotoKeys as string[]) ?? []).includes(key)) {
      return forbidden('Submitted task evidence cannot be removed by crew');
    }
  }

  await s3.send(new DeleteObjectCommand({ Bucket: MEDIA_BUCKET, Key: key }));
  return ok({ taskId, key, deleted: true });
}

// ── DELETE /tasks/{taskId} ────────────────────────────────────────────────────
async function deleteTask(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!isAdmin(caller)) return forbidden('Admin only');

  const { taskId } = event.pathParameters ?? {};
  if (!taskId) return badRequest('taskId required');

  const task = await dbGet({ TableName: TASKS_TABLE, Key: { taskId } });
  if (!task) return notFound('Task not found');

  const reportIds = (task.reportIds as string[]) ?? [];
  const now = new Date().toISOString();
  for (const reportId of reportIds) {
    await dbUpdate({
      TableName: REPORTS_TABLE,
      Key: { reportId },
      UpdateExpression: 'SET #s = :s, updatedAt = :now REMOVE assignedTaskId',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':s': 'pending', ':now': now },
    }).catch(e => console.error(`Failed to unlink report ${reportId}:`, e));
  }

  const allCrewIds = [...new Set([
    ...((task.crewIds as string[]) ?? []),
    ...(task.crewLeadId ? [task.crewLeadId as string] : []),
  ])];
  await Promise.allSettled(
    allCrewIds.map(uid =>
      createNotification(
        uid,
        'task_updated',
        'Task removed',
        `The task "${task.title}" has been removed by an administrator.`,
        taskId,
      )
    )
  );

  await dbDelete({ TableName: TASKS_TABLE, Key: { taskId } });

  return ok({ taskId, deleted: true });
}

// ── Router ────────────────────────────────────────────────────────────────────
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const { httpMethod, resource } = event;
    console.log(`${httpMethod} ${resource}`);

    if (httpMethod === 'POST'   && resource === '/tasks')                           return createTask(event);
    if (httpMethod === 'GET'    && resource === '/tasks')                           return listTasks(event);
    if (httpMethod === 'GET'    && resource === '/tasks/{taskId}')                  return getTask(event);
    if (httpMethod === 'PATCH'  && resource === '/tasks/{taskId}')                  return updateTask(event);
    if (httpMethod === 'PATCH'  && resource === '/tasks/{taskId}/status')           return updateTaskStatus(event);
    if (httpMethod === 'GET'    && resource === '/tasks/{taskId}/evidence-upload')  return getEvidenceUploadUrl(event);
    if (httpMethod === 'GET'    && resource === '/tasks/{taskId}/evidence-photos')  return getEvidencePhotos(event);
    if (httpMethod === 'DELETE' && resource === '/tasks/{taskId}/evidence-photos')  return deleteEvidencePhoto(event);
    if (httpMethod === 'DELETE' && resource === '/tasks/{taskId}')                  return deleteTask(event);

    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not found' }) };
  } catch (e) {
    console.error('Unhandled error:', e);
    return serverError();
  }
}