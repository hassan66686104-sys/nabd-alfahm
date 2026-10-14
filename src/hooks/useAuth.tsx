import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { supabase, isConfigured } from '@/lib/supabase';
import { getProfile } from '@/lib/api';
import type { Profile } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/constants';

interface AuthCtx {
  session: AuthSession | null;
  profile: Profile | null;
  loading: boolean;
  recovery: boolean;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ session: null, profile: null, loading: true, recovery: false, refreshProfile: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isConfigured);
  const [recovery, setRecovery] = useState(false);

  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await getProfile());
    } catch {
      // نعتمد الإعدادات الافتراضية إن تعذر التحميل مؤقتًا
      setProfile((p) => p ?? null);
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setProfile(null);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (session?.user) void refreshProfile();
  }, [session?.user?.id, refreshProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={{ session, profile, loading, recovery, refreshProfile }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}

export function useSettings() {
  const { profile } = useAuth();
  return profile?.settings ?? DEFAULT_SETTINGS;
}
