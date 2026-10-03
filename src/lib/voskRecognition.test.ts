import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorText, FIRST_WORD_MS, useSpeech } from './useSpeech'
import { resetVoskForTests, voskRecognitionClass, type VoskDeps, type VoskModel } from './voskRecognition'

type Listener = (m: { result?: { text?: string; partial?: string }; error?: string }) => void

function fakes(opts: { mic?: 'ok' | 'blocked' } = {}) {
  const listeners: Record<string, Listener> = {}
  const recognizer = { on: (e: string, l: Listener) => (listeners[e] = l), acceptWaveform: vi.fn(), retrieveFinalResult: vi.fn(), remove: vi.fn() }
  const model: VoskModel = { KaldiRecognizer: vi.fn(function () { return recognizer }) as unknown as VoskModel['KaldiRecognizer'] }
  const track = { stop: vi.fn() }
  const proc = { connect: vi.fn(), onaudioprocess: null as null | ((e: { inputBuffer: unknown }) => void) }
  const ctx = { sampleRate: 48000, createMediaStreamSource: () => ({ connect: vi.fn() }), createScriptProcessor: () => proc, destination: {}, close: vi.fn(async () => undefined) }
  const deps: VoskDeps = {
    loadLib: vi.fn(async () => ({ createModel: vi.fn(async () => model) })),
    modelUrl: vi.fn(async () => 'blob:model'),
    getUserMedia: vi.fn(async () => {
      if (opts.mic === 'blocked') throw new DOMException('denied', 'NotAllowedError')
      return { getTracks: () => [track] } as unknown as MediaStream
    }),
    AudioContext: vi.fn(function () { return ctx }) as unknown as VoskDeps['AudioContext'],
  }
  return { deps, listeners, recognizer, track, proc, ctx, model }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

afterEach(() => resetVoskForTests())

describe('tablet voice (Vosk)', () => {
  it('hears words as they come, and finishes the last phrase when stopped', async () => {
    const f = fakes()
    const Rec = voskRecognitionClass(f.deps)
    const r = new Rec()
    const results: string[][] = []
    r.onresult = (e) => results.push(Array.from(e.results).map((x) => x[0].transcript))
    r.onstart = vi.fn()
    r.onend = vi.fn()
    r.start()
    await flush()
    expect(r.onstart).toHaveBeenCalled()
    expect(f.model.KaldiRecognizer).toHaveBeenCalledWith(48000)
    f.proc.onaudioprocess?.({ inputBuffer: 'chunk' })
    expect(f.recognizer.acceptWaveform).toHaveBeenCalledWith('chunk')

    f.listeners.partialresult({ result: { partial: 'chicken' } })
    f.listeners.result({ result: { text: 'chicken thighs' } })
    f.listeners.partialresult({ result: { partial: 'rice' } })
    expect(results.at(-1)).toEqual(['chicken thighs', 'rice'])

    r.stop()
    expect(f.recognizer.retrieveFinalResult).toHaveBeenCalled()
    f.listeners.result({ result: { text: 'rice and broccoli' } })
    expect(results.at(-1)).toEqual(['chicken thighs', 'rice and broccoli'])
    expect(r.onend).toHaveBeenCalledTimes(1)
    expect(f.track.stop).toHaveBeenCalled()
    expect(f.recognizer.remove).toHaveBeenCalled()
  })

  it('reports a blocked microphone and ends', async () => {
    const f = fakes({ mic: 'blocked' })
    const r = new (voskRecognitionClass(f.deps))()
    r.onerror = vi.fn()
    r.onend = vi.fn()
    r.start()
    await flush()
    expect(r.onerror).toHaveBeenCalledWith({ error: 'not-allowed' })
    expect(r.onend).toHaveBeenCalled()
    expect(errorText('not-allowed', true)).toMatch(/Enable Microphone Access/)
    expect(errorText('network', true)).toMatch(/Couldn’t get voice ready/)
  })

  it('loads the model once for every later tap', async () => {
    const f = fakes()
    const Rec = voskRecognitionClass(f.deps)
    for (let i = 0; i < 2; i++) {
      const r = new Rec()
      r.start()
      await flush()
      r.stop()
      f.listeners.result({ result: { text: '' } })
    }
    expect(f.deps.loadLib).toHaveBeenCalledTimes(1)
    expect(f.deps.modelUrl).toHaveBeenCalledTimes(1)
  })
})

describe('useSpeech with a recognizer that takes a while to start', () => {
  let rec: { onstart?: () => void; stop: ReturnType<typeof vi.fn> } | null = null
  beforeEach(() => {
    vi.useFakeTimers()
    class Slow {
      readonly slowStart = true
      lang = ''
      interimResults = false
      continuous = false
      onresult = null
      onend: (() => void) | null = null
      onerror = null
      onstart: (() => void) | null = null
      stop = vi.fn(() => this.onend?.())
      start() {}
    }
    const Made = new Proxy(Slow, { construct: (C) => (rec = new C() as unknown as typeof rec) as object })
    ;(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = Made
  })
  afterEach(() => {
    vi.useRealTimers()
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  })

  it('says it’s getting ready, and waits for a first word only once it’s listening', () => {
    const { result } = renderHook(() => useSpeech(vi.fn()))
    act(() => result.current.start())
    expect(result.current.preparing).toBe(true)
    // A long model download doesn't count against the first-word wait.
    act(() => vi.advanceTimersByTime(FIRST_WORD_MS * 3))
    expect(rec!.stop).not.toHaveBeenCalled()
    act(() => rec!.onstart?.())
    expect(result.current.preparing).toBe(false)
    act(() => vi.advanceTimersByTime(FIRST_WORD_MS))
    expect(rec!.stop).toHaveBeenCalled()
  })
})
