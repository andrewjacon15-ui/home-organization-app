import type { MemberCalendarStatus } from '../../types'

interface Props {
  status: MemberCalendarStatus | undefined
  busy: boolean
  onConnect: () => void
  onSync: () => void
  onDisconnect: () => void
}

function ago(date: Date, now = new Date()) {
  const mins = Math.round((now.getTime() - date.getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  return hours < 24 ? `${hours} hr ago` : date.toLocaleDateString()
}

/** The signed-in person's Google Calendar link: connect, sync, disconnect, or reconnect. */
export function CalendarConnect({ status, busy, onConnect, onSync, onDisconnect }: Props) {
  if (!status) {
    return (
      <div className="connect card">
        <span>Show your Google Calendar events here, color-coded to you.</span>
        <button type="button" className="button button--primary" onClick={onConnect} disabled={busy}>
          {busy ? 'Connecting…' : 'Connect my Google Calendar'}
        </button>
      </div>
    )
  }

  if (status.status === 'needs_reconnect') {
    return (
      <div className="connect card connect--warning" role="status">
        <span>
          Google access for <strong>{status.email}</strong> expired, so your events aren't updating.
        </span>
        <button type="button" className="button button--primary" onClick={onConnect} disabled={busy}>
          {busy ? 'Connecting…' : 'Reconnect'}
        </button>
      </div>
    )
  }

  const synced = status.lastSyncAt?.toDate?.()
  return (
    <div className="connect card">
      <span className="muted">
        Showing <strong>{status.email}</strong>
        {synced && <> · synced {ago(synced)}</>}
      </span>
      <div className="row">
        <button type="button" className="button" onClick={onSync} disabled={busy}>
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
        <button type="button" className="link" onClick={onDisconnect} disabled={busy}>
          Disconnect
        </button>
      </div>
    </div>
  )
}
