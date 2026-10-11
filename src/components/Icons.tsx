// One icon set for the whole app: Lucide (rounded 24px line icons), always at a
// 1.75 stroke so every icon has the same weight. See docs/STYLE-GUIDE.md → Icons.
import {
  AlarmClock,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarDays,
  Check,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  CloudSun,
  Droplets,
  ExternalLink,
  Globe,
  House,
  Images,
  LayoutGrid,
  MapPin,
  ListChecks,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Snowflake,
  Sparkles,
  SquareCheckBig,
  Star,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Timer,
  Trash2,
  TriangleAlert,
  UtensilsCrossed,
  WifiOff,
  Wind,
  X,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react'
import type { SVGProps } from 'react'

export const ICON_STROKE = 1.75

/** Wraps a Lucide icon with the app's defaults (decorative unless labelled). */
export function icon(Glyph: LucideIcon) {
  const Icon = (p: SVGProps<SVGSVGElement> & LucideProps) => <Glyph size={22} strokeWidth={ICON_STROKE} aria-hidden {...p} />
  Icon.displayName = Glyph.displayName
  return Icon
}

export const HomeIcon = icon(House)
export const CalendarIcon = icon(CalendarDays)
export const ListsIcon = icon(ListChecks)
export const ChoresIcon = icon(SquareCheckBig)
export const RewardsIcon = icon(Star)
export const MealsIcon = icon(UtensilsCrossed)
export const RecipesIcon = icon(BookOpen)
export const PhotosIcon = icon(Images)
export const MoreIcon = icon(LayoutGrid)
export const SettingsIcon = icon(Settings)
export const WeatherIcon = icon(CloudSun)

/** Button glyphs: arrows for paging, plus for "add". */
export const BackIcon = icon(ChevronLeft)
export const NextIcon = icon(ChevronRight)
export const AddIcon = icon(Plus)
export const RemoveIcon = icon(Minus)
/** Close a sheet, dismiss, or delete an item (never a text ✕). */
export const CloseIcon = icon(X)
export const CartIcon = icon(ShoppingCart)
/** A done count ("3/5"), a ticked menu item, and the Up for Grabs badge. */
export const DoneIcon = icon(Check)
export const GrabsIcon = icon(Sparkles)

/** Everything else the app draws, each once, at the app's stroke. */
export const AlarmClockIcon = icon(AlarmClock)
export const AlertIcon = icon(TriangleAlert)
export const ArrowDownIcon = icon(ArrowDown)
export const ArrowUpIcon = icon(ArrowUp)
export const BookIcon = icon(BookOpen)
export const ChefHatIcon = icon(ChefHat)
export const ChevronDownIcon = icon(ChevronDown)
export const CloudRainIcon = icon(CloudRain)
export const CollapseIcon = icon(Minimize2)
export const DropletsIcon = icon(Droplets)
export const ExpandIcon = icon(Maximize2)
export const ExternalLinkIcon = icon(ExternalLink)
export const FiltersIcon = icon(SlidersHorizontal)
export const GlobeIcon = icon(Globe)
export const MapPinIcon = icon(MapPin)
export const MicIcon = icon(Mic)
export const MicOffIcon = icon(MicOff)
export const PauseIcon = icon(Pause)
export const PencilIcon = icon(Pencil)
export const PlayIcon = icon(Play)
export const RefreshCwIcon = icon(RefreshCw)
export const SearchIcon = icon(Search)
export const SnowflakeIcon = icon(Snowflake)
export const StarIcon = icon(Star)
export const SunIcon = icon(Sun)
export const SunriseIcon = icon(Sunrise)
export const SunsetIcon = icon(Sunset)
export const ThermometerIcon = icon(Thermometer)
export const TimerIcon = icon(Timer)
export const TrashIcon = icon(Trash2)
export const WindIcon = icon(Wind)
export const OfflineIcon = icon(WifiOff)

