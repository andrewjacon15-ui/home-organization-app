import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StaticSettings } from '../settings/SettingsContext'
import { inSleepWindow, isAsleep, WAKE_IDLE_MS } from './sleep'
import { SleepProvider, useSleep } from './SleepContext'

const at = (hhmm: string) => new Date(`2026-09-28T${hhmm}:00`)

describe('inSleepWindow', () => {
  it('handles windows that cross midnight', () => {
    expect(inSleepWindow(at('21:00'), '21:00', '06:00')).toBe(true)
    expect(inSleepWindow(at('23:59'), '21:00', '06:00')).toBe(true)
    expect(inSleepWindow(at('03:00'), '21:00', '06:00')).toBe(true)
    expect(inSleepWindow(at('06:00'), '21:00', '06:00')).toBe(false)
    expect(inSleepWindow(at('12:00'), '21:00', '06:00')).toBe(false)
  })

  it('handles same-day windows and an empty window', () => {
    expect(inSleepWindow(at('13:30'), '13:00', '15:00')).toBe(true)
    expect(inSleepWindow(at('15:00'), '13:00', '15:00')).toBe(false)
    expect(inSleepWindow(at('13:00'), '13:00', '13:00')).toBe(false)
  })
})

describe('isAsleep', () => {
  it('dozes off after two idle minutes in the window, or right away when put to sleep', () => {
    expect(isAsleep({ scheduled: true, manual: false, lastActivity: 0 }, WAKE_IDLE_MS - 1)).toBe(false)
    expect(isAsleep({ scheduled: true, manual: false, lastActivity: 0 }, WAKE_IDLE_MS)).toBe(true)
    expect(isAsleep({ scheduled: false, manual: false, lastActivity: 0 }, 10 * WAKE_IDLE_MS)).toBe(false)
    expect(isAsleep({ scheduled: false, manual: true, lastActivity: 0 }, 0)).toBe(true)
  })
})

function SleepButton() {
  const { sleepNow } = useSleep()
  return <button onClick={sleepNow}>sleep</button>
}

describe('SleepProvider', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const mount = (kiosk: boolean, settings = {}) =>
    render(
      <StaticSettings settings={settings}>
        <SleepProvider kiosk={kiosk}>
          <SleepButton />
        </SleepProvider>
      </StaticSettings>,
    )

  it('blanks the wall display in the window after two idle minutes, and a tap wakes it', () => {
    vi.setSystemTime(at('22:00'))
    mount(true)
    expect(screen.queryByLabelText('Sleeping. Tap to wake.')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(WAKE_IDLE_MS + 15_000))
    const overlay = screen.getByLabelText('Sleeping. Tap to wake.')
    act(() => void fireEvent.pointerDown(overlay))
    expect(screen.queryByLabelText('Sleeping. Tap to wake.')).not.toBeInTheDocument()
  })

  it('never sleeps phones, or when turned off', () => {
    vi.setSystemTime(at('22:00'))
    mount(false)
    act(() => vi.advanceTimersByTime(10 * 60_000))
    expect(screen.queryByLabelText('Sleeping. Tap to wake.')).not.toBeInTheDocument()
  })

  it('stays awake during the day and when the schedule is off', () => {
    vi.setSystemTime(at('12:00'))
    const { unmount } = mount(true)
    act(() => vi.advanceTimersByTime(10 * 60_000))
    expect(screen.queryByLabelText('Sleeping. Tap to wake.')).not.toBeInTheDocument()
    unmount()
    vi.setSystemTime(at('22:00'))
    mount(true, { sleepEnabled: false })
    act(() => vi.advanceTimersByTime(10 * 60_000))
    expect(screen.queryByLabelText('Sleeping. Tap to wake.')).not.toBeInTheDocument()
  })

  it('"Enter sleep mode now" sleeps immediately, even midday', () => {
    vi.setSystemTime(at('12:00'))
    mount(true)
    act(() => void fireEvent.click(screen.getByRole('button', { name: 'sleep' })))
    act(() => vi.advanceTimersByTime(400))
    expect(screen.getByLabelText('Sleeping. Tap to wake.')).toBeInTheDocument()
  })
})
