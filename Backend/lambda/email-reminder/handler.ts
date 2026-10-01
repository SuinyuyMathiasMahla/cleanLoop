import { ScheduledEvent } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { dbGet, dbScan, dbPut, dbUpdate } from '../shared/dynamo';

const ses = new SESClient({});
const TASKS_TABLE = process.env.TASKS_TABLE!;
const USERS_TABLE = process.env.USERS_TABLE!;
const NOTIFICATIONS_TABLE = process.env.NOTIFICATIONS_TABLE!;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL!;

export async function handler(event: ScheduledEvent): Promise<void> {
  console.log('Email reminder job started:', new Date().toISOString());

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // Find tasks due within the next 24 hours that are scheduled or in_progress
  const { items: tasks } = await dbScan({
    TableName: TASKS_TABLE,
    FilterExpression: '#s IN (:scheduled, :inprog) AND dueAt <= :cutoff AND dueAt >= :now',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':scheduled': 'scheduled',
      ':inprog': 'in_progress',
      ':cutoff': in24h,
      ':now': now.toISOString(),
    },
  });

  console.log(`Found ${tasks.length} tasks due within 24h`);

  for (const task of tasks) {
    const crewIds: string[] = [...((task.crewIds as string[]) ?? [])];
    if (task.crewLeadId && !crewIds.includes(task.crewLeadId as string)) {
      crewIds.push(task.crewLeadId as string);
    }

    for (const userId of crewIds) {
      try {
        const user = await dbGet({ TableName: USERS_TABLE, Key: { userId } });
        if (!user?.email) continue;

        const dueDate = new Date(task.dueAt as string).toLocaleString('en-US', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'UTC',
        });

        await ses.send(new SendEmailCommand({
          Source: SES_FROM_EMAIL,
          Destination: { ToAddresses: [user.email as string] },
          Message: {
            Subject: { Data: `Reminder: Task "${task.title}" is due soon` },
            Body: {
              Html: {
                Data: `
                  <h2>Task Reminder</h2>
                  <p>Hi ${user.name ?? 'Crew Member'},</p>
                  <p>This is a reminder that the following CleanLoop task is due soon:</p>
                  <table style="border-collapse:collapse;margin:16px 0">
                    <tr style="background:#f5f5f5">
                      <td style="padding:8px 12px;font-weight:bold;border:1px solid #ddd">Task</td>
                      <td style="padding:8px 12px;border:1px solid #ddd">${task.title}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 12px;font-weight:bold;border:1px solid #ddd">Description</td>
                      <td style="padding:8px 12px;border:1px solid #ddd">${task.description ?? '-'}</td>
                    </tr>
                    <tr style="background:#f5f5f5">
                      <td style="padding:8px 12px;font-weight:bold;border:1px solid #ddd">Due</td>
                      <td style="padding:8px 12px;border:1px solid #ddd;color:#d32f2f;font-weight:bold">${dueDate} UTC</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 12px;font-weight:bold;border:1px solid #ddd">Status</td>
                      <td style="padding:8px 12px;border:1px solid #ddd">${task.status}</td>
                    </tr>
                  </table>
                  <p>Please log in to the CleanLoop app to view details and update your status.</p>
                  <p style="color:#666;font-size:12px">This reminder was sent automatically by CleanLoop.</p>
                  <p>The CleanLoop Team</p>
                `,
              },
              Text: {
                Data: `Reminder: Task "${task.title}" is due ${dueDate} UTC.\n\nStatus: ${task.status}\n\nLog in to CleanLoop for details.`,
              },
            },
          },
        }));

        console.log(`Reminder sent to ${user.email} for task ${task.taskId}`);
      } catch (e) {
        console.error(`Failed to send reminder to user ${userId} for task ${task.taskId}:`, e);
      }
    }
  }

  const { items: overdueTasks } = await dbScan({
    TableName: TASKS_TABLE,
    FilterExpression: '#s IN (:assigned, :scheduled, :inprog) AND dueAt <= :now AND attribute_not_exists(overdueAlertSentAt)',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':assigned': 'assigned', ':scheduled': 'scheduled', ':inprog': 'in_progress', ':now': now.toISOString(),
    },
  });
  const { items: admins } = await dbScan({
    TableName: USERS_TABLE,
    FilterExpression: '#r IN (:admin, :adminUpper)',
    ExpressionAttributeNames: { '#r': 'role' },
    ExpressionAttributeValues: { ':admin': 'admin', ':adminUpper': 'ADMIN' },
  });

  for (const task of overdueTasks) {
    const recipients = new Set<string>([
      ...((task.crewIds as string[]) ?? []),
      ...(task.crewLeadId ? [task.crewLeadId as string] : []),
      ...admins.map(admin => admin.userId as string),
    ]);
    const notifications = await Promise.allSettled([...recipients].map(userId => dbPut({
      TableName: NOTIFICATIONS_TABLE,
      Item: {
        notificationId: `overdue-${task.taskId}-${userId}`,
        userId,
        type: 'task_overdue',
        title: 'Task overdue',
        body: `Task "${task.title}" passed its due time without being completed.`,
        taskId: task.taskId,
        read: false,
        createdAt: now.toISOString(),
      },
    })));
    if (notifications.every(result => result.status === 'fulfilled')) {
      await dbUpdate({
        TableName: TASKS_TABLE,
        Key: { taskId: task.taskId },
        UpdateExpression: 'SET overdueAlertSentAt = :now',
        ExpressionAttributeValues: { ':now': now.toISOString() },
      });
    }
  }

  console.log('Email reminder job complete');
}
