/**
 * US holidays for the Countdowns panel: federal holidays plus the family ones people count
 * down to (Mother's Day, Halloween, Christmas Eve…). Worked out from the calendar, so they
 * never need storing or cleaning up.
 */

export interface Holiday {
  /** Stable id, the same every year ("thanksgiving"). */
  key: string
  title: string
  /** YYYY-MM-DD */
  date: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** The nth weekday (0 = Sunday) of a month; n = -1 for the last one. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
    return key(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7)
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const last = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay()
  return key(year, month, lastDay - ((last - weekday + 7) % 7))
}

/** Western (Gregorian) Easter Sunday, by the anonymous Gregorian algorithm. */
export function easter(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return key(year, month, day)
}

export function usHolidays(year: number): Holiday[] {
  const list: Holiday[] = [
    { key: 'new-year', title: 'New Year’s Day', date: key(year, 1, 1) },
    { key: 'mlk', title: 'Martin Luther King Jr. Day', date: nthWeekday(year, 1, 1, 3) },
    { key: 'valentines', title: 'Valentine’s Day', date: key(year, 2, 14) },
    { key: 'presidents', title: 'Presidents’ Day', date: nthWeekday(year, 2, 1, 3) },
    { key: 'st-patricks', title: 'St. Patrick’s Day', date: key(year, 3, 17) },
    { key: 'easter', title: 'Easter', date: easter(year) },
    { key: 'mothers', title: 'Mother’s Day', date: nthWeekday(year, 5, 0, 2) },
    { key: 'memorial', title: 'Memorial Day', date: nthWeekday(year, 5, 1, -1) },
    { key: 'fathers', title: 'Father’s Day', date: nthWeekday(year, 6, 0, 3) },
    { key: 'juneteenth', title: 'Juneteenth', date: key(year, 6, 19) },
    { key: 'independence', title: 'Independence Day', date: key(year, 7, 4) },
    { key: 'labor', title: 'Labor Day', date: nthWeekday(year, 9, 1, 1) },
    { key: 'columbus', title: 'Columbus Day', date: nthWeekday(year, 10, 1, 2) },
    { key: 'halloween', title: 'Halloween', date: key(year, 10, 31) },
    { key: 'veterans', title: 'Veterans Day', date: key(year, 11, 11) },
    { key: 'thanksgiving', title: 'Thanksgiving', date: nthWeekday(year, 11, 4, 4) },
    { key: 'christmas-eve', title: 'Christmas Eve', date: key(year, 12, 24) },
    { key: 'christmas', title: 'Christmas', date: key(year, 12, 25) },
    { key: 'new-years-eve', title: 'New Year’s Eve', date: key(year, 12, 31) },
  ]
  return list.sort((a, b) => a.date.localeCompare(b.date))
}

/** Holidays from today through `days` ahead (spanning the new year). */
export function upcomingHolidays(today: string, days: number): Holiday[] {
  const year = Number(today.slice(0, 4))
  const [y, m, d] = today.split('-').map(Number)
  const end = new Date(Date.UTC(y, m - 1, d + days))
  const last = key(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate())
  return [...usHolidays(year), ...usHolidays(year + 1)].filter((h) => h.date >= today && h.date <= last)
}
