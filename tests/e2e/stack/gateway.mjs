// بوابة بسيطة تحاكي Kong في Supabase: توجه /auth/v1 إلى GoTrue و /rest/v1 إلى PostgREST.
// للاختبار المحلي فقط. لا تدعم Realtime (يرفض اتصال websocket فيتحول التطبيق للاستطلاع الدوري).
import http from 'node:http';
const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const routes = [
  { prefix: '/auth/v1', port: Number(process.env.GOTRUE_PORT ?? 9999) },
  { prefix: '/rest/v1', port: Number(process.env.PGRST_PORT ?? 3000) },
];
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, prefer, accept-profile, content-profile, range, x-supabase-api-version, x-retry-count',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD',
  'access-control-expose-headers': 'content-range, x-total-count',
};
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const r = routes.find((x) => req.url.startsWith(x.prefix));
  if (!r) { res.writeHead(404, cors); return res.end('{"message":"not available in local test gateway"}'); }
  const headers = { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress ?? '127.0.0.1' };
  delete headers.host;
  const up = http.request({ host: '127.0.0.1', port: r.port, path: req.url.slice(r.prefix.length) || '/', method: req.method, headers }, (ur) => {
    const h = { ...ur.headers };
    for (const k of Object.keys(h)) if (k.startsWith('access-control-')) delete h[k];
    res.writeHead(ur.statusCode ?? 502, { ...h, ...cors });
    ur.pipe(res);
  });
  up.on('error', (e) => { res.writeHead(502, cors); res.end(JSON.stringify({ message: e.message })); });
  req.pipe(up);
}).on('upgrade', (_req, socket) => socket.destroy()).listen(PORT, () => console.log(`gateway on :${PORT}`));
