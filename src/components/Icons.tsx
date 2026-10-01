// One icon set for the whole app: Lucide (rounded 24px line icons), always at a
// 1.75 stroke so every icon has the same weight. See docs/STYLE-GUIDE.md → Icons.
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  House,
  Images,
  LayoutGrid,
  ListChecks,
  Plus,
  Settings,
  SquareCheckBig,
  Star,
  UtensilsCrossed,
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

/** Button glyphs: arrows for paging, plus for "add". */
export const BackIcon = icon(ChevronLeft)
export const NextIcon = icon(ChevronRight)
export const AddIcon = icon(Plus)
