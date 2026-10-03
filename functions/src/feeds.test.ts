import { describe, expect, it } from 'vitest'
import { CalendarError } from './calendar.js'
import { addFeed, feedUrl, parseFeed, removeFeed, syncAllFeeds, zonedToUtc, type FeedCalendar, type FeedStore } from './feeds.js'
import type { EventDoc } from './types.js'

const ics = (...lines: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', ...lines, 'END:VCALENDAR'].join('\r\n')

const NY_ZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:America/New_York',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'TZNAME:EDT',
  'DTSTART:20070311T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'TZNAME:EST',
  'DTSTART:20071104T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

// What Apple's "Public Calendar" link serves: a name, a zone, a weekly series with one week
// skipped and one moved, plus a one-off.
const APPLE = ics(
  'X-WR-CALNAME:Soccer',
  ...NY_ZONE,
  'BEGIN:VEVENT',
  'UID:practice-1',
  'SUMMARY:Practice',
  'LOCATION:Field 3',
  'DTSTART;TZID=America/New_York:20261001T170000',
  'DTEND;TZID=America/New_York:20261001T183000',
  'RRULE:FREQ=WEEKLY;COUNT=6',
  'EXDATE;TZID=America/New_York:20261015T170000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:practice-1',
  'RECURRENCE-ID;TZID=America/New_York:20261022T170000',
  'SUMMARY:Practice (moved)',
  'DTSTART;TZID=America/New_York:20261023T090000',
  'DTEND;TZID=America/New_York:20261023T103000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:game-1',
  'SUMMARY:Home game',
  'DTSTART:20261010T140000Z',
  'DTEND:20261010T160000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:gone',
  'SUMMARY:Cancelled scrimmage',
  'STATUS:CANCELLED',
  'DTSTART:20261012T140000Z',
  'DTEND:20261012T160000Z',
  'END:VEVENT',
)

// A school calendar: all-day days off, one a long weekend, and a floating-time event.
const SCHOOL = ics(
  'BEGIN:VEVENT',
  'UID:break',
  'SUMMARY:Fall break',
  'DTSTART;VALUE=DATE:20261012',
  'DTEND;VALUE=DATE:20261015',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:picture-day',
  'SUMMARY:Picture day',
  'DTSTART;VALUE=DATE:20261020',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:open-house',
  'SUMMARY:Open house',
  'DTSTART:20261008T183000',
  'DTEND:20261008T200000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:old',
  'SUMMARY:Last year',
  'DTSTART;VALUE=DATE:20250901',
  'END:VEVENT',
)

const FROM = new Date('2026-09-01T00:00:00Z')
const TO = new Date('2027-01-01T00:00:00Z')

describe('calendar link URLs', () => {
  it('turns webcal into https and refuses private addresses', () => {
    expect(feedUrl(' webcal://p52-caldav.icloud.com/published/2/abc ')).toBe('https://p52-caldav.icloud.com/published/2/abc')
    expect(feedUrl('https://calendar.google.com/calendar/ical/x/public/basic.ics#top')).toBe('https://calendar.google.com/calendar/ical/x/public/basic.ics')
    for (const bad of ['', 'not a link', 'ftp://x.com/a.ics', 'http://localhost/a.ics', 'http://169.254.169.254/computeMetadata', 'https://10.0.0.5/cal.ics', 'http://[::1]/x', 'http://metadata.google.internal/']) {
      expect(() => feedUrl(bad)).toThrow(CalendarError)
    }
  })
})

describe('parseFeed', () => {
  it('expands repeats, skips excluded and cancelled ones, moves exceptions, and converts zones', () => {
    const { name, events } = parseFeed(APPLE, FROM, TO, 'America/Chicago')
    expect(name).toBe('Soccer')
    const titles = events.map((e) => `${e.title} ${e.start.toISOString()}`).sort()
    expect(titles).toEqual([
      'Home game 2026-10-10T14:00:00.000Z',
      'Practice (moved) 2026-10-23T13:00:00.000Z',
      'Practice 2026-10-01T21:00:00.000Z', // 5 PM EDT
      'Practice 2026-10-08T21:00:00.000Z',
      'Practice 2026-10-29T21:00:00.000Z',
      'Practice 2026-11-05T22:00:00.000Z', // 5 PM EST after the clocks change
    ])
    expect(events.find((e) => e.title === 'Home game')?.location).toBeUndefined()
    expect(events.find((e) => e.start.toISOString() === '2026-10-01T21:00:00.000Z')).toMatchObject({ location: 'Field 3', end: new Date('2026-10-01T22:30:00Z') })
    // Each occurrence has its own stable id.
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length)
  })

  it('keeps all-day dates as dates and reads floating times in the family zone', () => {
    const { events } = parseFeed(SCHOOL, FROM, TO, 'America/Chicago')
    expect(events.find((e) => e.title === 'Fall break')).toMatchObject({ allDay: true, startDate: '2026-10-12', endDate: '2026-10-15' })
    expect(events.find((e) => e.title === 'Picture day')).toMatchObject({ allDay: true, startDate: '2026-10-20', endDate: '2026-10-21' })
    expect(events.find((e) => e.title === 'Open house')?.start.toISOString()).toBe('2026-10-08T23:30:00.000Z') // 6:30 PM CDT
    expect(events.some((e) => e.title === 'Last year')).toBe(false)
  })

  it('explains a link that is a web page, not a calendar', () => {
    expect(() => parseFeed('<!doctype html><html></html>', FROM, TO, 'UTC')).toThrow(/calendar file/)
  })

  it('handles daylight saving when converting wall-clock times', () => {
    expect(zonedToUtc(2026, 7, 1, 9, 0, 0, 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z')
    expect(zonedToUtc(2026, 12, 1, 9, 0, 0, 'America/New_York').toISOString()).toBe('2026-12-01T14:00:00.000Z')
    expect(zonedToUtc(2026, 12, 1, 9, 0, 0, 'Not/AZone').toISOString()).toBe('2026-12-01T09:00:00.000Z')
  })
})

function fakeStore() {
  const feeds = new Map<string, FeedCalendar>()
  const events = new Map<string, EventDoc>()
  let writes = 0
  const store: FeedStore = {
    isMember: async (_f, uid) => uid !== 'stranger',
    familyTimezone: async () => 'America/New_York',
    listFeeds: async () => [...feeds.values()].map((feed) => ({ familyId: 'f', feed })),
    getFeed: async (_f, key) => feeds.get(key) ?? null,
    saveFeed: async (_f, feed) => void feeds.set(feed.key, feed),
    setFeedStatus: async (_f, key, s) => void feeds.set(key, { ...feeds.get(key)!, ...s }),
    deleteFeed: async (_f, key) => void feeds.delete(key),
    listFeedEvents: async (_f, key) => new Map([...events].filter(([, e]) => e.calendarKey === key)),
    upsertEvents: async (_f, list) => {
      writes += list.length
      for (const { id, data } of list) events.set(id, data)
    },
    deleteEvents: async (_f, ids) => {
      writes += ids.length
      for (const id of ids) events.delete(id)
    },
  }
  return { store, feeds, events, writes: () => writes }
}

describe('adding and syncing calendar links', () => {
  const now = new Date('2026-10-03T12:00:00Z')

  it('checks the link, names it from the file, and brings in its events', async () => {
    const s = fakeStore()
    const result = await addFeed({ store: s.store, fetchFeed: async () => APPLE, now }, 'andrew', { familyId: 'f', url: 'webcal://p52-caldav.icloud.com/published/2/abc' })
    expect(result).toMatchObject({ name: 'Soccer', eventCount: 6 })
    const feed = s.feeds.get(result.key)!
    expect(feed).toMatchObject({ kind: 'ics', url: 'https://p52-caldav.icloud.com/published/2/abc', ownerId: 'andrew', memberIds: ['andrew'], enabled: true, error: null, eventCount: 6 })
    expect([...s.events.values()].every((e) => e.source === 'ics' && e.calendarKey === result.key)).toBe(true)
    await expect(addFeed({ store: s.store, fetchFeed: async () => APPLE, now }, 'andrew', { familyId: 'f', url: 'https://p52-caldav.icloud.com/published/2/abc' })).rejects.toThrow(/already added/)
  })

  it('refuses non-members and bad files without saving anything', async () => {
    const s = fakeStore()
    await expect(addFeed({ store: s.store, fetchFeed: async () => APPLE }, 'stranger', { familyId: 'f', url: 'https://x.com/a.ics' })).rejects.toThrow(/Not a member/)
    await expect(addFeed({ store: s.store, fetchFeed: async () => '<html>' }, 'andrew', { familyId: 'f', url: 'https://x.com/a.ics' })).rejects.toThrow(/calendar file/)
    expect(s.feeds.size).toBe(0)
  })

  it('writes only what changed, about once an hour, and keeps events when a link breaks', async () => {
    const s = fakeStore()
    let text = SCHOOL
    const fetchFeed = async () => {
      if (text === 'down') throw new Error('ECONNRESET')
      return text
    }
    const { key } = await addFeed({ store: s.store, fetchFeed, now }, 'andrew', { familyId: 'f', url: 'https://school.example.org/cal.ics', name: 'School' })
    const before = s.writes()

    // 15 minutes later: too soon, skipped.
    expect(await syncAllFeeds({ store: s.store, fetchFeed, now: new Date(now.getTime() + 15 * 60_000) })).toMatchObject({ skipped: 1 })

    // An hour later with Picture day removed: one delete, nothing rewritten.
    text = SCHOOL.replace(/BEGIN:VEVENT\r\nUID:picture-day[\s\S]*?END:VEVENT\r\n/, '')
    expect(await syncAllFeeds({ store: s.store, fetchFeed, now: new Date(now.getTime() + 61 * 60_000) })).toMatchObject({ synced: 1 })
    expect(s.writes() - before).toBe(1)
    expect([...s.events.values()].map((e) => e.title).sort()).toEqual(['Fall break', 'Open house'])

    // The link goes down: events stay, the error is shown in Settings.
    text = 'down'
    expect(await syncAllFeeds({ store: s.store, fetchFeed, now: new Date(now.getTime() + 122 * 60_000) })).toMatchObject({ failed: 1 })
    expect(s.events.size).toBe(2)
    expect(s.feeds.get(key)?.error).toMatch(/ECONNRESET/)

    await removeFeed({ store: s.store }, 'andrew', { familyId: 'f', key })
    expect(s.events.size).toBe(0)
    expect(s.feeds.size).toBe(0)
  })

  it('removes a hidden link’s events', async () => {
    const s = fakeStore()
    const { key } = await addFeed({ store: s.store, fetchFeed: async () => SCHOOL, now }, 'andrew', { familyId: 'f', url: 'https://school.example.org/cal.ics' })
    s.feeds.set(key, { ...s.feeds.get(key)!, enabled: false, lastSyncAt: new Date(0) })
    await syncAllFeeds({ store: s.store, fetchFeed: async () => SCHOOL, now })
    expect(s.events.size).toBe(0)
  })
})
