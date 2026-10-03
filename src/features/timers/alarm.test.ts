import { afterEach, describe, expect, it, vi } from 'vitest'
import { canRaiseVolume, isRinging, startAlarm, stopAlarm } from './alarm'

describe('alarm', () => {
  afterEach(() => {
    stopAlarm()
    delete (window as unknown as { fully?: unknown }).fully
    vi.useRealTimers()
  })

  it('turns the wall tablet to full volume while ringing, wakes the screen, and puts the volume back', () => {
    const volume = { level: 35 }
    const fully = {
      getAudioVolume: vi.fn(() => volume.level),
      setAudioVolume: vi.fn((level: number) => void (volume.level = level)),
      turnScreenOn: vi.fn(),
    }
    ;(window as unknown as { fully: typeof fully }).fully = fully
    expect(canRaiseVolume()).toBe(true)
    startAlarm()
    expect(isRinging()).toBe(true)
    expect(fully.setAudioVolume).toHaveBeenLastCalledWith(100, 3)
    expect(fully.turnScreenOn).toHaveBeenCalled()
    startAlarm() // already ringing: no second volume change
    expect(fully.setAudioVolume).toHaveBeenCalledTimes(1)
    stopAlarm()
    expect(isRinging()).toBe(false)
    expect(volume.level).toBe(35)
  })

  it('still rings where the volume can’t be changed (phones, a browser)', () => {
    expect(canRaiseVolume()).toBe(false)
    vi.useFakeTimers()
    startAlarm()
    vi.advanceTimersByTime(5000)
    expect(isRinging()).toBe(true)
    stopAlarm()
    expect(isRinging()).toBe(false)
  })
})
