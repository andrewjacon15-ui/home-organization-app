import { useCallback, useEffect, useRef, useState } from 'react'

/** The browser's speech-to-text (Chrome, Android, iOS Safari). Not available in every WebView. */
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
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

/** Dictation: start() listens until a pause; onText gets the words heard. */
export function useSpeech(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<Recognition | null>(null)
  const handler = useRef(onText)
  useEffect(() => {
    handler.current = onText
  }, [onText])
  useEffect(() => () => rec.current?.stop(), [])

  const start = useCallback(() => {
    const Cls = recognitionClass()
    if (!Cls) return setError("Voice isn't available on this screen. Type instead.")
    setError(null)
    const r = new Cls()
    r.lang = navigator.language || 'en-US'
    r.interimResults = false
    r.continuous = false
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .map((res) => res[0]?.transcript ?? '')
        .join(' ')
        .trim()
      if (text) handler.current(text)
    }
    r.onerror = (e) => setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone access is blocked. Allow it in the browser, or type instead.' : e.error === 'no-speech' ? "Didn't catch that. Try again." : "Voice didn't work. Type instead.")
    r.onend = () => setListening(false)
    rec.current = r
    try {
      r.start()
      setListening(true)
    } catch {
      setError("Voice didn't work. Type instead.")
    }
  }, [])

  const stop = useCallback(() => rec.current?.stop(), [])
  return { listening, error, start, stop, supported: speechSupported() }
}
