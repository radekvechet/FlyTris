const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
];
export default {
  poweredByHeader: false,
  agentRules: false,
  serverExternalPackages: ['@neondatabase/serverless'],
  async headers() { return [{ source: '/:path*', headers: securityHeaders }]; },
  async redirects() { return [{ source: '/report.html', destination: '/', permanent: true }, { source: '/index.html', destination: '/', permanent: true }]; },
};
