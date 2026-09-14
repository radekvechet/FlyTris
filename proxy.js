import { NextResponse } from 'next/server';
export function proxy(request) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const development = process.env.NODE_ENV === 'development';
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce); headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}
export const config = { matcher: ['/'] };
