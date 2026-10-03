import { useCallback, useEffect, useRef, useState } from 'react'

/** The browser's speech-to-text (Chrome, Android, iOS Safari). Not available in every WebView. */
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start(): void
  stop(): void
}

function recognitionClass(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
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

/**
 * Dictation: start() keeps listening through short pauses (people list ingredients
 * slowly) and stops after PAUSE_MS of quiet, FIRST_WORD_MS with nothing said, or a tap
 * on stop. onText gets everything heard, once, when it stops.
 */
export function useSpeech(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
      setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone access is blocked. Allow it in the browser, or type instead.' : e.error === 'no-speech' ? "Didn't catch that. Try again." : "Voice didn't work. Type instead.")
    }
    r.onend = () => {
      clearTimeout(timer.current)
      setListening(false)
      if (heard) handler.current(heard)
      heard = ''
    }
    rec.current = r
    try {
      r.start()
      setListening(true)
      quietFor(FIRST_WORD_MS)
    } catch {
      setError("Voice didn't work. Type instead.")
    }
  }, [])

  const stop = useCallback(() => rec.current?.stop(), [])
  return { listening, error, start, stop, supported: speechSupported() }
}
