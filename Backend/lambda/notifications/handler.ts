import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { dbGet, dbPut, dbUpdate, dbQuery, dbScan, dbDelete } from '../shared/dynamo';
import { ok, created, badRequest, forbidden, notFound, serverError } from '../shared/response';
import { getCaller, isAdmin } from '../shared/auth';

const NOTIFICATIONS_TABLE = process.env.NOTIFICATIONS_TABLE!;
const USERS_TABLE = process.env.USERS_TABLE!;

// ── GET /notifications ────────────────────────────────────────────────────────
async function listNotifications(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!caller) return forbidden();

  console.log('[listNotifications] caller userId:', caller.userId);

  const { limit = '50', lastKey, unreadOnly } = event.queryStringParameters ?? {};

  const queryParams: Parameters<typeof dbQuery>[0] = {
    TableName: NOTIFICATIONS_TABLE,
    IndexName: 'UserIndex',
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': caller.userId },
    ScanIndexForward: false,
    Limit: parseInt(limit),
    ...(lastKey ? { ExclusiveStartKey: JSON.parse(Buffer.from(lastKey, 'base64').toString()) } : {}),
  };

  if (unreadOnly === 'true') {
    queryParams.FilterExpression = '#r = :false';
    queryParams.ExpressionAttributeNames = { '#r': 'read' };
    queryParams.ExpressionAttributeValues = {
      ...queryParams.ExpressionAttributeValues,
      ':false': false,
    };
  }

  const result = await dbQuery(queryParams);

  const items = (result.items ?? []).map(n => ({
    ...n,
    id: n.notificationId as string,
    // Normalize date — Lambda saves createdAt, sent_log also saves sentAt
    sentAt: (n.sentAt ?? n.createdAt) as string,
    // Normalize count — sent_log saves sentCount, expose as totalCount
    totalCount: (n.totalCount ?? n.sentCount ?? undefined) as number | undefined,
  }));

  console.log('[listNotifications] returning', items.length, 'items for userId:', caller.userId);

  return ok({
    data: items,
    notifications: items,
    nextKey: result.lastKey
      ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
      : null,
  });
}

// ── PATCH /notifications/{notificationId}/read ────────────────────────────────
async function markAsRead(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!caller) return forbidden();

  const { notificationId } = event.pathParameters ?? {};
  if (!notificationId) return badRequest('notificationId required');

  const notif = await dbGet({ TableName: NOTIFICATIONS_TABLE, Key: { notificationId } });
  if (!notif) return notFound('Notification not found');
  if (notif.userId !== caller.userId && !isAdmin(caller)) return forbidden('Not your notification');

  await dbUpdate({
    TableName: NOTIFICATIONS_TABLE,
    Key: { notificationId },
    UpdateExpression: 'SET #r = :true',
    ExpressionAttributeNames: { '#r': 'read' },
    ExpressionAttributeValues: { ':true': true },
  });

  return ok({ notificationId, read: true });
}

// ── POST /notifications/read-all ──────────────────────────────────────────────
async function markAllRead(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!caller) return forbidden();

  const result = await dbQuery({
    TableName: NOTIFICATIONS_TABLE,
    IndexName: 'UserIndex',
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: '#r = :false',
    ExpressionAttributeNames: { '#r': 'read' },
    ExpressionAttributeValues: { ':uid': caller.userId, ':false': false },
  });

  const items = result.items ?? [];
  await Promise.allSettled(
    items.map(n =>
      dbUpdate({
        TableName: NOTIFICATIONS_TABLE,
        Key: { notificationId: n.notificationId },
        UpdateExpression: 'SET #r = :true',
        ExpressionAttributeNames: { '#r': 'read' },
        ExpressionAttributeValues: { ':true': true },
      })
    )
  );

  return ok({ updated: items.length });
}

// ── DELETE /notifications/{notificationId} ────────────────────────────────────
async function deleteNotification(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!caller) return forbidden();

  const { notificationId } = event.pathParameters ?? {};
  if (!notificationId) return badRequest('notificationId required');

  const notif = await dbGet({ TableName: NOTIFICATIONS_TABLE, Key: { notificationId } });
  if (!notif) return notFound('Notification not found');
  if (notif.userId !== caller.userId && !isAdmin(caller)) return forbidden('Not your notification');

  await dbDelete({ TableName: NOTIFICATIONS_TABLE, Key: { notificationId } });
  return ok({ notificationId, deleted: true });
}

// ── POST /notifications/send — Admin broadcast ────────────────────────────────
async function sendNotification(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!isAdmin(caller)) return forbidden('Admin only');

  const body = JSON.parse(event.body ?? '{}');
  const { title, message, type = 'general', referenceId, recipients } = body;

  if (!title || !message) return badRequest('title and message are required');

  console.log('[sendNotification] recipients:', recipients);

  // Build scan filter based on recipients value
  const scanParams: Parameters<typeof dbScan>[0] = { TableName: USERS_TABLE };

  if (recipients === 'all_citizens') {
    // Match role = citizen OR CITIZEN
    scanParams.FilterExpression = '#r = :lower OR #r = :upper OR #ut = :lower OR #ut = :upper';
    scanParams.ExpressionAttributeNames = { '#r': 'role', '#ut': 'userType' };
    scanParams.ExpressionAttributeValues = { ':lower': 'citizen', ':upper': 'CITIZEN' };
  } else if (recipients === 'all_crew') {
    scanParams.FilterExpression = '#r = :lower OR #r = :upper OR #ut = :lower OR #ut = :upper';
    scanParams.ExpressionAttributeNames = { '#r': 'role', '#ut': 'userType' };
    scanParams.ExpressionAttributeValues = { ':lower': 'crew', ':upper': 'CREW' };
  }
  // all_users → no filter, scan returns everyone

  const { items: users } = await dbScan(scanParams);

  console.log('[sendNotification] Users found:', users.length);
  console.log('[sendNotification] Sample users:', JSON.stringify(
    users.slice(0, 3).map(u => ({ userId: u.userId, role: u.role, userType: u.userType }))
  ));

  if (users.length === 0) {
    console.warn('[sendNotification] No users matched filter — check Users table role field values');
    return ok({ sent: 0, message: 'No users matched the recipient filter' });
  }

  const now = new Date().toISOString();
  let sent = 0;

  // Write one notification record per user
  await Promise.allSettled(
    users.map(async (user) => {
      if (!user.userId) return;
      await dbPut({
        TableName: NOTIFICATIONS_TABLE,
        Item: {
          notificationId: crypto.randomUUID(),
          userId: user.userId,
          title,
          body: message,
          message,
          type,
          referenceId: referenceId ?? null,
          read: false,
          createdAt: now,
        },
      });
      sent++;
    })
  );

  // Write a sent_log record for the admin so history survives page reload
  await dbPut({
    TableName: NOTIFICATIONS_TABLE,
    Item: {
      notificationId: crypto.randomUUID(),
      userId: caller.userId,
      title,
      body: message,
      message,
      type: 'sent_log',
      recipients,
      sentCount: sent,
      totalCount: sent,
      sentAt: now,
      createdAt: now,
      read: true,
    },
  });

  console.log('[sendNotification] Saved', sent, 'notification(s) + 1 sent_log');
  return ok({ sent, message: `Notification sent to ${sent} users` });
}

// ── POST /notifications — single targeted notification (admin) ────────────────
async function createNotification(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!isAdmin(caller)) return forbidden('Admin only');

  const body = JSON.parse(event.body ?? '{}');
  const { userId, title, message, type = 'info', referenceId } = body;

  if (!userId || !title || !message) return badRequest('userId, title, and message are required');

  const now = new Date().toISOString();
  const notification = {
    notificationId: crypto.randomUUID(),
    userId,
    title,
    body: message,
    message,
    type,
    referenceId: referenceId ?? null,
    read: false,
    createdAt: now,
  };

  await dbPut({ TableName: NOTIFICATIONS_TABLE, Item: notification });
  return created({ notification });
}

// ── Router ────────────────────────────────────────────────────────────────────
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const { httpMethod, resource } = event;
    console.log(`[handler] ${httpMethod} ${resource}`);

    if (httpMethod === 'GET'    && resource === '/notifications')                        return listNotifications(event);
    if (httpMethod === 'POST'   && resource === '/notifications')                        return createNotification(event);
    if (httpMethod === 'POST'   && resource === '/notifications/send')                   return sendNotification(event);
    if (httpMethod === 'POST'   && resource === '/notifications/read-all')               return markAllRead(event);
    if (httpMethod === 'PATCH'  && resource === '/notifications/{notificationId}/read')  return markAsRead(event);
    if (httpMethod === 'DELETE' && resource === '/notifications/{notificationId}')       return deleteNotification(event);

    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Not found' }),
    };
  } catch (e) {
    console.error('[handler] Unhandled error:', e);
    return serverError();
  }
}