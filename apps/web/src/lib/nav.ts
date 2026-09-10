import {
  LayoutDashboard,
  TrendingUp,
  ShoppingCart,
  FileBarChart,
  Sparkles,
  Package,
  PieChart,
  Tag,
  Snowflake,
  Layers,
  Warehouse,
  Truck,
  PackageX,
  Undo2,
  Archive,
  Wallet,
  Scale,
  Receipt,
  Calculator,
  Star,
  Users,
  CreditCard,
  Settings,
  Ship,
  type LucideIcon,
} from 'lucide-react';
import type { FeatureId } from '@savdoiq/shared';

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
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
      { to: '/sales-stock', labelKey: 'nav.salesStock', icon: ShoppingCart, feature: 'stocks_fbo_fbs' },
      { to: '/reports', labelKey: 'nav.reports', icon: FileBarChart, feature: 'monthly_reports' },
      { to: '/planner', labelKey: 'nav.planner', icon: Sparkles, feature: 'planner', badge: 'new' },
    ],
  },
  {
    titleKey: 'group.product',
    items: [
      { to: '/products', labelKey: 'nav.products', icon: Package, feature: 'products_assortment', primary: true },
      { to: '/abc', labelKey: 'nav.abc', icon: PieChart, feature: 'abc_analysis' },
      { to: '/cost-price', labelKey: 'nav.costPrice', icon: Tag, feature: 'cost_price' },
      { to: '/illiquid', labelKey: 'nav.illiquid', icon: Snowflake, feature: 'illiquid' },
    ],
  },
  {
    titleKey: 'group.warehouse',
    items: [
      { to: '/stocks', labelKey: 'nav.stocks', icon: Layers, feature: 'stocks_fbo_fbs' },
      { to: '/warehouse', labelKey: 'nav.warehouse', icon: Warehouse, feature: 'warehouse', badge: 'new' },
      { to: '/shipments', labelKey: 'nav.shipments', icon: Truck, feature: 'shipments', badge: 'new' },
      { to: '/losses', labelKey: 'nav.losses', icon: PackageX, feature: 'losses_report' },
      { to: '/returns', labelKey: 'nav.returns', icon: Undo2, feature: 'returns_report' },
      { to: '/storage', labelKey: 'nav.storage', icon: Archive, feature: 'paid_storage' },
    ],
  },
  {
    titleKey: 'group.finance',
    items: [
      { to: '/finance', labelKey: 'nav.finance', icon: Wallet, feature: 'unit_economics', primary: true },
      { to: '/unit-economics', labelKey: 'nav.unitEconomics', icon: Scale, feature: 'unit_economics', badge: 'new' },
      { to: '/expenses', labelKey: 'nav.expenses', icon: Receipt, feature: 'expenses' },
      { to: '/calculator', labelKey: 'nav.calculator', icon: Calculator, feature: 'unit_calculator' },
      {
        to: '/import-calculator',
        labelKey: 'nav.importCalculator',
        icon: Ship,
        feature: 'unit_calculator',
        badge: 'new',
      },
    ],
  },
  {
    titleKey: 'group.service',
    items: [
      { to: '/reviews', labelKey: 'nav.reviews', icon: Star, feature: 'reviews_autoreply' },
      { to: '/referral', labelKey: 'nav.referral', icon: Users, feature: 'referral' },
      { to: '/pricing', labelKey: 'nav.pricing', icon: CreditCard },
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
