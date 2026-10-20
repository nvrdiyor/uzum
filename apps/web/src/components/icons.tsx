/**
 * Saytning barcha ikonkalari — Phosphor, ikki tonli (duotone) uslub.
 *
 * Komponentlar eski (lucide) nomlari bilan eksport qilinadi: sahifalar kodi
 * o'zgarmaydi, faqat import manbai shu fayl. Yangi ikonka kerak bo'lsa,
 * pastdagi ro'yxatga Phosphor ikonkasini qo'shing (phosphoricons.com).
 *
 * `size` berilmasa 24 px; odatda o'lcham Tailwind sinfi (`h-4 w-4`) bilan
 * beriladi. `strokeWidth` — lucide'dan qolgan, e'tiborsiz qoldiriladi.
 * Bezak ikonkalar ekran o'quvchidan yashiriladi (`aria-label` berilmasa).
 */
import { forwardRef, type ForwardRefExoticComponent, type RefAttributes } from 'react';
import {
  Airplane as PAirplane,
  Archive as PArchive,
  ArrowBendUpLeft as PArrowBendUpLeft,
  ArrowCounterClockwise as PArrowCounterClockwise,
  ArrowDown as PArrowDown,
  ArrowDownRight as PArrowDownRight,
  ArrowElbowDownLeft as PArrowElbowDownLeft,
  ArrowLeft as PArrowLeft,
  ArrowRight as PArrowRight,
  ArrowSquareOut as PArrowSquareOut,
  ArrowUUpLeft as PArrowUUpLeft,
  ArrowUpRight as PArrowUpRight,
  ArrowsClockwise as PArrowsClockwise,
  ArrowsDownUp as PArrowsDownUp,
  ArrowsLeftRight as PArrowsLeftRight,
  At as PAt,
  Bank as PBank,
  Barcode as PBarcode,
  Bell as PBell,
  BellRinging as PBellRinging,
  Boat as PBoat,
  BookmarkSimple as PBookmarkSimple,
  BoxArrowDown as PBoxArrowDown,
  Buildings as PBuildings,
  Calculator as PCalculator,
  Calendar as PCalendar,
  CalendarBlank as PCalendarBlank,
  CalendarDots as PCalendarDots,
  CalendarSlash as PCalendarSlash,
  CaretDown as PCaretDown,
  CaretLeft as PCaretLeft,
  CaretRight as PCaretRight,
  CaretUp as PCaretUp,
  ChartBar as PChartBar,
  ChartPie as PChartPie,
  Chat as PChat,
  ChatSlash as PChatSlash,
  Check as PCheck,
  CheckCircle as PCheckCircle,
  Checks as PChecks,
  CircleNotch as PCircleNotch,
  Clock as PClock,
  ClockCounterClockwise as PClockCounterClockwise,
  Coins as PCoins,
  Compass as PCompass,
  Confetti as PConfetti,
  Copy as PCopy,
  CreditCard as PCreditCard,
  Crown as PCrown,
  Cube as PCube,
  CurrencyCircleDollar as PCurrencyCircleDollar,
  DotsSixVertical as PDotsSixVertical,
  DownloadSimple as PDownloadSimple,
  Eye as PEye,
  EyeSlash as PEyeSlash,
  FileText as PFileText,
  FileXls as PFileXls,
  Fire as PFire,
  FloppyDisk as PFloppyDisk,
  Funnel as PFunnel,
  Gauge as PGauge,
  GearSix as PGearSix,
  Gift as PGift,
  Globe as PGlobe,
  GridFour as PGridFour,
  HandCoins as PHandCoins,
  Hash as PHash,
  Heartbeat as PHeartbeat,
  Hourglass as PHourglass,
  ImageBroken as PImageBroken,
  Info as PInfo,
  Key as PKey,
  Lifebuoy as PLifebuoy,
  Lightbulb as PLightbulb,
  Lightning as PLightning,
  Link as PLink,
  List as PList,
  ListMagnifyingGlass as PListMagnifyingGlass,
  Lock as PLock,
  MagicWand as PMagicWand,
  MagnifyingGlass as PMagnifyingGlass,
  MapPin as PMapPin,
  Megaphone as PMegaphone,
  Minus as PMinus,
  Money as PMoney,
  Moon as PMoon,
  NotePencil as PNotePencil,
  Package as PPackage,
  Palette as PPalette,
  PaperPlaneTilt as PPaperPlaneTilt,
  Path as PPath,
  PencilSimple as PPencilSimple,
  Percent as PPercent,
  Phone as PPhone,
  PiggyBank as PPiggyBank,
  Play as PPlay,
  PlayCircle as PPlayCircle,
  Plus as PPlus,
  PlusCircle as PPlusCircle,
  PresentationChart as PPresentationChart,
  Printer as PPrinter,
  Prohibit as PProhibit,
  Question as PQuestion,
  Receipt as PReceipt,
  Robot as PRobot,
  RocketLaunch as PRocketLaunch,
  Rows as PRows,
  Scales as PScales,
  SealCheck as PSealCheck,
  SealPercent as PSealPercent,
  SealWarning as PSealWarning,
  ShareNetwork as PShareNetwork,
  ShieldCheck as PShieldCheck,
  ShieldWarning as PShieldWarning,
  ShippingContainer as PShippingContainer,
  ShoppingBag as PShoppingBag,
  ShoppingCart as PShoppingCart,
  SidebarSimple as PSidebarSimple,
  SignIn as PSignIn,
  SignOut as PSignOut,
  SlidersHorizontal as PSlidersHorizontal,
  Snowflake as PSnowflake,
  Sparkle as PSparkle,
  SquaresFour as PSquaresFour,
  Stack as PStack,
  StackSimple as PStackSimple,
  Star as PStar,
  Storefront as PStorefront,
  Sun as PSun,
  Table as PTable,
  Tag as PTag,
  Target as PTarget,
  ThumbsUp as PThumbsUp,
  Timer as PTimer,
  Trash as PTrash,
  Tray as PTray,
  TrendDown as PTrendDown,
  TrendUp as PTrendUp,
  Trophy as PTrophy,
  Truck as PTruck,
  User as PUser,
  UserCircle as PUserCircle,
  UserPlus as PUserPlus,
  Users as PUsers,
  Wallet as PWallet,
  Warehouse as PWarehouse,
  Warning as PWarning,
  X as PX,
  XCircle as PXCircle,
  type Icon as PhosphorIcon,
  type IconProps,
} from '@phosphor-icons/react';

export type AppIconProps = IconProps & { strokeWidth?: number | string };
export type AppIcon = ForwardRefExoticComponent<AppIconProps & RefAttributes<SVGSVGElement>>;

function duotone(Base: PhosphorIcon, name: string): AppIcon {
  const C = forwardRef<SVGSVGElement, AppIconProps>(function AppIcon(
    { strokeWidth: _strokeWidth, size = 24, weight = 'duotone', ...rest },
    ref,
  ) {
    const hidden = rest['aria-label'] || rest['aria-labelledby'] ? undefined : true;
    return <Base ref={ref} size={size} weight={weight} aria-hidden={hidden} focusable="false" {...rest} />;
  });
  C.displayName = name;
  return C;
}

export const AlertTriangle = duotone(PWarning, 'AlertTriangle');
export const Archive = duotone(PArchive, 'Archive');
export const ArrowDown = duotone(PArrowDown, 'ArrowDown');
export const ArrowDownRight = duotone(PArrowDownRight, 'ArrowDownRight');
export const ArrowLeft = duotone(PArrowLeft, 'ArrowLeft');
export const ArrowLeftRight = duotone(PArrowsLeftRight, 'ArrowLeftRight');
export const ArrowRight = duotone(PArrowRight, 'ArrowRight');
export const ArrowUpDown = duotone(PArrowsDownUp, 'ArrowUpDown');
export const ArrowUpRight = duotone(PArrowUpRight, 'ArrowUpRight');
export const AtSign = duotone(PAt, 'AtSign');
export const BadgeCheck = duotone(PSealCheck, 'BadgeCheck');
export const BadgePercent = duotone(PSealPercent, 'BadgePercent');
export const Ban = duotone(PProhibit, 'Ban');
export const Banknote = duotone(PMoney, 'Banknote');
export const BarChart3 = duotone(PChartBar, 'BarChart3');
export const Bell = duotone(PBell, 'Bell');
export const BellRing = duotone(PBellRinging, 'BellRing');
export const Bookmark = duotone(PBookmarkSimple, 'Bookmark');
export const BookmarkPlus = duotone(PBookmarkSimple, 'BookmarkPlus');
export const Bot = duotone(PRobot, 'Bot');
export const Box = duotone(PCube, 'Box');
export const Boxes = duotone(PStack, 'Boxes');
export const Building2 = duotone(PBuildings, 'Building2');
export const Calculator = duotone(PCalculator, 'Calculator');
export const Calendar = duotone(PCalendar, 'Calendar');
export const CalendarClock = duotone(PCalendarDots, 'CalendarClock');
export const CalendarDays = duotone(PCalendarDots, 'CalendarDays');
export const CalendarOff = duotone(PCalendarSlash, 'CalendarOff');
export const CalendarRange = duotone(PCalendarBlank, 'CalendarRange');
export const Check = duotone(PCheck, 'Check');
export const CheckCheck = duotone(PChecks, 'CheckCheck');
export const CheckCircle2 = duotone(PCheckCircle, 'CheckCircle2');
export const ChevronDown = duotone(PCaretDown, 'ChevronDown');
export const ChevronLeft = duotone(PCaretLeft, 'ChevronLeft');
export const ChevronRight = duotone(PCaretRight, 'ChevronRight');
export const ChevronUp = duotone(PCaretUp, 'ChevronUp');
export const CircleCheck = duotone(PCheckCircle, 'CircleCheck');
export const CircleDollarSign = duotone(PCurrencyCircleDollar, 'CircleDollarSign');
export const Clock = duotone(PClock, 'Clock');
export const Clock3 = duotone(PClock, 'Clock3');
export const Coins = duotone(PCoins, 'Coins');
export const Compass = duotone(PCompass, 'Compass');
export const Container = duotone(PShippingContainer, 'Container');
export const Copy = duotone(PCopy, 'Copy');
export const CornerDownLeft = duotone(PArrowElbowDownLeft, 'CornerDownLeft');
export const CreditCard = duotone(PCreditCard, 'CreditCard');
export const Crown = duotone(PCrown, 'Crown');
export const Download = duotone(PDownloadSimple, 'Download');
export const ExternalLink = duotone(PArrowSquareOut, 'ExternalLink');
export const Eye = duotone(PEye, 'Eye');
export const EyeOff = duotone(PEyeSlash, 'EyeOff');
export const FileBarChart = duotone(PPresentationChart, 'FileBarChart');
export const FileSpreadsheet = duotone(PFileXls, 'FileSpreadsheet');
export const FileText = duotone(PFileText, 'FileText');
export const Filter = duotone(PFunnel, 'Filter');
export const Flame = duotone(PFire, 'Flame');
export const Gauge = duotone(PGauge, 'Gauge');
export const Gift = duotone(PGift, 'Gift');
export const Globe = duotone(PGlobe, 'Globe');
export const GripVertical = duotone(PDotsSixVertical, 'GripVertical');
export const HandCoins = duotone(PHandCoins, 'HandCoins');
export const Hash = duotone(PHash, 'Hash');
export const HeartPulse = duotone(PHeartbeat, 'HeartPulse');
export const HelpCircle = duotone(PQuestion, 'HelpCircle');
export const History = duotone(PClockCounterClockwise, 'History');
export const Hourglass = duotone(PHourglass, 'Hourglass');
export const ImageOff = duotone(PImageBroken, 'ImageOff');
export const Inbox = duotone(PTray, 'Inbox');
export const Info = duotone(PInfo, 'Info');
export const KeyRound = duotone(PKey, 'KeyRound');
export const Landmark = duotone(PBank, 'Landmark');
export const Layers = duotone(PStack, 'Layers');
export const Layers3 = duotone(PStackSimple, 'Layers3');
export const LayoutDashboard = duotone(PSquaresFour, 'LayoutDashboard');
export const LayoutGrid = duotone(PGridFour, 'LayoutGrid');
export const LifeBuoy = duotone(PLifebuoy, 'LifeBuoy');
export const Lightbulb = duotone(PLightbulb, 'Lightbulb');
export const Link2 = duotone(PLink, 'Link2');
export const Loader2 = duotone(PCircleNotch, 'Loader2');
export const Lock = duotone(PLock, 'Lock');
export const LogIn = duotone(PSignIn, 'LogIn');
export const LogOut = duotone(PSignOut, 'LogOut');
export const MapPin = duotone(PMapPin, 'MapPin');
export const Megaphone = duotone(PMegaphone, 'Megaphone');
export const Menu = duotone(PList, 'Menu');
export const MessageSquare = duotone(PChat, 'MessageSquare');
export const MessageSquareOff = duotone(PChatSlash, 'MessageSquareOff');
export const MessageSquareReply = duotone(PArrowBendUpLeft, 'MessageSquareReply');
export const Minus = duotone(PMinus, 'Minus');
export const Moon = duotone(PMoon, 'Moon');
export const NotebookPen = duotone(PNotePencil, 'NotebookPen');
export const Package = duotone(PPackage, 'Package');
export const PackageCheck = duotone(PPackage, 'PackageCheck');
export const PackageOpen = duotone(PPackage, 'PackageOpen');
export const PackagePlus = duotone(PBoxArrowDown, 'PackagePlus');
export const PackageSearch = duotone(PListMagnifyingGlass, 'PackageSearch');
export const PackageX = duotone(PSealWarning, 'PackageX');
export const Palette = duotone(PPalette, 'Palette');
export const PanelLeftClose = duotone(PSidebarSimple, 'PanelLeftClose');
export const PartyPopper = duotone(PConfetti, 'PartyPopper');
export const Pencil = duotone(PPencilSimple, 'Pencil');
export const Percent = duotone(PPercent, 'Percent');
export const Phone = duotone(PPhone, 'Phone');
export const PieChart = duotone(PChartPie, 'PieChart');
export const PiggyBank = duotone(PPiggyBank, 'PiggyBank');
export const Plane = duotone(PAirplane, 'Plane');
export const Play = duotone(PPlay, 'Play');
export const PlayCircle = duotone(PPlayCircle, 'PlayCircle');
export const Plus = duotone(PPlus, 'Plus');
export const PlusCircle = duotone(PPlusCircle, 'PlusCircle');
export const Printer = duotone(PPrinter, 'Printer');
export const Receipt = duotone(PReceipt, 'Receipt');
export const ReceiptText = duotone(PReceipt, 'ReceiptText');
export const RefreshCw = duotone(PArrowsClockwise, 'RefreshCw');
export const Rocket = duotone(PRocketLaunch, 'Rocket');
export const RotateCcw = duotone(PArrowCounterClockwise, 'RotateCcw');
export const Route = duotone(PPath, 'Route');
export const Rows3 = duotone(PRows, 'Rows3');
export const Save = duotone(PFloppyDisk, 'Save');
export const Scale = duotone(PScales, 'Scale');
export const ScanBarcode = duotone(PBarcode, 'ScanBarcode');
export const Search = duotone(PMagnifyingGlass, 'Search');
export const Send = duotone(PPaperPlaneTilt, 'Send');
export const Settings = duotone(PGearSix, 'Settings');
export const Settings2 = duotone(PSlidersHorizontal, 'Settings2');
export const Share2 = duotone(PShareNetwork, 'Share2');
export const ShieldAlert = duotone(PShieldWarning, 'ShieldAlert');
export const ShieldCheck = duotone(PShieldCheck, 'ShieldCheck');
export const Ship = duotone(PBoat, 'Ship');
export const ShoppingBag = duotone(PShoppingBag, 'ShoppingBag');
export const ShoppingCart = duotone(PShoppingCart, 'ShoppingCart');
export const SlidersHorizontal = duotone(PSlidersHorizontal, 'SlidersHorizontal');
export const Snowflake = duotone(PSnowflake, 'Snowflake');
export const Sparkles = duotone(PSparkle, 'Sparkles');
export const Star = duotone(PStar, 'Star');
export const Store = duotone(PStorefront, 'Store');
export const Sun = duotone(PSun, 'Sun');
export const Table2 = duotone(PTable, 'Table2');
export const Tag = duotone(PTag, 'Tag');
export const Tags = duotone(PTag, 'Tags');
export const Target = duotone(PTarget, 'Target');
export const ThumbsUp = duotone(PThumbsUp, 'ThumbsUp');
export const Timer = duotone(PTimer, 'Timer');
export const Trash2 = duotone(PTrash, 'Trash2');
export const TrendingDown = duotone(PTrendDown, 'TrendingDown');
export const TrendingUp = duotone(PTrendUp, 'TrendingUp');
export const Trophy = duotone(PTrophy, 'Trophy');
export const Truck = duotone(PTruck, 'Truck');
export const Undo2 = duotone(PArrowUUpLeft, 'Undo2');
export const User = duotone(PUser, 'User');
export const UserPlus = duotone(PUserPlus, 'UserPlus');
export const UserRound = duotone(PUserCircle, 'UserRound');
export const Users = duotone(PUsers, 'Users');
export const Wallet = duotone(PWallet, 'Wallet');
export const Wallet2 = duotone(PWallet, 'Wallet2');
export const Wand2 = duotone(PMagicWand, 'Wand2');
export const Warehouse = duotone(PWarehouse, 'Warehouse');
export const X = duotone(PX, 'X');
export const XCircle = duotone(PXCircle, 'XCircle');
export const Zap = duotone(PLightning, 'Zap');
