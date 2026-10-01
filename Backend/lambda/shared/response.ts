export const cors = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json',
});

export const ok = (body: unknown) => ({
  statusCode: 200,
  headers: cors(),
  body: JSON.stringify(body),
});

export const created = (body: unknown) => ({
  statusCode: 201,
  headers: cors(),
  body: JSON.stringify(body),
});

export const noContent = () => ({
  statusCode: 204,
  headers: cors(),
  body: '',
});

export const err = (code: number, msg: string) => ({
  statusCode: code,
  headers: cors(),
  body: JSON.stringify({ error: msg }),
});

export const badRequest = (msg: string) => err(400, msg);
export const unauthorized = (msg = 'Unauthorized') => err(401, msg);
export const forbidden = (msg = 'Forbidden') => err(403, msg);
export const notFound = (msg = 'Not found') => err(404, msg);
export const conflict = (msg = 'Conflict') => err(409, msg);
export const serverError = (msg = 'Internal server error') => err(500, msg);