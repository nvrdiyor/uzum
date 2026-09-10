import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Toaster } from '@/components/ui';
import { useSession, useNeedsOnboarding } from '@/store/session';
import { useUi } from '@/store/ui';
import { useLangStore } from '@/i18n';
import '@/i18n/common';

// Sahifalar — kodni bo'lib yuklash
const Landing = lazy(() => import('@/pages/Landing'));
const Login = lazy(() => import('@/pages/Login'));
const AuthCallback = lazy(() => import('@/pages/AuthCallback'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Sales = lazy(() => import('@/pages/Sales'));
const SalesStock = lazy(() => import('@/pages/SalesStock'));
const Reports = lazy(() => import('@/pages/Reports'));
const Planner = lazy(() => import('@/pages/Planner'));
const Products = lazy(() => import('@/pages/Products'));
const ProductDetail = lazy(() => import('@/pages/ProductDetail'));
const Abc = lazy(() => import('@/pages/Abc'));
const CostPrice = lazy(() => import('@/pages/CostPrice'));
const Illiquid = lazy(() => import('@/pages/Illiquid'));
const Stocks = lazy(() => import('@/pages/Stocks'));
const WarehousePage = lazy(() => import('@/pages/Warehouse'));
const Shipments = lazy(() => import('@/pages/Shipments'));
const Losses = lazy(() => import('@/pages/Losses'));
const Returns = lazy(() => import('@/pages/Returns'));
const Storage = lazy(() => import('@/pages/Storage'));
const Finance = lazy(() => import('@/pages/Finance'));
const UnitEconomics = lazy(() => import('@/pages/UnitEconomics'));
const Expenses = lazy(() => import('@/pages/Expenses'));
const Calculator = lazy(() => import('@/pages/Calculator'));
const ImportCalculator = lazy(() => import('@/pages/ImportCalculator'));
const Reviews = lazy(() => import('@/pages/Reviews'));
const Referral = lazy(() => import('@/pages/Referral'));
const Pricing = lazy(() => import('@/pages/Pricing'));
const Settings = lazy(() => import('@/pages/Settings'));
const Admin = lazy(() => import('@/pages/Admin'));
const NotFound = lazy(() => import('@/pages/NotFound'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  },
});

/** To'liq ekranli yuklanish ko'rsatkichi (lazy sahifalar yuklanayotganda) */
function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-3">
        <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-grad text-white">
          <span className="absolute inset-0 animate-pulse-ring rounded-2xl bg-brand/40" />
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M2 15h3.5L8 7l3.5 11L14 12h2" />
          </svg>
        </span>
        <p className="text-sm text-muted">Yuklanmoqda...</p>
      </div>
    </div>
  );
}

function Protected() {
  const { me, ready } = useSession();
  const needsOnboarding = useNeedsOnboarding();
  const location = useLocation();

  if (!ready) return <FullPageLoader />;

  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (needsOnboarding && location.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />;

  return <Outlet />;
}

function Bootstrap() {
  const load = useSession((s) => s.load);
  const setTheme = useUi((s) => s.setTheme);
  const theme = useUi((s) => s.theme);
  const lang = useLangStore((s) => s.lang);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTheme(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Bootstrap />
        <Suspense fallback={<FullPageLoader />}>
          <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          <Route element={<Protected />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/sales-stock" element={<SalesStock />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/planner" element={<Planner />} />
              <Route path="/products" element={<Products />} />
              <Route path="/products/:id" element={<ProductDetail />} />
              <Route path="/abc" element={<Abc />} />
              <Route path="/cost-price" element={<CostPrice />} />
              <Route path="/illiquid" element={<Illiquid />} />
              <Route path="/stocks" element={<Stocks />} />
              <Route path="/warehouse" element={<WarehousePage />} />
              <Route path="/shipments" element={<Shipments />} />
              <Route path="/losses" element={<Losses />} />
              <Route path="/returns" element={<Returns />} />
              <Route path="/storage" element={<Storage />} />
              <Route path="/finance" element={<Finance />} />
              <Route path="/unit-economics" element={<UnitEconomics />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/calculator" element={<Calculator />} />
              <Route path="/import-calculator" element={<ImportCalculator />} />
              <Route path="/reviews" element={<Reviews />} />
              <Route path="/referral" element={<Referral />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/admin" element={<Admin />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
