import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIRST_WORD_MS, joinResults, PAUSE_MS, useSpeech } from './useSpeech'

describe('joinResults', () => {
  it('joins separate phrases and collapses the repeats Chrome on Android sends', () => {
    expect(joinResults(['chicken thighs', ' rice ', 'broccoli'])).toBe('chicken thighs rice broccoli')
    expect(joinResults(['chicken', 'chicken rice', 'chicken rice and broccoli'])).toBe('chicken rice and broccoli')
    expect(joinResults(['', '  '])).toBe('')
  })
})

interface Fake {
  continuous: boolean
  onresult: ((e: unknown) => void) | null
  stop: ReturnType<typeof vi.fn>
}

describe('useSpeech', () => {
  let rec: Fake | null = null
  beforeEach(() => {
    vi.useFakeTimers()
    class FakeRecognition {
      lang = ''
      interimResults = false
      continuous = false
      onresult: ((e: unknown) => void) | null = null
      onend: (() => void) | null = null
      onerror = null
      stop = vi.fn(() => this.onend?.())
      start() {}
    }
    // Remember each recognizer the hook makes, to drive it from the test.
    const Made = new Proxy(FakeRecognition, { construct: (C) => (rec = new C()) })
    ;(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = Made
  })
  afterEach(() => {
    vi.useRealTimers()
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  })

  it('keeps listening through short pauses and stops after a long one', () => {
    const onText = vi.fn()
    const { result } = renderHook(() => useSpeech(onText))
    act(() => result.current.start())
    expect(rec!.continuous).toBe(true)
    act(() => rec!.onresult!({ results: [[{ transcript: 'chicken' }]] }))
    act(() => vi.advanceTimersByTime(PAUSE_MS - 500))
    // Still talking: a new word resets the wait.
    act(() => rec!.onresult!({ results: [[{ transcript: 'chicken' }], [{ transcript: 'rice' }]] }))
    act(() => vi.advanceTimersByTime(PAUSE_MS - 500))
    expect(rec!.stop).not.toHaveBeenCalled()
    expect(result.current.listening).toBe(true)
    act(() => vi.advanceTimersByTime(500))
    expect(rec!.stop).toHaveBeenCalled()
    expect(onText).toHaveBeenCalledWith('chicken rice')
    expect(result.current.listening).toBe(false)
  })

  it('gives up if nothing is said', () => {
    const onText = vi.fn()
    const { result } = renderHook(() => useSpeech(onText))
    act(() => result.current.start())
    act(() => vi.advanceTimersByTime(FIRST_WORD_MS - 1))
    expect(rec!.stop).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(rec!.stop).toHaveBeenCalled()
    expect(onText).not.toHaveBeenCalled()
  })
})
