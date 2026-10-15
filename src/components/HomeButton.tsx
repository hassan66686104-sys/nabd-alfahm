// زر ثابت للعودة إلى الصفحة الرئيسية من أي صفحة
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import { cx } from './ui';

export default function HomeButton({ to = '/', tone = 'dark', className }: { to?: string; tone?: 'dark' | 'light'; className?: string }) {
  return (
    <Link to={to} data-testid="home-button" aria-label="الصفحة الرئيسية" title="الصفحة الرئيسية"
      className={cx('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-bold shadow transition hover:-translate-y-0.5',
        tone === 'dark' ? 'bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25' : 'bg-white text-brand-800 ring-1 ring-brand-100 hover:bg-brand-50', className)}>
      <Home className="h-4 w-4" /><span className="hidden sm:inline">الرئيسية</span>
    </Link>
  );
}
