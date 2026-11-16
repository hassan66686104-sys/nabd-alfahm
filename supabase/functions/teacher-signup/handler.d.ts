export const PASSWORD_DOMAIN: string;
export function emailForPassword(password: string): Promise<string>;
export function handleSignup(input: unknown, ip: string, env: { url: string; serviceKey: string; fetch: typeof fetch }): Promise<{ status: number; body: { ok: boolean; error?: string } }>;
