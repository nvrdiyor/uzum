import { Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Toaster } from '@/components/ui';
import { useSession, useNeedsOnboarding } from '@/store/session';
import { useUi } from '@/store/ui';
import { useLangStore } from '@/i18n';
import { lazyPage } from '@/lib/lazyPage';
import { RouteError } from '@/components/RouteError';
import '@/i18n/common';

// Ochiq sahifalar — darhol yuklanadi (birinchi ochilishda kutish bo'lmasin;
// lazy bo'lsa dastlabki render 'suspend' bo'lib React #426 xatosini berardi)
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import AuthCallback from '@/pages/AuthCallback';
import NotFound from '@/pages/NotFound';
import AdminLogin from '@/pages/AdminLogin';

// Ichki sahifalar — kodni bo'lib yuklash
const Onboarding = lazyPage(() => import('@/pages/Onboarding'));
const Dashboard = lazyPage(() => import('@/pages/Dashboard'));
const Sales = lazyPage(() => import('@/pages/Sales'));
const Funnel = lazyPage(() => import('@/pages/Funnel'));
const SalesStock = lazyPage(() => import('@/pages/SalesStock'));
const Reports = lazyPage(() => import('@/pages/Reports'));
const Planner = lazyPage(() => import('@/pages/Planner'));
const Products = lazyPage(() => import('@/pages/Products'));
const ProductDetail = lazyPage(() => import('@/pages/ProductDetail'));
const Abc = lazyPage(() => import('@/pages/Abc'));
const CostPrice = lazyPage(() => import('@/pages/CostPrice'));
const Illiquid = lazyPage(() => import('@/pages/Illiquid'));
const Stocks = lazyPage(() => import('@/pages/Stocks'));
const WarehousePage = lazyPage(() => import('@/pages/Warehouse'));
const Shipments = lazyPage(() => import('@/pages/Shipments'));
const Losses = lazyPage(() => import('@/pages/Losses'));
const Returns = lazyPage(() => import('@/pages/Returns'));
const Storage = lazyPage(() => import('@/pages/Storage'));
const Finance = lazyPage(() => import('@/pages/Finance'));
const UnitEconomics = lazyPage(() => import('@/pages/UnitEconomics'));
const Expenses = lazyPage(() => import('@/pages/Expenses'));
const Calculator = lazyPage(() => import('@/pages/Calculator'));
const ImportCalculator = lazyPage(() => import('@/pages/ImportCalculator'));
const Reviews = lazyPage(() => import('@/pages/Reviews'));
const Referral = lazyPage(() => import('@/pages/Referral'));
const Pricing = lazyPage(() => import('@/pages/Pricing'));
const Settings = lazyPage(() => import('@/pages/Settings'));
const Admin = lazyPage(() => import('@/pages/Admin'));

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

/** Marshrut o'zgarganda xato holatini tozalaydigan o'ram */
function RoutedErrorBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return <RouteError resetKey={location.pathname}>{children}</RouteError>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/*
        v7_startTransition ATAYLAB YOQILMAGAN.

        U bilan marshrut almashuvi React "transition" iga aylanadi va ba'zan
        umuman yakunlanmaydi: manzil o'zgaradi, ekran esa eskiligicha qoladi —
        lazy sahifa fayli hatto so'ralmaydi ham. (Oddiy yangilanishlar, masalan
        mavzu almashtirish, bu paytda ishlayveradi — shu bilan aniqlandi.)

        Oddiy yangilanishda Suspense chegarasi skeletni ko'rsatadi va sahifa
        doim ochiladi.
      */}
      <BrowserRouter future={{ v7_relativeSplatPath: true }}>
        <Bootstrap />
        {/* Sahifa yuklanmasa oq ekran emas, tushunarli xabar chiqadi */}
        <RoutedErrorBoundary>
          <Suspense fallback={<FullPageLoader />}>
          <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/admin-login" element={<AdminLogin />} />

          <Route element={<Protected />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/funnel" element={<Funnel />} />
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
        </RoutedErrorBoundary>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
