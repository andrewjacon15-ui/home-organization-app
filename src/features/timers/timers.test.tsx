import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findTimes, formatClock, formatLength, stepLabel } from './timerMath'
import { advance, RING_LIMIT_MS, type KitchenTimer } from './timerState'
import { AlarmOverlay, TimerDock, TimerPanel } from './Timers'
import { TimersProvider } from './TimersContext'
import { useTimers } from './useTimers'

describe('finding times in recipe steps', () => {
  const secs = (s: string) => findTimes(s).map((t) => [t.seconds, t.maxSeconds])

  it('reads minutes, hours, ranges, fractions, and words', () => {
    expect(secs('Bake at 350F for 35 minutes.')).toEqual([[2100, null]])
    expect(secs('Bake 20-25 min, until golden.')).toEqual([[1200, 1500]])
    expect(secs('Bake at 350F for 1-1 1/2 hours. Do not cover.')).toEqual([[3600, 5400]])
    expect(secs('Simmer 1 hour 15 minutes.')).toEqual([[4500, null]])
    expect(secs('Rest for half an hour.')).toEqual([[1800, null]])
    expect(secs('Steep for five minutes, then strain.')).toEqual([[300, null]])
    expect(secs('Cook 2 to 3 hrs on low.')).toEqual([[7200, 10800]])
  })

  it('skips cadences, storage times, and tiny times', () => {
    expect(secs('Grill 12-14 minutes, turning every 3-4 minutes.')).toEqual([[720, 840]])
    expect(secs('Keeps up to 30 minutes at room temperature.')).toEqual([])
    expect(secs('Whisk 5 seconds.')).toEqual([])
    expect(secs('Pasta 10 minutes')).toEqual([[600, null]])
    expect(secs('Mix in a 9x13 pan.')).toEqual([])
  })

  it('formats clocks and lengths, and names step timers', () => {
    expect(formatClock(245_000)).toBe('4:05')
    expect(formatClock(3_750_000)).toBe('1:02:30')
    expect(formatClock(-5)).toBe('0:00')
    expect(formatLength(390)).toBe('6 min 30 sec')
    expect(formatLength(4500)).toBe('1 hr 15 min')
    expect(stepLabel('Bake at 350F for 35 minutes.', 4)).toBe('Step 4: Bake at 350F')
  })
})

describe('timer state', () => {
  const t = (over: Partial<KitchenTimer>): KitchenTimer => ({ id: 'a', label: 'Pasta', total: 600, state: 'running', endsAt: 1000, leftMs: 600_000, ...over })

  it('rings when time is up, and goes quiet after a while', () => {
    const list = [t({})]
    expect(advance(list, 999)).toBe(list)
    const rung = advance(list, 1000)
    expect(rung[0]).toMatchObject({ state: 'ringing', rangAt: 1000, leftMs: 0 })
    expect(advance(rung, 1000 + RING_LIMIT_MS + 1)[0].state).toBe('done')
  })
})

vi.mock('./alarm', () => ({
  primeAlarm: vi.fn(),
  startAlarm: vi.fn(),
  stopAlarm: vi.fn(),
  canRaiseVolume: () => false,
}))

describe('kitchen timers', () => {
  let clock = 0
  beforeEach(() => {
    vi.useFakeTimers()
    clock = 1_000_000
    localStorage.clear()
  })
  afterEach(() => vi.useRealTimers())

  function OpenPanel() {
    const { setPanelOpen } = useTimers()
    return (
      <button type="button" onClick={() => setPanelOpen(true)}>
        Timers
      </button>
    )
  }
  const mount = () =>
    render(
      <TimersProvider clock={() => clock}>
        <OpenPanel />
        <TimerPanel />
        <TimerDock />
        <AlarmOverlay />
      </TimersProvider>,
    )
  const tick = (ms: number) =>
    act(() => {
      clock += ms
      vi.advanceTimersByTime(ms)
    })

  it('starts a suggested timer, counts down in the corner, then rings at full screen until stopped', async () => {
    const alarm = await import('./alarm')
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Timers' }))
    fireEvent.click(screen.getByRole('button', { name: /Steep tea/ }))
    expect(alarm.primeAlarm).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close timers' }))
    tick(1000)
    expect(screen.getByRole('button', { name: /Steep tea/ })).toHaveTextContent('3:59')

    tick(4 * 60_000)
    expect(screen.getByRole('alertdialog', { name: 'Timer done' })).toHaveTextContent('Steep tea')
    expect(alarm.startAlarm).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(alarm.stopAlarm).toHaveBeenCalled()
  })

  it('sets your own time, pauses, snoozes, and survives a reload', () => {
    const first = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Timers' }))
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Seconds'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Name (optional)'), { target: { value: 'Roast' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    tick(30_000)
    fireEvent.click(screen.getByRole('button', { name: 'Pause Roast' }))
    tick(60_000)
    expect(screen.getByRole('listitem', { name: 'Roast, 2:00 left' })).toBeInTheDocument()

    // A reload (app update) keeps it.
    first.unmount()
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Timers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start Roast' }))
    tick(120_000)
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Roast')
    fireEvent.click(screen.getByRole('button', { name: '+1 min' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    tick(60_000)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })
})
