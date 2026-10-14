import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey && !url.includes('YOUR-PROJECT'));

// يُستخدم المفتاح العام فقط؛ الحماية الفعلية في سياسات RLS ودوال قاعدة البيانات
export const supabase: SupabaseClient = createClient(url || 'http://localhost:54321', anonKey || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'nabd.auth' },
  realtime: { params: { eventsPerSecond: 20 } },
});

export function publicAppUrl(): string {
  const env = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  return (env || window.location.origin).replace(/\/$/, '');
}

export function joinUrl(code: string): string {
  return `${publicAppUrl()}/join/${code}`;
}
