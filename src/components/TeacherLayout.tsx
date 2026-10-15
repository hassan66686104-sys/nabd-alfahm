import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, Home, LibraryBig, LogOut, Settings, Zap } from 'lucide-react';
import { Brand, Credit } from './Logo';
import { OfflineBanner } from './feedback';
import { useAuth } from '@/hooks/useAuth';
import { auth } from '@/lib/api';
import { cx } from './ui';

const NAV = [
  { to: '/t', label: 'الرئيسية', icon: Home, end: true },
  { to: '/t/bank', label: 'بنك الأسئلة', icon: LibraryBig },
  { to: '/t/quick', label: 'اختبر فهمهم', icon: Zap },
  { to: '/t/reports', label: 'تقاريري', icon: BarChart3 },
  { to: '/t/settings', label: 'الإعدادات', icon: Settings },
];

export default function TeacherLayout() {
  const { profile, session } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh pb-20 lg:pb-0">
      <OfflineBanner />
      <header className="no-print sticky top-0 z-30 border-b border-brand-100 bg-white/90 backdrop-blur">
        <div className="flex h-16 w-full items-center justify-between gap-4 px-4 lg:px-8">
          <NavLink to="/t"><Brand compact /></NavLink>
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => cx('flex items-center gap-2 rounded-xl px-3 py-2 font-semibold transition', isActive ? 'bg-brand-700 text-white' : 'text-brand-700 hover:bg-brand-50')}>
                <n.icon className="h-5 w-5" />{n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-brand-600 sm:inline">{profile?.full_name || session?.user.email}</span>
            <button onClick={async () => { await auth.signOut(); navigate('/'); }} className="rounded-xl p-2 text-brand-600 hover:bg-brand-50" title="تسجيل الخروج" aria-label="تسجيل الخروج">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>
      <main className="w-full px-4 py-6 lg:px-8">
        <Outlet />
      </main>
      <footer className="no-print pb-24 lg:pb-6"><Credit /></footer>
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-brand-100 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold', isActive ? 'text-brand-700' : 'text-brand-400')}>
            <n.icon className="h-6 w-6" />{n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
