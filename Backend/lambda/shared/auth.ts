import { APIGatewayProxyEvent } from 'aws-lambda';

export interface CallerIdentity {
  userId: string;
  email: string;
  role: string;
  groups: string[];
  sub: string;
}

export function getCaller(event: APIGatewayProxyEvent): CallerIdentity | null {
  const claims = event.requestContext?.authorizer?.claims;
  if (!claims) return null;

  const groups: string[] = (() => {
    const g = claims['cognito:groups'];
    if (!g) return [];
    if (Array.isArray(g)) return g;
    if (typeof g === 'string') {
      try { return JSON.parse(g); } catch { return [g]; }
    }
    return [];
  })();

  const role =
    claims['custom:role'] ??
    (groups.includes('ADMIN') ? 'ADMIN' : groups.includes('CREW') ? 'CREW' : 'CITIZEN');

  return {
    userId: claims['sub'],
    sub: claims['sub'],
    email: claims['email'] ?? '',
    role,
    groups,
  };
}

export function isAdmin(caller: CallerIdentity | null): boolean {
  return caller?.role === 'ADMIN' || caller?.groups.includes('ADMIN') === true;
}

export function isCrew(caller: CallerIdentity | null): boolean {
  return caller?.role === 'CREW' || caller?.groups.includes('CREW') === true;
}

export function isCitizen(caller: CallerIdentity | null): boolean {
  return !isAdmin(caller) && !isCrew(caller);
}
