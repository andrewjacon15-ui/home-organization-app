import type { Tab } from '../../components/navTabs'
import type { Device } from '../../lib/device'

/** People who joined before the tour existed already know their way around. */
export const TOUR_SINCE = new Date('2026-10-03T12:00:00Z')
const seenKey = (familyId: string, userId: string) => `welcomed:${familyId}:${userId}`

export interface TourMember {
  joinedAt?: { toDate(): Date } | null
  welcomedAt?: unknown
}

/** Show the tour to someone new to this household who hasn't seen it (here or on another device). */
export function shouldWelcome(member: TourMember | undefined, familyId: string, userId: string): boolean {
  if (!member || member.welcomedAt) return false
  const joined = member.joinedAt?.toDate?.()
  if (!joined || joined < TOUR_SINCE) return false
  try {
    return localStorage.getItem(seenKey(familyId, userId)) !== '1'
  } catch {
    return true
  }
}

export function rememberWelcomed(familyId: string, userId: string) {
  try {
    localStorage.setItem(seenKey(familyId, userId), '1')
  } catch {
    // The member document remembers it too.
  }
}

export type Platform = 'ios' | 'android' | 'other'
export function detectPlatform(ua = navigator.userAgent, touchMac = navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)): Platform {
  if (/iPhone|iPad|iPod/.test(ua) || touchMac) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

export interface TourStep {
  title: string
  text: string
  /** Optional shortcut to the part of the app the step talks about. */
  go?: { tab: Tab; label: string }
}

/** The tour: what each part of the app is for, then setup for this kind of device. */
export function tourSteps(household: string, device: Device, platform: Platform): TourStep[] {
  const install: TourStep =
    device === 'tablet'
      ? {
          title: 'On a wall or counter',
          text: 'This screen can stay on as the family display. In Settings, set Device & side bar to Tablet, choose when it dims at night (Sleep mode), and pick photos to show when nobody’s using it (Photos & screensaver).',
          go: { tab: 'settings', label: 'Open Settings' },
        }
      : platform === 'ios'
        ? { title: 'Keep it one tap away', text: 'In Safari, tap the Share button (the square with an arrow), then Add to Home Screen. It opens full screen like an app, and stays signed in.' }
        : platform === 'android'
          ? { title: 'Keep it one tap away', text: 'In Chrome, tap the ⋮ menu, then Add to home screen (or Install app). It opens full screen like an app, and stays signed in.' }
          : { title: 'Keep it one click away', text: 'Install it from the icon at the right of the address bar (Chrome or Edge), or bookmark this page. It stays signed in.' }
  return [
    {
      title: `Welcome to ${household}`,
      text: 'This is your household’s shared organizer: calendar, lists, chores, meals and photos. Everything you add is shared with the people in your household, and only them. Here’s a quick look around.',
    },
    {
      title: 'Home',
      text: 'Today at a glance: countdowns, the lists, today’s tasks and the next few days of the calendar. Choose what shows in Settings → Home screen.',
      go: { tab: 'home', label: 'Open Home' },
    },
    {
      title: 'Calendar',
      text: 'Everyone’s plans in one place, colored by person. Add events here, or bring in your Google Calendar from Settings → Google Calendar so your own events show up too.',
      go: { tab: 'calendar', label: 'Open Calendar' },
    },
    {
      title: 'Lists and chores',
      text: 'Add to the grocery or to-do list from any device and it updates everywhere. Chores show who’s doing what today; finishing them earns stars toward rewards.',
      go: { tab: 'lists', label: 'Open Lists' },
    },
    {
      title: 'Meals and recipes',
      text: 'Plan the week’s meals, save family recipes, and send the ingredients for upcoming meals to the grocery list in one go. Cooking mode keeps the screen on and scales any recipe.',
      go: { tab: 'meals', label: 'Open Meals' },
    },
    install,
    {
      title: 'Make it yours',
      text: 'Pick your name and color in Settings → Family, and turn on reminders in Settings → Reminders. You can see this tour again any time from Settings → About.',
      go: { tab: 'settings', label: 'Open Settings' },
    },
  ]
}
