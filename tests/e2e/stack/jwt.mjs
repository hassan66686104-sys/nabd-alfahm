// توليد مفاتيح JWT للاختبار المحلي فقط (مثل مفاتيح supabase start)
import { createHmac } from 'node:crypto';
export const JWT_SECRET = 'local-test-secret-not-for-production-0123456789';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function sign(payload, secret = JWT_SECRET) {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64(payload);
  const s = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}
export const ANON_KEY = sign({ role: 'anon', iss: 'supabase-local', iat: 1700000000, exp: 2000000000 });
export const SERVICE_KEY = sign({ role: 'service_role', iss: 'supabase-local', iat: 1700000000, exp: 2000000000 });
if (process.argv[2] === 'anon') console.log(ANON_KEY);
