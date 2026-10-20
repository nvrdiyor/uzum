/**
 * Ikonkalarni yaratadi: src/components/icons/{index.ts, glyphs/*.ts}
 *
 *   node scripts/gen-icons.mjs        (apps/web papkasida)
 *
 * Manba — @phosphor-icons/core (devDependency) dagi ikki tonli (duotone) SVG'lar.
 * @phosphor-icons/react har ikonkada oltita og'irlikni birga olib keladi va
 * hammasi bitta modul orqali ulanganda asosiy JS 85 → 186 KB (gzip) ga oshdi.
 * Bu yerda faqat duotone chiziqlari olinadi va har ikonka alohida modul —
 * sahifa faqat o'zi ishlatganlarini yuklaydi.
 *
 * Kalitlar — saytda ishlatiladigan nom (lucide'dan qolgan), qiymat — Phosphor
 * ikonkasi (phosphoricons.com dagi nom). Yangi ikonka kerak bo'lsa shu ro'yxatga
 * qo'shib, skriptni qayta yuriting.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const MAP = {
  AlertTriangle: 'Warning',
  Archive: 'Archive',
  ArrowDown: 'ArrowDown',
  ArrowDownRight: 'ArrowDownRight',
  ArrowLeft: 'ArrowLeft',
  ArrowLeftRight: 'ArrowsLeftRight',
  ArrowRight: 'ArrowRight',
  ArrowUpDown: 'ArrowsDownUp',
  ArrowUpRight: 'ArrowUpRight',
  AtSign: 'At',
  BadgeCheck: 'SealCheck',
  BadgePercent: 'SealPercent',
  Ban: 'Prohibit',
  Banknote: 'Money',
  BarChart3: 'ChartBar',
  Bell: 'Bell',
  BellRing: 'BellRinging',
  Bookmark: 'BookmarkSimple',
  BookmarkPlus: 'BookmarkSimple',
  Bot: 'Robot',
  Box: 'Cube',
  Boxes: 'Stack',
  Building2: 'Buildings',
  Calculator: 'Calculator',
  Calendar: 'Calendar',
  CalendarClock: 'CalendarDots',
  CalendarDays: 'CalendarDots',
  CalendarOff: 'CalendarSlash',
  CalendarRange: 'CalendarBlank',
  Check: 'Check',
  CheckCheck: 'Checks',
  CheckCircle2: 'CheckCircle',
  ChevronDown: 'CaretDown',
  ChevronLeft: 'CaretLeft',
  ChevronRight: 'CaretRight',
  ChevronUp: 'CaretUp',
  CircleCheck: 'CheckCircle',
  CircleDollarSign: 'CurrencyCircleDollar',
  Clock: 'Clock',
  Clock3: 'Clock',
  Coins: 'Coins',
  Compass: 'Compass',
  Container: 'ShippingContainer',
  Copy: 'Copy',
  CornerDownLeft: 'ArrowElbowDownLeft',
  CreditCard: 'CreditCard',
  Crown: 'Crown',
  Download: 'DownloadSimple',
  ExternalLink: 'ArrowSquareOut',
  Eye: 'Eye',
  EyeOff: 'EyeSlash',
  FileBarChart: 'PresentationChart',
  FileSpreadsheet: 'FileXls',
  FileText: 'FileText',
  Filter: 'Funnel',
  Flame: 'Fire',
  Gauge: 'Gauge',
  Gift: 'Gift',
  Globe: 'Globe',
  GripVertical: 'DotsSixVertical',
  HandCoins: 'HandCoins',
  Hash: 'Hash',
  HeartPulse: 'Heartbeat',
  HelpCircle: 'Question',
  History: 'ClockCounterClockwise',
  Hourglass: 'Hourglass',
  ImageOff: 'ImageBroken',
  Inbox: 'Tray',
  Info: 'Info',
  KeyRound: 'Key',
  Landmark: 'Bank',
  Layers: 'Stack',
  Layers3: 'StackSimple',
  LayoutDashboard: 'SquaresFour',
  LayoutGrid: 'GridFour',
  LifeBuoy: 'Lifebuoy',
  Lightbulb: 'Lightbulb',
  Link2: 'Link',
  Loader2: 'CircleNotch',
  Lock: 'Lock',
  LogIn: 'SignIn',
  LogOut: 'SignOut',
  MapPin: 'MapPin',
  Megaphone: 'Megaphone',
  Menu: 'List',
  MessageSquare: 'Chat',
  MessageSquareOff: 'ChatSlash',
  MessageSquareReply: 'ArrowBendUpLeft',
  Minus: 'Minus',
  Moon: 'Moon',
  NotebookPen: 'NotePencil',
  Package: 'Package',
  PackageCheck: 'Package',
  PackageOpen: 'Package',
  PackagePlus: 'BoxArrowDown',
  PackageSearch: 'ListMagnifyingGlass',
  PackageX: 'SealWarning',
  Palette: 'Palette',
  PanelLeftClose: 'SidebarSimple',
  PartyPopper: 'Confetti',
  Pencil: 'PencilSimple',
  Percent: 'Percent',
  Phone: 'Phone',
  PieChart: 'ChartPie',
  PiggyBank: 'PiggyBank',
  Plane: 'Airplane',
  Play: 'Play',
  PlayCircle: 'PlayCircle',
  Plus: 'Plus',
  PlusCircle: 'PlusCircle',
  Printer: 'Printer',
  Receipt: 'Receipt',
  ReceiptText: 'Receipt',
  RefreshCw: 'ArrowsClockwise',
  Rocket: 'RocketLaunch',
  RotateCcw: 'ArrowCounterClockwise',
  Route: 'Path',
  Rows3: 'Rows',
  Save: 'FloppyDisk',
  Scale: 'Scales',
  ScanBarcode: 'Barcode',
  Search: 'MagnifyingGlass',
  Send: 'PaperPlaneTilt',
  Settings: 'GearSix',
  Settings2: 'SlidersHorizontal',
  Share2: 'ShareNetwork',
  ShieldAlert: 'ShieldWarning',
  ShieldCheck: 'ShieldCheck',
  Ship: 'Boat',
  ShoppingBag: 'ShoppingBag',
  ShoppingCart: 'ShoppingCart',
  SlidersHorizontal: 'SlidersHorizontal',
  Snowflake: 'Snowflake',
  Sparkles: 'Sparkle',
  Star: 'Star',
  Store: 'Storefront',
  Sun: 'Sun',
  Table2: 'Table',
  Tag: 'Tag',
  Tags: 'Tag',
  Target: 'Target',
  ThumbsUp: 'ThumbsUp',
  Timer: 'Timer',
  Trash2: 'Trash',
  TrendingDown: 'TrendDown',
  TrendingUp: 'TrendUp',
  Trophy: 'Trophy',
  Truck: 'Truck',
  Undo2: 'ArrowUUpLeft',
  User: 'User',
  UserPlus: 'UserPlus',
  UserRound: 'UserCircle',
  Users: 'Users',
  Wallet: 'Wallet',
  Wallet2: 'Wallet',
  Wand2: 'MagicWand',
  Warehouse: 'Warehouse',
  X: 'X',
  XCircle: 'XCircle',
  Zap: 'Lightning',
};

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '../src/components/icons');
const require = createRequire(import.meta.url);
// Paket package.json'ni eksport qilmaydi — papka SVG fayl orqali topiladi
const assets = dirname(require.resolve('@phosphor-icons/core/assets/duotone/acorn-duotone.svg'));

/** SquaresFour → squares-four, ArrowUUpLeft → arrow-u-up-left */
const kebab = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

/** Duotone SVG: birinchi `path` — och fon (opacity .2), ikkinchisi — asosiy shakl */
function paths(phosphor) {
  const file = join(assets, `${kebab(phosphor)}-duotone.svg`);
  if (!existsSync(file)) throw new Error(`Phosphor'da yo'q: ${phosphor} (${file})`);
  const svg = readFileSync(file, 'utf8');
  const all = [...svg.matchAll(/<path d="([^"]+)"( opacity="0\.2")?\/>/g)];
  const bg = all.find((m) => m[2]);
  const fg = all.find((m) => !m[2]);
  if (all.length !== 2 || !bg || !fg) throw new Error(`Kutilmagan tuzilish: ${file}`);
  return { bg: bg[1], fg: fg[1] };
}

rmSync(join(outDir, 'glyphs'), { recursive: true, force: true });
mkdirSync(join(outDir, 'glyphs'), { recursive: true });

const HEADER = "// Avtomatik yaratilgan (scripts/gen-icons.mjs) — qo'lda tahrirlamang\n";
const names = Object.keys(MAP).sort();
for (const name of names) {
  const { bg, fg } = paths(MAP[name]);
  writeFileSync(
    join(outDir, 'glyphs', `${name}.ts`),
    `${HEADER}import { makeIcon } from '../base';\n\n/** Phosphor: ${kebab(MAP[name])} (duotone) */\nexport const ${name} = /* @__PURE__ */ makeIcon('${name}', '${bg}', '${fg}');\n`,
  );
}

writeFileSync(
  join(outDir, 'index.ts'),
  `${HEADER}/**
 * Saytning barcha ikonkalari — Phosphor, ikki tonli (duotone) uslub.
 * Har ikonka alohida modul: sahifa faqat o'zi ishlatganlarini yuklaydi.
 */
export { makeIcon, type AppIcon, type AppIconProps } from './base';
${names.map((n) => `export { ${n} } from './glyphs/${n}';`).join('\n')}
`,
);

console.log(`ok: ${names.length} ikonka (${new Set(Object.values(MAP)).size} ta Phosphor) → src/components/icons`);
