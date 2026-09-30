import { useState } from 'react'
import { ALWAYS_SHOWN, TABS } from '../../components/navTabs'
import { DEVICE_LABELS, type Device, type DevicePref } from '../../lib/device'
import { useDevice } from '../../lib/DeviceContext'
import { SelectRow, SettingsSection } from './SettingRows'
import { useSettings } from './SettingsContext'
import type { DisplaySettings } from './settingsApi'

const DEVICES: Device[] = ['phone', 'tablet', 'desktop']

type Hidden = DisplaySettings['hiddenTabs']

/** Which sections show in the side bar, per kind of device. A checked box means shown. */
export function SidebarGrid({ hidden, current, onChange }: { hidden: Hidden; current: Device; onChange: (next: Hidden) => void }) {
  // Build each change on the last one sent, not on props that may not have caught up yet,
  // so quick taps in a row all stick.
  const [local, setLocal] = useState(hidden)
  const [seen, setSeen] = useState(hidden)
  if (seen !== hidden) {
    setSeen(hidden)
    setLocal(hidden)
  }
  const toggle = (device: Device, tab: string, show: boolean) => {
    const list = new Set(local[device] ?? [])
    if (show) list.delete(tab)
    else list.add(tab)
    const next = { ...local, [device]: [...list] }
    setLocal(next)
    onChange(next)
  }
  return (
    <table className="sidebar-grid">
      <thead>
        <tr>
          <th scope="col">Section</th>
          {DEVICES.map((d) => (
            <th key={d} scope="col" className={d === current ? 'sidebar-grid__current' : undefined}>
              {DEVICE_LABELS[d]}
              {d === current && <span className="sidebar-grid__this">This device</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {TABS.map(({ id, label, Icon }) => (
          <tr key={id}>
            <th scope="row">
              <span className="sidebar-grid__tab">
                <Icon aria-hidden />
                {label}
              </span>
            </th>
            {DEVICES.map((d) => (
              <td key={d} className={d === current ? 'sidebar-grid__current' : undefined}>
                <input
                  type="checkbox"
                  aria-label={`Show ${label} on ${DEVICE_LABELS[d].toLowerCase()}`}
                  checked={id === ALWAYS_SHOWN || !local[d]?.includes(id)}
                  disabled={id === ALWAYS_SHOWN}
                  onChange={(e) => toggle(d, id, e.target.checked)}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function DeviceSettings() {
  const { settings, update } = useSettings()
  const { device, detected, pref, setPref } = useDevice()
  const options: { value: DevicePref; label: string }[] = [
    { value: 'auto', label: `Automatic (${DEVICE_LABELS[detected]})` },
    ...DEVICES.map((d) => ({ value: d as DevicePref, label: DEVICE_LABELS[d] })),
  ]
  return (
    <SettingsSection title="Device & side bar" id="device">
      <SelectRow label="This device is a" value={pref} options={options} onChange={setPref} />
      <p className="settings-note">
        Phones get a bottom bar and lists; tablets get the wall display that fits the screen, with sleep mode and the photo screensaver; computers get the full layout for a mouse.
        This choice is saved on this device only.
      </p>
      <div className="setting-row setting-row--stacked">
        <span className="setting-row__label">
          Side bar
          <span className="setting-row__hint">Choose the sections each kind of device shows. On phones, the first four go in the bottom bar and the rest under More. Settings always shows.</span>
        </span>
        <SidebarGrid hidden={settings.hiddenTabs} current={device} onChange={(hiddenTabs) => void update({ hiddenTabs })} />
      </div>
    </SettingsSection>
  )
}
