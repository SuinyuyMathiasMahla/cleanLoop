import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  ListUsersInGroupCommand,
  GetGroupCommand,
  CreateGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ok, created, badRequest, forbidden, notFound, serverError, conflict } from '../shared/response';
import { dbGet, dbUpdate } from '../shared/dynamo';
import { getCaller, isAdmin } from '../shared/auth';

const cognito = new CognitoIdentityProviderClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USER_POOL_ID = process.env.USER_POOL_ID!;
const USERS_TABLE  = process.env.USERS_TABLE!;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? '';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureCrewGroup() {
  try {
    await cognito.send(new GetGroupCommand({ UserPoolId: USER_POOL_ID, GroupName: 'CREW' }));
  } catch (e: any) {
    if (e.name === 'ResourceNotFoundException') {
      await cognito.send(new CreateGroupCommand({
        UserPoolId: USER_POOL_ID,
        GroupName: 'CREW',
        Description: 'Waste collection crew members',
      }));
    } else {
      throw e;
    }
  }
}

function sanitisePhone(phone: string): string {
  return phone.replace(/[\s\-().]/g, '');
}

/**
 * Geocode a free-text location to lat/lng using Google Maps Geocoding API.
 * Appends ", Buea, Cameroon" to every query so partial addresses resolve correctly.
 */
async function geocodeLocation(locationText: string): Promise<{ lat: number; lng: number } | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn('GOOGLE_MAPS_API_KEY not set — skipping geocoding');
    return null;
  }
  try {
    const query = encodeURIComponent(`${locationText}, Buea, Cameroon`);
    const url   = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${GOOGLE_MAPS_API_KEY}`;
    const res   = await fetch(url);
    const data  = await res.json() as any;
    if (data.status === 'OK' && data.results?.[0]) {
      const { lat, lng } = data.results[0].geometry.location;
      return { lat: Number(lat), lng: Number(lng) };
    }
    console.warn('Geocoding returned no results for:', locationText, '— status:', data.status);
    return null;
  } catch (e) {
    console.error('Geocoding error:', e);
    return null;
  }
}

// ── POST /crew ────────────────────────────────────────────────────────────────
async function createCrew(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!isAdmin(caller)) return forbidden('Admin only');

  const { name, email, phone, location, locationLat: latitudeInput, locationLng: longitudeInput, temporaryPassword } = JSON.parse(event.body ?? '{}');

  if (!name || !email || !temporaryPassword) {
    return badRequest('name, email, and temporaryPassword are required');
  }
  if (!location?.trim()) return badRequest('A crew location in Buea is required for distance-based assignment');

  await ensureCrewGroup();

  // Geocode location before creating the user so we can fail fast if needed
  let coords: { lat: number; lng: number } | null = null;
  if (latitudeInput !== undefined || longitudeInput !== undefined) {
    const lat = Number(latitudeInput);
    const lng = Number(longitudeInput);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return badRequest('Latitude and longitude must both be valid coordinates.');
    }
    coords = { lat, lng };
  } else {
    coords = await geocodeLocation(location.trim());
    if (!coords) {
      return badRequest('Google geocoding is unavailable. Enter latitude and longitude, or enable billing for the Google Geocoding API.');
    }
  }
  const locationLat = coords.lat;
  const locationLng = coords.lng;

  let cognitoUser: any;
  try {
    cognitoUser = await cognito.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      TemporaryPassword: temporaryPassword,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email',          Value: email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'name',           Value: name },
        ...(phone ? [{ Name: 'phone_number', Value: sanitisePhone(phone) }] : []),
        { Name: 'custom:role',    Value: 'crew' },
      ],
    }));
  } catch (e: any) {
    if (e.name === 'UsernameExistsException') return conflict('A user with that email already exists');
    console.error('AdminCreateUser error:', e);
    return serverError(`Failed to create Cognito user: ${e.message}`);
  }

  const cognitoUsername = cognitoUser.User!.Username!;
  let userId = cognitoUser.User!.Attributes?.find((attribute: any) => attribute.Name === 'sub')?.Value;
  if (!userId) {
    const userDetails = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: cognitoUsername }));
    userId = userDetails.UserAttributes?.find(attribute => attribute.Name === 'sub')?.Value;
  }
  if (!userId) return serverError('Could not resolve the crew member Cognito subject');

  try {
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: cognitoUsername,
      GroupName: 'CREW',
    }));
  } catch (e: any) {
    console.error('AdminAddUserToGroup error:', e);
    return serverError(`User created but failed to add to CREW group: ${e.message}`);
  }

  try {
    await cognito.send(new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: cognitoUsername,
      Password: temporaryPassword,
      Permanent: true,
    }));
  } catch (e: any) {
    console.error('AdminSetUserPassword error:', e);
  }

  // Persist crew profile (including location) to DynamoDB
  const now = new Date().toISOString();
  const crewProfile: Record<string, any> = {
    userId,
    cognitoUsername,
    role: 'crew',
    name,
    email,
    phone: phone ? sanitisePhone(phone) : null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  if (location?.trim())  crewProfile.locationText = location.trim();
  if (locationLat !== null) crewProfile.locationLat = locationLat;
  if (locationLng !== null) crewProfile.locationLng = locationLng;

  await ddb.send(new PutCommand({ TableName: USERS_TABLE, Item: crewProfile }));

  return created({
    crew: {
      crewId: userId,
      cognitoUsername,
      name,
      email,
      phone: phone ? sanitisePhone(phone) : null,
      location:     location?.trim() ?? null,
      locationLat,
      locationLng,
      status: 'active',
      activeTasks: 0,
      lastLogin: null,
    },
  });
}

// ── GET /crew ─────────────────────────────────────────────────────────────────
async function listCrew(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!isAdmin(caller)) return forbidden('Admin only');

  const result = await cognito.send(new ListUsersInGroupCommand({
    UserPoolId: USER_POOL_ID,
    GroupName: 'CREW',
  }));

  // Fetch DynamoDB profiles in parallel for location data
  const cognitoUsers = result.Users ?? [];
  const profileMap = new Map<string, any>();

  if (cognitoUsers.length > 0) {
    const scan = await ddb.send(new ScanCommand({
      TableName: USERS_TABLE,
      FilterExpression: '#r IN (:crew, :crewUpper)',
      ExpressionAttributeNames: { '#r': 'role' },
      ExpressionAttributeValues: { ':crew': 'crew', ':crewUpper': 'CREW' },
    }));
    (scan.Items ?? []).forEach(p => {
      profileMap.set(p.userId, p);
      if (p.cognitoUsername) profileMap.set(p.cognitoUsername, p);
    });
  }

  const users = await Promise.all(cognitoUsers.map(async (u) => {
    const attr = (name: string) =>
      u.Attributes?.find((a) => a.Name === name)?.Value ?? null;
    const cognitoUsername = u.Username!;
    const userId = attr('sub') ?? profileMap.get(cognitoUsername)?.userId ?? cognitoUsername;
    let profile = profileMap.get(cognitoUsername) ?? profileMap.get(userId) ?? {};
    if (profile.userId !== userId || profile.cognitoUsername !== cognitoUsername) {
      profile = {
        ...profile,
        userId,
        cognitoSub: userId,
        cognitoUsername,
        role: 'CREW',
        name: profile.name ?? attr('name') ?? '',
        email: profile.email ?? attr('email') ?? '',
        phone: profile.phone ?? attr('phone_number') ?? null,
        status: u.Enabled ? 'active' : 'inactive',
        createdAt: profile.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await ddb.send(new PutCommand({ TableName: USERS_TABLE, Item: profile }));
      profileMap.set(userId, profile);
    }
    return {
      crewId:      userId,
      cognitoUsername,
      name:        attr('name') ?? '',
      email:       attr('email') ?? '',
      phone:       attr('phone_number') ?? null,
      location:    profile.locationText ?? null,
      locationLat: profile.locationLat  ?? null,
      locationLng: profile.locationLng  ?? null,
      status:      u.Enabled ? 'active' : 'inactive',
      lastLogin:   u.UserLastModifiedDate?.toISOString() ?? null,
      activeTasks: 0,
    };
  }));

  return ok({ crew: users, total: users.length });
}

// ── GET /crew/{userId} ────────────────────────────────────────────────────────
async function getCrewMember(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!isAdmin(caller)) return forbidden('Admin only');

  const { userId } = event.pathParameters ?? {};
  if (!userId) return badRequest('userId required');

  try {
    const profileRes = await ddb.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId } }));
    const profile = profileRes.Item ?? {};
    const cognitoUsername = profile.cognitoUsername ?? await findCognitoUsername(userId);
    const user = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: cognitoUsername }));

    const attr = (name: string) =>
      user.UserAttributes?.find((a) => a.Name === name)?.Value ?? null;

    return ok({
      crew: {
        crewId:      userId,
        cognitoUsername: user.Username!,
        name:        attr('name') ?? '',
        email:       attr('email') ?? '',
        phone:       attr('phone_number') ?? null,
        location:    profile.locationText ?? null,
        locationLat: profile.locationLat  ?? null,
        locationLng: profile.locationLng  ?? null,
        status:      user.Enabled ? 'active' : 'inactive',
        lastLogin:   null,
        activeTasks: 0,
      },
    });
  } catch (e: any) {
    if (e.name === 'UserNotFoundException') return notFound('Crew member not found');
    throw e;
  }
}

async function updateCrewLocation(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!isAdmin(caller)) return forbidden('Admin only');

  const { userId } = event.pathParameters ?? {};
  const { location, locationLat: latitudeInput, locationLng: longitudeInput } = JSON.parse(event.body ?? '{}');
  if (!userId || typeof location !== 'string' || !location.trim()) {
    return badRequest('userId and location are required');
  }

  const profile = await dbGet({ TableName: USERS_TABLE, Key: { userId } });
  if (!profile || !profile.cognitoUsername) return notFound('Crew member not found');
  let coords: { lat: number; lng: number } | null = null;
  if (latitudeInput !== undefined || longitudeInput !== undefined) {
    const lat = Number(latitudeInput);
    const lng = Number(longitudeInput);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return badRequest('Latitude and longitude must both be valid coordinates.');
    }
    coords = { lat, lng };
  } else {
    coords = await geocodeLocation(location.trim());
    if (!coords) {
      return badRequest('Google geocoding is unavailable. Enter latitude and longitude, or enable billing for the Google Geocoding API.');
    }
  }

  await dbUpdate({
    TableName: USERS_TABLE,
    Key: { userId },
    UpdateExpression: 'SET locationText = :location, locationLat = :lat, locationLng = :lng, updatedAt = :now',
    ExpressionAttributeValues: {
      ':location': location.trim(), ':lat': coords.lat, ':lng': coords.lng, ':now': new Date().toISOString(),
    },
  });

  return ok({ crewId: userId, location: location.trim(), locationLat: coords.lat, locationLng: coords.lng });
}

// ── DELETE /crew/{userId} ─────────────────────────────────────────────────────
async function deactivateCrew(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const caller = getCaller(event);
  if (!isAdmin(caller)) return forbidden('Admin only');

  const { userId } = event.pathParameters ?? {};
  if (!userId) return badRequest('userId required');

  try {
    const profile = await ddb.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId } }));
    const cognitoUsername = profile.Item?.cognitoUsername ?? await findCognitoUsername(userId);
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: cognitoUsername }));
  } catch (e: any) {
    if (e.name === 'UserNotFoundException') return notFound('Crew member not found');
    console.error('AdminDeleteUser error:', e);
    throw e;
  }

  return ok({ userId, status: 'deleted' });
}

async function findCognitoUsername(userId: string): Promise<string> {
  const result = await cognito.send(new ListUsersInGroupCommand({ UserPoolId: USER_POOL_ID, GroupName: 'CREW' }));
  const match = (result.Users ?? []).find(user =>
    user.Attributes?.some(attribute => attribute.Name === 'sub' && attribute.Value === userId),
  );
  return match?.Username ?? userId;
}

// ── Router ────────────────────────────────────────────────────────────────────
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const { httpMethod, resource } = event;
    console.log(`${httpMethod} ${resource}`);

    if (httpMethod === 'POST'   && resource === '/crew')           return createCrew(event);
    if (httpMethod === 'GET'    && resource === '/crew')           return listCrew(event);
    if (httpMethod === 'GET'    && resource === '/crew/{userId}')  return getCrewMember(event);
    if (httpMethod === 'PATCH'  && resource === '/crew/{userId}')  return updateCrewLocation(event);
    if (httpMethod === 'DELETE' && resource === '/crew/{userId}')  return deactivateCrew(event);

    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not found' }) };
  } catch (e: any) {
    console.error('Unhandled error:', e);
    return serverError(e.message ?? 'Internal server error');
  }
}