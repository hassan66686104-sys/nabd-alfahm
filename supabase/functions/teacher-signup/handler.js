// إنشاء حساب معلم بكلمة مرور فقط. يعمل على الخادم بمفتاح الخدمة، ولا يصل المفتاح إلى المتصفح.
// كلمة المرور هي المعرّف أيضًا: يُشتق منها بريد داخلي لا يُرسل إليه شيء.
export const PASSWORD_DOMAIN = 'teachers.nabd-alfahm.app';

export async function emailForPassword(password) {
  const data = new TextEncoder().encode(`nabd-alfahm:${password}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t${hex.slice(0, 40)}@${PASSWORD_DOMAIN}`;
}

const reply = (body) => ({ status: 200, body });

// env: { url, serviceKey, fetch } ؛ url هو عنوان Supabase (أو البوابة المحلية)
export async function handleSignup(input, ip, env) {
  const password = typeof input?.password === 'string' ? input.password : '';
  const fullName = typeof input?.full_name === 'string' ? input.full_name.trim().replace(/\s+/g, ' ') : '';
  if (fullName.length < 2 || fullName.length > 120) return reply({ ok: false, error: 'NAME_REQUIRED' });
  if (password.length < 8 || password.length > 72) return reply({ ok: false, error: 'WEAK_PASSWORD' });
  const headers = { apikey: env.serviceKey, authorization: `Bearer ${env.serviceKey}`, 'content-type': 'application/json' };

  const rl = await env.fetch(`${env.url}/rest/v1/rpc/teacher_signup_allowed`, { method: 'POST', headers, body: JSON.stringify({ p_ip: ip || 'unknown' }) });
  if (!rl.ok) return reply({ ok: false, error: 'SIGNUP_FAILED' });
  if ((await rl.json()) !== true) return reply({ ok: false, error: 'RATE_LIMITED' });

  const r = await env.fetch(`${env.url}/auth/v1/admin/users`, {
    method: 'POST', headers,
    body: JSON.stringify({ email: await emailForPassword(password), password, email_confirm: true, user_metadata: { full_name: fullName } }),
  });
  if (r.ok) return reply({ ok: true });
  const err = await r.json().catch(() => ({}));
  const code = `${err.error_code ?? err.code ?? ''} ${err.msg ?? err.message ?? ''}`;
  if (/email_exists|already been registered|already registered/i.test(code)) return reply({ ok: false, error: 'PASSWORD_TAKEN' });
  if (/weak_password|password/i.test(code)) return reply({ ok: false, error: 'WEAK_PASSWORD' });
  return reply({ ok: false, error: 'SIGNUP_FAILED' });
}
