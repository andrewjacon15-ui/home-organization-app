import { ArrowDown, ArrowUp } from 'lucide-react'
import { useState } from 'react'
import { ICON_STROKE } from '../../components/Icons'
import { DEVICE_LABELS, type Device } from '../../lib/device'
import { useDevice } from '../../lib/DeviceContext'
import { HOME_PANELS, homePanelsFor, type HomePanel } from '../home/homePanels'
import { SettingsSection } from './SettingRows'
import { useSettings } from './SettingsContext'
import type { DisplaySettings } from './settingsApi'

const DEVICES: Device[] = ['tablet', 'phone', 'desktop']
type Setting = DisplaySettings['homePanels']

/** Which panels a device's Home shows, top to bottom: tick to show, arrows to reorder. */
export function HomePanelEditor({ value, device, onChange }: { value: Setting; device: Device; onChange: (next: Setting) => void }) {
  // Build each change on the last one sent (quick taps in a row all stick).
  const [local, setLocal] = useState(value)
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setLocal(value)
  }
  const shown = homePanelsFor(local, device)
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
              <ArrowUp size={18} strokeWidth={ICON_STROKE} aria-hidden />
            </button>
            <button type="button" className="icon-button" aria-label={`Move ${label(id)} down`} disabled={!on || i === shown.length - 1} onClick={() => move(id, 1)}>
              <ArrowDown size={18} strokeWidth={ICON_STROKE} aria-hidden />
            </button>
          </li>
        )
      })}
    </ol>
  )
}

export function HomeScreenSettings() {
  const { settings, update } = useSettings()
  const { device: current } = useDevice()
  const [device, setDevice] = useState<Device>(current)
  return (
    <SettingsSection title="Home screen" id="home">
      <p className="settings-note">Choose what the Home screen shows and in what order, top to bottom. Each kind of device has its own; hidden panels don't load at all.</p>
      <div className="segmented" role="group" aria-label="Device">
        {DEVICES.map((d) => (
          <button key={d} type="button" className={`segmented__item${d === device ? ' segmented__item--active' : ''}`} aria-pressed={d === device} onClick={() => setDevice(d)}>
            {DEVICE_LABELS[d]}
            {d === current ? ' (this one)' : ''}
          </button>
        ))}
      </div>
      <HomePanelEditor value={settings.homePanels} device={device} onChange={(homePanels) => void update({ homePanels })} />
    </SettingsSection>
  )
}
