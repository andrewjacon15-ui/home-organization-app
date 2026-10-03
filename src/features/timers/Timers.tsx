import { useState, type FormEvent } from 'react'
import { AddIcon, AlarmClockIcon, CloseIcon, PauseIcon, PlayIcon, TimerIcon } from '../../components/Icons'
import { canRaiseVolume } from './alarm'
import { formatClock, formatLength, PRESETS } from './timerMath'
import { timeLeft, type KitchenTimer } from './timerState'
import { useTimers } from './useTimers'

/** The header button that opens the timers; shows how many are going. */
export function TimerButton() {
  const { timers, setPanelOpen } = useTimers()
  const going = timers.filter((t) => t.state !== 'ready').length
  return (
    <button type="button" className="icon-button timer-button" aria-label={going ? `Kitchen timers (${going} going)` : 'Kitchen timers'} onClick={() => setPanelOpen(true)}>
      <TimerIcon size={24} />
      {going > 0 && (
        <span className="timer-button__count" aria-hidden>
          {going}
        </span>
      )}
    </button>
  )
}

/** One timer's row: label, time left, and its controls. */
export function TimerRow({ t, now, big = false }: { t: KitchenTimer; now: number; big?: boolean }) {
  const { start, pause, addTime, dismiss } = useTimers()
  const left = timeLeft(t, now)
  const share = t.total ? Math.min(1, left / (t.total * 1000)) : 0
  const label = t.label
  return (
    <li className={`timer-row timer-row--${t.state}${big ? ' timer-row--big' : ''}`} aria-label={`${label}, ${t.state === 'ringing' || t.state === 'done' ? 'time is up' : `${formatClock(left)} left`}`}>
      <div className="timer-row__info">
        <span className="timer-row__label">{label}</span>
        <span className="timer-row__clock" aria-hidden>
          {t.state === 'ringing' || t.state === 'done' ? "Time's up" : formatClock(left)}
        </span>
        <span className="timer-row__bar" aria-hidden>
          <span style={{ width: `${share * 100}%` }} />
        </span>
      </div>
      <div className="row timer-row__actions">
        {(t.state === 'ready' || t.state === 'paused') && (
          <button type="button" className="button button--primary" onClick={() => start(t.id)} aria-label={`Start ${label}`}>
            <PlayIcon size={18} /> {t.state === 'ready' ? 'Start' : 'Resume'}
          </button>
        )}
        {t.state === 'running' && (
          <button type="button" className="button" onClick={() => pause(t.id)} aria-label={`Pause ${label}`}>
            <PauseIcon size={18} /> Pause
          </button>
        )}
        <button type="button" className="button" onClick={() => addTime(t.id, 60)} aria-label={`Add a minute to ${label}`}>
          <AddIcon size={18} /> 1 min
        </button>
        <button type="button" className="icon-button" onClick={() => dismiss(t.id)} aria-label={t.state === 'ringing' ? `Stop ${label}` : `Remove ${label}`}>
          <CloseIcon size={20} />
        </button>
      </div>
    </li>
  )
}

/** The timers sheet: what's running, suggested times, and a time of your own. */
export function TimerPanel() {
  const { timers, now, add, panelOpen, setPanelOpen } = useTimers()
  const [minutes, setMinutes] = useState('')
  const [seconds, setSeconds] = useState('')
  const [label, setLabel] = useState('')
  if (!panelOpen) return null
  const close = () => setPanelOpen(false)
  const custom = (Number(minutes) || 0) * 60 + (Number(seconds) || 0)

  const startCustom = (e: FormEvent) => {
    e.preventDefault()
    if (custom <= 0) return
    add(label || formatLength(custom), custom, { start: true })
    setMinutes('')
    setSeconds('')
    setLabel('')
  }

  return (
    <div className="dialog__backdrop timer-backdrop" onClick={close}>
      <section className="dialog timer-panel" role="dialog" aria-label="Kitchen timers" onClick={(e) => e.stopPropagation()}>
        <header className="timer-panel__head">
          <h3>Kitchen timers</h3>
          <button type="button" className="icon-button" aria-label="Close timers" onClick={close}>
            <CloseIcon size={20} />
          </button>
        </header>

        {timers.length > 0 && (
          <ul className="timer-list" aria-label="Timers">
            {timers.map((t) => (
              <TimerRow key={t.id} t={t} now={now} />
            ))}
          </ul>
        )}

        <h4 className="timer-panel__sub">Suggested</h4>
        <div className="timer-presets">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="timer-preset" onClick={() => add(p.label, p.seconds, { start: true })}>
              <span className="timer-preset__label">{p.label}</span>
              <span className="timer-preset__time">{formatLength(p.seconds)}</span>
            </button>
          ))}
        </div>

        <h4 className="timer-panel__sub">Your own</h4>
        <form className="timer-custom" onSubmit={startCustom}>
          <label className="field">
            Minutes
            <input type="number" inputMode="numeric" min={0} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="0" />
          </label>
          <label className="field">
            Seconds
            <input type="number" inputMode="numeric" min={0} max={59} value={seconds} onChange={(e) => setSeconds(e.target.value)} placeholder="0" />
          </label>
          <label className="field timer-custom__name">
            Name (optional)
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Roast" maxLength={60} />
          </label>
          <button className="button button--primary" disabled={custom <= 0}>
            Start
          </button>
        </form>
        <p className="settings-note">
          {canRaiseVolume()
            ? 'When a timer goes off, this screen turns its volume all the way up until you stop it.'
            : 'When a timer goes off it rings as loud as this screen allows until you stop it. On the wall tablet, turn on Fully Kiosk’s JavaScript interface so the alarm can raise the volume to maximum.'}
        </p>
      </section>
    </div>
  )
}

/**
 * Running timers, always in view: in the corner on every screen, or (inline) in the cooking
 * screen's header, where the corner would cover its Next button.
 */
export function TimerDock({ inline = false }: { inline?: boolean }) {
  const { timers, now, setPanelOpen } = useTimers()
  const shown = timers.filter((t) => t.state !== 'ringing')
  if (!shown.length) return null
  return (
    <div className={`timer-dock${inline ? ' timer-dock--inline' : ''}`} aria-label="Running timers">
      {shown.map((t) => (
        <button key={t.id} type="button" className={`timer-chip timer-chip--${t.state}`} onClick={() => setPanelOpen(true)}>
          <span className="timer-chip__label">{t.label}</span>
          <span className="timer-chip__clock">{t.state === 'done' ? 'Done' : t.state === 'ready' ? `Ready · ${formatClock(t.leftMs)}` : formatClock(timeLeft(t, now))}</span>
        </button>
      ))}
    </div>
  )
}

/** Full screen while a timer rings: what's done, and a big Stop. */
export function AlarmOverlay() {
  const { timers, now, dismiss, addTime } = useTimers()
  const ringing = timers.filter((t) => t.state === 'ringing')
  if (!ringing.length) return null
  return (
    <div className="alarm" role="alertdialog" aria-modal="true" aria-label="Timer done">
      <AlarmClockIcon className="alarm__icon" size={72} strokeWidth={1.5} />
      <ul className="alarm__list">
        {ringing.map((t) => (
          <li key={t.id} className="alarm__item">
            <p className="alarm__label">{t.label}</p>
            <p className="alarm__sub">
              Time’s up{t.rangAt && now - t.rangAt > 60_000 ? ` · ${Math.floor((now - t.rangAt) / 60_000)} min ago` : ''}
            </p>
            <div className="row alarm__actions">
              <button type="button" className="button alarm__snooze" onClick={() => addTime(t.id, 60)}>
                +1 min
              </button>
              <button type="button" className="button button--primary alarm__stop" onClick={() => dismiss(t.id)}>
                Stop
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

