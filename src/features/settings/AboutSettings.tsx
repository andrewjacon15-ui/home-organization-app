import { APP_VERSION, BUILD_TIME, reloadToLatest, useUpdateCheck } from '../../lib/version'
import { ExportRow } from './ExportRow'
import { SettingsSection } from './SettingRows'

const built = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

const STATUS: Record<string, string> = {
  idle: '',
  checking: 'Checking…',
  current: 'You have the newest version.',
  available: 'A newer version is available.',
  offline: "Couldn't reach the server.",
}

export function AboutSettings({ onShowTour, familyId, householdName }: { onShowTour?: () => void; familyId?: string; householdName?: string }) {
  const { state, live, check } = useUpdateCheck()
  return (
    <SettingsSection title="About" id="about">
      <div className="setting-row">
        <span className="setting-row__label">
          Version
          <span className="setting-row__hint">Built {built(BUILD_TIME)}</span>
        </span>
        <code className="version">{APP_VERSION}</code>
      </div>
      <div className="setting-row">
        <span className="setting-row__label">
          Updates
          <span className="setting-row__hint" role="status">
            {STATUS[state]}
            {state === 'available' && live && ` (${live.version})`}
          </span>
        </span>
        <div className="row">
          <button type="button" className="button" onClick={check} disabled={state === 'checking'}>
            Check for updates
          </button>
          <button type="button" className={`button${state === 'available' ? ' button--primary' : ''}`} onClick={() => void reloadToLatest()}>
            Reload
          </button>
        </div>
      </div>
      {familyId && <ExportRow familyId={familyId} name={householdName ?? 'household'} />}
      {onShowTour && (
        <div className="setting-row">
          <span className="setting-row__label">
            Welcome tour
            <span className="setting-row__hint">A quick look at what each part of the app is for, and setup tips for this device.</span>
          </span>
          <button type="button" className="button" onClick={onShowTour}>
            Show the tour
          </button>
        </div>
      )}
    </SettingsSection>
  )
}
