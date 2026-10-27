import {
  HandCoins,
  LayoutDashboard,
  CalendarClock,
  HeartPulse,
  Megaphone,
  TrendingUp,
  Filter,
  ShoppingCart,
  FileBarChart,
  Sparkles,
  Package,
  PieChart,
  ScanBarcode,
  Tag,
  Snowflake,
  Layers,
  Warehouse,
  Truck,
  PackageX,
  Undo2,
  Archive,
  Box,
  Wallet,
  Scale,
  Receipt,
  Calculator,
  Star,
  Users,
  UserPlus,
  CreditCard,
  Settings,
  Ship,
  PackagePlus,
  Wand2,
  LayoutGrid,
  Gauge,
  Target,
  type AppIcon,
} from '@/components/icons';
import type { FeatureId } from '@savdoiq/shared';

export interface NavItem {
  to: string;
  labelKey: string;
  icon: AppIcon;
  feature?: FeatureId;
  badge?: 'new' | 'beta';
  /** Tez kirish paneli (mobil pastki menyu) uchun */
  primary?: boolean;
}

export interface NavGroup {
  titleKey: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    titleKey: 'group.main',
    items: [
      { to: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, primary: true },
      { to: '/sales', labelKey: 'nav.sales', icon: TrendingUp, feature: 'sales_analytics', primary: true },
      { to: '/payout', labelKey: 'nav.payout', icon: CalendarClock, feature: 'unit_economics' },
      { to: '/funnel', labelKey: 'nav.funnel', icon: Filter, feature: 'sales_analytics' },
      { to: '/sales-stock', labelKey: 'nav.salesStock', icon: ShoppingCart, feature: 'stocks_fbo_fbs' },
      { to: '/reports', labelKey: 'nav.reports', icon: FileBarChart, feature: 'monthly_reports' },
      { to: '/planner', labelKey: 'nav.planner', icon: Sparkles, feature: 'planner' },
    ],
  },
  {
    titleKey: 'group.product',
    items: [
      { to: '/products', labelKey: 'nav.products', icon: Package, feature: 'products_assortment', primary: true },
      { to: '/sku-health', labelKey: 'nav.skuHealth', icon: HeartPulse, feature: 'sku_health' },
      { to: '/cards', labelKey: 'nav.cards', icon: Wand2, feature: 'card_seo' },
      { to: '/abc', labelKey: 'nav.abc', icon: PieChart, feature: 'abc_analysis' },
      { to: '/cost-price', labelKey: 'nav.costPrice', icon: Tag, feature: 'cost_price' },
      // Ilgari Boxes edi — Qoldiqlar (Layers) bilan aynan bir xil "stack" belgisi chiqardi
      { to: '/batches', labelKey: 'nav.batches', icon: PackagePlus, feature: 'cost_price' },
      { to: '/mxik', labelKey: 'nav.mxik', icon: ScanBarcode },
      { to: '/illiquid', labelKey: 'nav.illiquid', icon: Snowflake, feature: 'illiquid' },
    ],
  },
  /*
   * O'sish — faqat sotuvchining o'z ma'lumotidan (bozor o'qilmaydi, 2026-10-24).
   * Kategoriyalar — ABC tahlil oilasi (assortiment tuzilmasi, abc_analysis);
   * radar va narxlar xaritasi — o'z imkoniyatlari (growth_radar, price_map), 2026-10-27.
   */
  {
    titleKey: 'group.growth',
    items: [
      { to: '/categories', labelKey: 'nav.categories', icon: LayoutGrid, feature: 'abc_analysis' },
      /*
       * Spidometr — tezlik: radar sotuv sur'ati o'zgargan SKU'larni ko'rsatadi.
       * Radar va narxlar xaritasi — faqat pullik tarifda, sinovda namuna
       * (egasining qarori, 2026-10-27; ilgari sales_analytics va products_assortment).
       */
      { to: '/radar', labelKey: 'nav.radar', icon: Gauge, feature: 'growth_radar' },
      /*
       * Raqobatchilar narxi — narxni sotuvchi o'zi kiritadi, Uzum o'qilmaydi
       * (2026-10-24). Mahsulot sahifasidagi karta bilan bir oila — tarifi ham (price_map).
       */
      { to: '/price-map', labelKey: 'nav.priceMap', icon: Target, feature: 'price_map' },
    ],
  },
  {
    titleKey: 'group.marketing',
    items: [
      { to: '/promos', labelKey: 'nav.promos', icon: Megaphone, feature: 'promos' },
    ],
  },
  {
    titleKey: 'group.warehouse',
    items: [
      { to: '/stocks', labelKey: 'nav.stocks', icon: Layers, feature: 'stocks_fbo_fbs' },
      { to: '/warehouse', labelKey: 'nav.warehouse', icon: Warehouse, feature: 'warehouse' },
      { to: '/shipments', labelKey: 'nav.shipments', icon: Truck, feature: 'shipments' },
      { to: '/losses', labelKey: 'nav.losses', icon: PackageX, feature: 'losses_report' },
      { to: '/returns', labelKey: 'nav.returns', icon: Undo2, feature: 'returns_report' },
      { to: '/storage', labelKey: 'nav.storage', icon: Archive, feature: 'paid_storage' },
      // Kub — hajm; logistika yig'imi kartochkadagi hajm bo'yicha tekshiriladi
      { to: '/vgh', labelKey: 'nav.vgh', icon: Box, feature: 'vgh_report' },
    ],
  },
  {
    titleKey: 'group.finance',
    items: [
      { to: '/finance', labelKey: 'nav.finance', icon: Wallet, feature: 'unit_economics', primary: true },
      { to: '/product-profit', labelKey: 'nav.productProfit', icon: HandCoins, feature: 'unit_economics' },
      { to: '/unit-economics', labelKey: 'nav.unitEconomics', icon: Scale, feature: 'unit_economics' },
      { to: '/expenses', labelKey: 'nav.expenses', icon: Receipt, feature: 'expenses' },
      { to: '/calculator', labelKey: 'nav.calculator', icon: Calculator, feature: 'unit_calculator' },
      {
        to: '/import-calculator',
        labelKey: 'nav.importCalculator',
        icon: Ship,
        feature: 'unit_calculator',
      },
    ],
  },
  {
    titleKey: 'group.service',
    items: [
      { to: '/reviews', labelKey: 'nav.reviews', icon: Star, feature: 'reviews_autoreply' },
      { to: '/referral', labelKey: 'nav.referral', icon: Users, feature: 'referral' },
      { to: '/pricing', labelKey: 'nav.pricing', icon: CreditCard },
      // Users — hamkorlik dasturida; jamoa sahifasi a'zo va taklif havolasi haqida (2026-10-24)
      { to: '/team', labelKey: 'nav.team', icon: UserPlus },
      { to: '/settings', labelKey: 'nav.settings', icon: Settings },
    ],
  },
];

export const PRIMARY_NAV: NavItem[] = NAV.flatMap((g) => g.items).filter((i) => i.primary);

export function findNavItem(pathname: string): NavItem | undefined {
  const all = NAV.flatMap((g) => g.items);
  return (
    all.find((i) => i.to === pathname) ??
    all.find((i) => pathname.startsWith(`${i.to}/`))
  );
}
