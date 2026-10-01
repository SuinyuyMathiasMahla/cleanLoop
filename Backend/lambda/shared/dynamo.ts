import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  GetCommandInput,
  PutCommandInput,
  UpdateCommandInput,
  DeleteCommandInput,
  QueryCommandInput,
  ScanCommandInput,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export async function dbGet(params: GetCommandInput) {
  const result = await ddb.send(new GetCommand(params));
  return result.Item;
}

export async function dbPut(params: PutCommandInput) {
  return ddb.send(new PutCommand(params));
}

export async function dbUpdate(params: UpdateCommandInput) {
  return ddb.send(new UpdateCommand(params));
}

export async function dbDelete(params: DeleteCommandInput) {
  return ddb.send(new DeleteCommand(params));
}

export async function dbQuery(params: QueryCommandInput) {
  const result = await ddb.send(new QueryCommand(params));
  return { items: result.Items ?? [], lastKey: result.LastEvaluatedKey };
}

export async function dbScan(params: ScanCommandInput) {
  const result = await ddb.send(new ScanCommand(params));
  return { items: result.Items ?? [], lastKey: result.LastEvaluatedKey };
}
