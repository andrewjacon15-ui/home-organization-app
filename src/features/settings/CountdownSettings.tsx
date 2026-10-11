import { useEffect, useState } from 'react'
import { CloseIcon } from '../../components/Icons'
import { fromDateKey } from '../../lib/dates'
import { useToday } from '../../lib/hooks'
import { useUndo } from '../../lib/undo'
import { CountdownForm } from '../countdowns/CountdownForm'
import {
  addCountdown,
  daysUntil,
  removeCountdown,
  shownCountdowns,
  untilLabel,
  watchCountdowns,
  watchGoogleSpecials,
  type Countdown,
  type GoogleSpecial,
} from '../countdowns/countdownsApi'
import { SettingsSection, ToggleRow } from './SettingRows'
import { useSettings } from './SettingsContext'

interface Api {
  watch: typeof watchCountdowns
  watchGoogle: typeof watchGoogleSpecials
  add: typeof addCountdown
  remove: typeof removeCountdown
}

const realApi: Api = { watch: watchCountdowns, watchGoogle: watchGoogleSpecials, add: addCountdown, remove: removeCountdown }

const KIND_LABEL = { once: 'One time', birthday: 'Birthday', anniversary: 'Anniversary', holiday: 'Holiday' } as const

/**
 * Settings → Countdowns: add trips, birthdays and anniversaries, see and remove the ones saved,
 * and choose whether holidays and Google Calendar birthdays join them. Home shows the soonest.
 */
export function CountdownSettings({ familyId, userId, api = realApi }: { familyId: string; userId: string; api?: Api }) {
  const { settings, update } = useSettings()
  const { offer } = useUndo()
  const today = useToday()
  const [saved, setSaved] = useState<Countdown[]>([])
  const [google, setGoogle] = useState<GoogleSpecial[]>([])
  const [error, setError] = useState<string | null>(null)
  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  useEffect(() => api.watch(familyId, setSaved), [api, familyId])
  useEffect(() => {
    if (settings.countdownGoogle) return api.watchGoogle(familyId, setGoogle)
  }, [api, familyId, settings.countdownGoogle])

  const list = shownCountdowns(saved, today, { holidays: false, google: settings.countdownGoogle ? google : [] })
  const fromGoogle = list.filter((c) => c.google).length

  return (
    <SettingsSection title="Countdowns" id="countdowns">
      <p className="settings-note">Home shows the next few. One-time countdowns go away the day after; birthdays and anniversaries repeat every year.</p>
      <CountdownForm today={today} autoFocus={false} onAdd={(title, date, kind) => void api.add(familyId, userId, title, date, kind).catch(report)} />
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      {list.length === 0 ? (
        <p className="muted">Nothing to count down to yet.</p>
      ) : (
        <ul className="countdown-list" aria-label="Your countdowns">
          {list.map((c) => {
            const n = daysUntil(c.date, today)
            const { count, unit } = untilLabel(n)
            const day = fromDateKey(c.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: c.date.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' })
            const meta = [KIND_LABEL[c.kind], day, c.detail, c.google ? 'From Google Calendar' : null].filter(Boolean).join(' · ')
            return (
              <li key={c.id} className="countdown-list__item">
                <span className="countdown-list__days" aria-label={unit ? `${count} ${unit}` : count}>
                  <span className="countdown-list__count">{count}</span>
                  {unit && <span className="countdown-list__unit">{unit}</span>}
                </span>
                <span className="countdown-list__text">
                  <span className="countdown-list__title">{c.title}</span>
                  <span className="countdown-list__meta">{meta}</span>
                </span>
                {c.source && (
                  <button
                    type="button"
                    className="icon-button countdown-list__remove"
                    aria-label={`Remove ${c.title}`}
                    onClick={() => api.remove(familyId, c.source!.id).then((r) => offer(`Removed “${c.title}”`, r), report)}
                  >
                    <CloseIcon size={16} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <ToggleRow
        label="Birthdays from Google Calendar"
        hint={`Birthdays and anniversaries of your Google contacts, from everyone’s connected Google Calendar, for the next four months. One you’ve added here isn’t shown twice.${settings.countdownGoogle && fromGoogle ? ` ${fromGoogle} coming up.` : ''}`}
        checked={settings.countdownGoogle}
        onChange={(v) => void update({ countdownGoogle: v })}
      />
      <ToggleRow
        label="US holidays"
        hint="Thanksgiving, Christmas, Mother’s Day and the rest, for the next two months."
        checked={settings.countdownHolidays}
        onChange={(v) => void update({ countdownHolidays: v })}
      />
    </SettingsSection>
  )
}
