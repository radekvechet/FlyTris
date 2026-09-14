import { Readable } from 'node:stream';
import handler from '../../../server/http.cjs';
import database from '../../../server/db.cjs';
export const runtime = 'nodejs';
export const maxDuration = 15;
let localReady;
async function route(request) {
  if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
    localReady ??= database.getDatabase().then(database.migrate).catch(error => { localReady = null; throw error; });
    await localReady;
  }
  const req = request.body ? Readable.fromWeb(request.body) : Readable.from([]);
  Object.assign(req, { method: request.method, url: request.url, headers: Object.fromEntries(request.headers), socket: { remoteAddress: '127.0.0.1' } });
  const headers = new Headers(); let body;
  const res = { statusCode: 200, setHeader(key, value) { headers.set(key, value); }, end(value) { body = value; } };
  await handler(req, res);
  return new Response(body, { status: res.statusCode, headers });
}
export { route as GET, route as POST, route as OPTIONS, route as PUT, route as PATCH, route as DELETE, route as HEAD };
