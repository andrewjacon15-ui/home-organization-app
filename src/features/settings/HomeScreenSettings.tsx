import { useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon } from '../../components/Icons'
import { DEVICE_LABELS, type Device } from '../../lib/device'
import { useDevice } from '../../lib/DeviceContext'
import { HOME_CALENDAR_DAYS, HOME_PANELS, HOME_PANELS_VERSION, homeCalendarDays, homePanelsFor, type HomePanel } from '../home/homePanels'
import { SettingsSection } from './SettingRows'
import { useSettings } from './SettingsContext'
import { homeStyleFor, type DisplaySettings } from './settingsApi'

const DEVICES: Device[] = ['tablet', 'phone', 'desktop']
type Setting = DisplaySettings['homePanels']

/** Which panels a device's Home shows, top to bottom: tick to show, arrows to reorder. */
export function HomePanelEditor({ value, device, version = HOME_PANELS_VERSION, onChange }: { value: Setting; device: Device; version?: number; onChange: (next: Setting) => void }) {
  // Build each change on the last one sent (quick taps in a row all stick).
  const [local, setLocal] = useState(value)
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setLocal(value)
  }
  // Once anything is saved the lists are current; until then, show what Home shows.
  const shown = homePanelsFor(local, device, local === value ? version : HOME_PANELS_VERSION)
  // Shown panels in their order, then the hidden ones.
  const rows = [...shown, ...HOME_PANELS.map((p) => p.id).filter((id) => !shown.includes(id))]
  const commit = (list: HomePanel[]) => {
    const next = { ...local, [device]: list }
    setLocal(next)
    onChange(next)
  }
  const move = (id: HomePanel, by: -1 | 1) => {
    const i = shown.indexOf(id)
    const j = i + by
    if (i < 0 || j < 0 || j >= shown.length) return
    const list = [...shown]
    ;[list[i], list[j]] = [list[j], list[i]]
    commit(list)
  }
  const label = (id: HomePanel) => HOME_PANELS.find((p) => p.id === id)!.label

  return (
    <ol className="home-panels" aria-label={`Home screen on ${DEVICE_LABELS[device].toLowerCase()}`}>
      {rows.map((id) => {
        const on = shown.includes(id)
        const i = shown.indexOf(id)
        return (
          <li key={id} className={`home-panels__row${on ? '' : ' home-panels__row--off'}`}>
            <label className="home-panels__label">
              <input type="checkbox" checked={on} onChange={(e) => commit(e.target.checked ? [...shown, id] : shown.filter((x) => x !== id))} />
              {label(id)}
            </label>
            <button type="button" className="icon-button" aria-label={`Move ${label(id)} up`} disabled={!on || i === 0} onClick={() => move(id, -1)}>
              <ArrowUpIcon size={18} />
            </button>
            <button type="button" className="icon-button" aria-label={`Move ${label(id)} down`} disabled={!on || i === shown.length - 1} onClick={() => move(id, 1)}>
              <ArrowDownIcon size={18} />
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** Saving brings every device's list up to date, not just the one being edited. */
function migrated(before: Setting, version: number, next: Setting): Setting {
  if (version >= HOME_PANELS_VERSION) return next
  const out: Setting = { ...next }
  for (const d of DEVICES) if (Array.isArray(before[d]) && next[d] === before[d]) out[d] = homePanelsFor(before, d, version)
  return out
}

/** 1, 3, or 7 days on the Home calendar (also switchable on the panel itself). */
export function HomeCalendarDaysRow() {
  const { settings, update } = useSettings()
  const days = homeCalendarDays(settings.homeCalendarDays)
  return (
    <div className="setting-row">
      <span className="setting-row__label" id="home-calendar-days">
        Calendar on Home
      </span>
      <div className="segmented" role="group" aria-labelledby="home-calendar-days">
        {HOME_CALENDAR_DAYS.map((n) => (
          <button key={n} type="button" className={`segmented__item${n === days ? ' segmented__item--active' : ''}`} aria-pressed={n === days} onClick={() => void update({ homeCalendarDays: n })}>
            {n === 1 ? '1 day' : `${n} days`}
          </button>
        ))}
      </div>
    </div>
  )
}

export function HomeScreenSettings() {
  const { settings, update } = useSettings()
  const { device: current } = useDevice()
  const [device, setDevice] = useState<Device>(current)
  return (
    <SettingsSection title="Home screen" id="home">
      <p className="settings-note">Each kind of device has its own Home: the daily summary (your day told in one screen), or panels you choose and order. Hidden panels don't load at all.</p>
      <div className="segmented" role="group" aria-label="Device">
        {DEVICES.map((d) => (
          <button key={d} type="button" className={`segmented__item${d === device ? ' segmented__item--active' : ''}`} aria-pressed={d === device} onClick={() => setDevice(d)}>
            {DEVICE_LABELS[d]}
            {d === current ? ' (this one)' : ''}
          </button>
        ))}
      </div>
      <div className="setting-row">
        <span className="setting-row__label" id="home-style">
          Home shows
          <span className="setting-row__hint">On {DEVICE_LABELS[device].toLowerCase()}s</span>
        </span>
        <div className="segmented" role="group" aria-labelledby="home-style">
          {(['summary', 'panels'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`segmented__item${homeStyleFor(settings, device) === v ? ' segmented__item--active' : ''}`}
              aria-pressed={homeStyleFor(settings, device) === v}
              onClick={() => void update({ homeStyle: { ...settings.homeStyle, [device]: v } })}
            >
              {v === 'summary' ? 'Daily summary' : 'Panels'}
            </button>
          ))}
        </div>
      </div>
      {homeStyleFor(settings, device) === 'panels' && (
      <HomePanelEditor
        value={settings.homePanels}
        device={device}
        version={settings.homePanelsVersion}
        onChange={(homePanels) => void update({ homePanels: migrated(settings.homePanels, settings.homePanelsVersion, homePanels), homePanelsVersion: HOME_PANELS_VERSION })}
      />
      )}
      {homeStyleFor(settings, device) === 'panels' && <HomeCalendarDaysRow />}
    </SettingsSection>
  )
}
