import { useCallback, useEffect, useRef, useState } from 'react'
import { isKioskBrowser } from '../kiosk'
import { voskRecognitionClass, voskSupported } from './voskRecognition'

/**
 * The browser's speech-to-text (Chrome, Android, iOS Safari). The wall tablet's browser
 * (Fully Kiosk's WebView) has none, so there the app brings its own (voskRecognition.ts).
 */
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  /** Fires when it's really listening. */
  onstart?: (() => void) | null
  /** Takes a while to start (the tablet's recognizer loads its model first). */
  readonly slowStart?: boolean
  start(): void
  stop(): void
}

function recognitionClass(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  const native = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (native) return native
  // Fully Kiosk (PLUS, with microphone access on): the offline recognizer.
  return isKioskBrowser() && voskSupported() ? (voskRecognitionClass() as unknown as new () => Recognition) : null
}

export const speechSupported = () => typeof window !== 'undefined' && recognitionClass() !== null

/** How long to wait for the first word, and how long a pause ends the dictation. */
export const FIRST_WORD_MS = 8000
export const PAUSE_MS = 3000

/**
 * Joins the pieces heard so far. Chrome on Android repeats earlier words in each new
 * piece ("chicken", "chicken rice"), so a piece that extends the text replaces it.
 */
export function joinResults(pieces: string[]): string {
  let text = ''
  for (const raw of pieces) {
    const piece = raw.replace(/\s+/g, ' ').trim()
    if (!piece) continue
    if (piece.toLowerCase().startsWith(text.toLowerCase())) text = piece
    else if (!text.toLowerCase().endsWith(piece.toLowerCase())) text = `${text} ${piece}`
  }
  return text
}

/** What went wrong, in words, with the fix for the screen it happened on. */
export function errorText(error: string, kiosk = isKioskBrowser()): string {
  if (error === 'not-allowed' || error === 'service-not-allowed') {
    return kiosk
      ? 'The microphone is off for this screen. In Fully’s settings, turn on Web Content Settings → Enable Microphone Access (PLUS), then try again.'
      : 'Microphone access is blocked. Allow it in the browser, or type instead.'
  }
  if (error === 'no-speech') return "Didn't catch that. Try again."
  if (error === 'audio-capture') return 'No microphone found. Type instead.'
  if (error === 'network' && kiosk) return 'Couldn’t get voice ready. Check the Wi-Fi and try again, or type instead.'
  return "Voice didn't work. Type instead."
}

/**
 * Dictation: start() keeps listening through short pauses (people list ingredients
 * slowly) and stops after PAUSE_MS of quiet, FIRST_WORD_MS with nothing said, or a tap
 * on stop. onText gets everything heard, once, when it stops.
 */
export function useSpeech(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** The tablet's recognizer is getting ready (the first time, downloading its model). */
  const [preparing, setPreparing] = useState(false)
  const rec = useRef<Recognition | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const handler = useRef(onText)
  useEffect(() => {
    handler.current = onText
  }, [onText])
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      rec.current?.stop()
    },
    [],
  )

  const start = useCallback(() => {
    const Cls = recognitionClass()
    if (!Cls) return setError("Voice isn't available on this screen. Type instead.")
    setError(null)
    const r = new Cls()
    r.lang = navigator.language || 'en-US'
    // Interim results show the person is still talking, so a pause mid-list doesn't end it.
    r.interimResults = true
    r.continuous = true
    let heard = ''
    const quietFor = (ms: number) => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => r.stop(), ms)
    }
    r.onresult = (e) => {
      heard = joinResults(Array.from(e.results).map((res) => res[0]?.transcript ?? ''))
      quietFor(PAUSE_MS)
    }
    r.onerror = (e) => {
      if (e.error === 'aborted') return
      setError(errorText(e.error))
    }
    r.onend = () => {
      clearTimeout(timer.current)
      setListening(false)
      setPreparing(false)
      if (heard) handler.current(heard)
      heard = ''
    }
    rec.current = r
    try {
      // The wait for a first word starts once it's really listening.
      if (r.slowStart) {
        setPreparing(true)
        r.onstart = () => {
          setPreparing(false)
          quietFor(FIRST_WORD_MS)
        }
      }
      r.start()
      setListening(true)
      if (!r.slowStart) quietFor(FIRST_WORD_MS)
    } catch {
      setError("Voice didn't work. Type instead.")
    }
  }, [])

  const stop = useCallback(() => rec.current?.stop(), [])
  return { listening, preparing, error, start, stop, supported: speechSupported() }
}
