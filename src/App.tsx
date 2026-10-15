import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { sfx } from './lib/sound';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { isConfigured } from './lib/supabase';
import { Spinner } from './components/ui';
import TeacherLayout from './components/TeacherLayout';
import Landing from './pages/Landing';
import Privacy from './pages/Privacy';
import SetupNeeded from './pages/SetupNeeded';
import { Login, Signup, ResetPassword } from './pages/Auth';
import Join from './pages/student/Join';
import Play from './pages/student/Play';
import Practice from './pages/student/Practice';

const Dashboard = lazy(() => import('./pages/teacher/Dashboard'));
const QuestionBank = lazy(() => import('./pages/teacher/QuestionBank'));
const QuestionEditor = lazy(() => import('./pages/teacher/QuestionEditor'));
const ImportQuestions = lazy(() => import('./pages/teacher/ImportQuestions'));
const NewSession = lazy(() => import('./pages/teacher/NewSession'));
const QuickCheck = lazy(() => import('./pages/teacher/QuickCheck'));
const Instant = lazy(() => import('./pages/teacher/Instant'));
const NewChallenge = lazy(() => import('./pages/teacher/NewChallenge'));
const ChallengeLive = lazy(() => import('./pages/teacher/ChallengeLive'));
const LiveSession = lazy(() => import('./pages/teacher/LiveSession'));
const Present = lazy(() => import('./pages/teacher/Present'));
const Reports = lazy(() => import('./pages/teacher/Reports'));
const ReportDetail = lazy(() => import('./pages/teacher/ReportDetail'));
const Settings = lazy(() => import('./pages/teacher/Settings'));

function RequireTeacher({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}

// نقرة خفيفة عند الضغط على أي زر أو رابط في كل الصفحات (تُكتم من زر الصوت)
function useTapSound() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest('button:not(:disabled), a[href], [role="radio"], [role="tab"], [role="switch"]');
      if (el) sfx.tap();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);
}

export default function App() {
  useTapSound();
  if (!isConfigured) {
    return (
      <Routes>
        <Route path="*" element={<SetupNeeded />} />
      </Routes>
    );
  }
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/reset" element={<ResetPassword />} />
        <Route path="/join" element={<Join />} />
        <Route path="/join/:code" element={<Join />} />
        <Route path="/play" element={<Play />} />
        <Route path="/practice" element={<Practice />} />
        <Route path="/practice/:code" element={<Practice />} />
        <Route path="/present/:id" element={<RequireTeacher><Present /></RequireTeacher>} />
        <Route path="/t" element={<RequireTeacher><TeacherLayout /></RequireTeacher>}>
          <Route index element={<Dashboard />} />
          <Route path="bank" element={<QuestionBank />} />
          <Route path="bank/new" element={<QuestionEditor />} />
          <Route path="bank/:id" element={<QuestionEditor />} />
          <Route path="import" element={<ImportQuestions />} />
          <Route path="sessions/new" element={<NewSession />} />
          <Route path="quick" element={<QuickCheck />} />
          <Route path="instant" element={<Instant />} />
          <Route path="challenge/new" element={<NewChallenge />} />
          <Route path="challenge/:id" element={<ChallengeLive />} />
          <Route path="live/:id" element={<LiveSession />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reports/:id" element={<ReportDetail />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
