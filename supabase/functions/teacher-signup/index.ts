// دالة Supabase Edge: إنشاء حساب معلم بكلمة مرور فقط (انظر handler.js)
import { handleSignup } from './handler.js';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('{"ok":false}', { status: 405, headers: cors });
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  const body = await req.json().catch(() => ({}));
  const r = await handleSignup(body, ip, {
    url: Deno.env.get('SUPABASE_URL')!, serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, fetch,
  });
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { ...cors, 'content-type': 'application/json' } });
});
