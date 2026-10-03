/**
 * Speech-to-text on the wall tablet. Fully Kiosk's browser (Android WebView) has no
 * SpeechRecognition, so there the mic uses Vosk: an offline recognizer that runs in the page
 * (WebAssembly), with a small English model. Nothing leaves the tablet. It is shaped like the
 * browser's own SpeechRecognition, so useSpeech treats both the same.
 *
 * The two files are served by the app (scripts/fetch-voice.mjs puts them in the build). The
 * model is ~41 MB: downloaded the first time someone taps the mic, then kept on the tablet.
 */

export const VOSK_SRC = '/voice/vosk-0.0.8.js'
export const MODEL_SRC = '/voice/vosk-model-small-en-us-0.15.tar.gz'
const CACHE = 'voice-v1'

/** The bits of vosk-browser this uses. */
interface VoskRecognizer {
  on(event: 'result' | 'partialresult' | 'error', listener: (m: { result?: { text?: string; partial?: string }; error?: string }) => void): void
  acceptWaveform(buffer: AudioBuffer): void
  retrieveFinalResult(): void
  remove(): void
}
export interface VoskModel {
  KaldiRecognizer: new (sampleRate: number) => VoskRecognizer
}
export interface VoskLib {
  createModel(url: string): Promise<VoskModel>
}

export interface VoskDeps {
  loadLib: () => Promise<VoskLib>
  modelUrl: () => Promise<string>
  getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream>
  AudioContext: new () => AudioContext
}

let lib: Promise<VoskLib> | null = null
/** Loads the recognizer script once (a plain script that sets window.Vosk). */
function loadLib(): Promise<VoskLib> {
  lib ??= new Promise<VoskLib>((resolve, reject) => {
    const w = window as unknown as { Vosk?: VoskLib }
    if (w.Vosk) return resolve(w.Vosk)
    const s = document.createElement('script')
    s.src = VOSK_SRC
    s.async = true
    s.onload = () => (w.Vosk ? resolve(w.Vosk) : reject(new Error('Voice didn’t load.')))
    s.onerror = () => reject(new Error('Voice didn’t load.'))
    document.head.appendChild(s)
  }).catch((e) => {
    lib = null
    throw e
  })
  return lib
}

/** The model from the tablet's own cache (downloaded into it the first time). */
async function modelUrl(): Promise<string> {
  try {
    const cache = await caches.open(CACHE)
    let res = await cache.match(MODEL_SRC)
    if (!res) {
      res = await fetch(MODEL_SRC)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await cache.put(MODEL_SRC, res.clone())
    }
    return URL.createObjectURL(await res.blob())
  } catch {
    // No Cache Storage (or it's full): let the browser's own cache keep it.
    return MODEL_SRC
  }
}

const realDeps = (): VoskDeps => ({
  loadLib,
  modelUrl,
  getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
  AudioContext: window.AudioContext,
})

let model: Promise<VoskModel> | null = null
function getModel(deps: VoskDeps): Promise<VoskModel> {
  model ??= (async () => (await deps.loadLib()).createModel(await deps.modelUrl()))().catch((e) => {
    model = null
    throw e
  })
  return model
}

/** For tests: forget the loaded model. */
export function resetVoskForTests() {
  model = null
  lib = null
}

/** Whether this screen can hear the mic and run the recognizer (Fully needs PLUS's microphone access on). */
export function voskSupported(): boolean {
  return typeof window !== 'undefined' && typeof WebAssembly === 'object' && !!navigator.mediaDevices?.getUserMedia && typeof window.AudioContext === 'function'
}

type Result = { results: ArrayLike<ArrayLike<{ transcript: string }>> }

/**
 * A SpeechRecognition look-alike. Results are the finished phrases so far plus the one in
 * progress. start() returns at once; onstart fires when it is actually listening (the first
 * time, after the model has downloaded), which is why it says `slowStart`.
 */
export function voskRecognitionClass(deps: VoskDeps = realDeps()) {
  return class VoskRecognition {
    readonly slowStart = true
    lang = 'en-US'
    interimResults = true
    continuous = true
    onresult: ((e: Result) => void) | null = null
    onend: (() => void) | null = null
    onerror: ((e: { error: string }) => void) | null = null
    onstart: (() => void) | null = null

    private finals: string[] = []
    private partial = ''
    private stream: MediaStream | null = null
    private ctx: AudioContext | null = null
    private rec: VoskRecognizer | null = null
    private stopping = false
    private ended = false

    private emit() {
      const pieces = [...this.finals, this.partial].filter((t) => t.trim())
      this.onresult?.({ results: pieces.map((t) => [{ transcript: t }]) })
    }

    start() {
      void (async () => {
        try {
          const m = await getModel(deps)
          if (this.stopping) return this.finish()
          this.stream = await deps.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
          if (this.stopping) return this.finish()
          const ctx = new deps.AudioContext()
          this.ctx = ctx
          const rec = new m.KaldiRecognizer(ctx.sampleRate)
          this.rec = rec
          rec.on('result', (msg) => {
            const text = msg.result?.text?.trim()
            this.partial = ''
            if (text) this.finals.push(text)
            this.emit()
            if (this.stopping) this.finish()
          })
          rec.on('partialresult', (msg) => {
            const p = msg.result?.partial ?? ''
            if (p === this.partial) return
            this.partial = p
            this.emit()
          })
          rec.on('error', (msg) => {
            this.onerror?.({ error: msg.error ?? 'voice' })
            this.finish()
          })
          const source = ctx.createMediaStreamSource(this.stream)
          // ScriptProcessor is old but runs everywhere the tablet's browser does (AudioWorklet needs more setup).
          const proc = ctx.createScriptProcessor(4096, 1, 1)
          proc.onaudioprocess = (e) => {
            if (!this.stopping) rec.acceptWaveform(e.inputBuffer)
          }
          source.connect(proc)
          proc.connect(ctx.destination)
          this.onstart?.()
        } catch (e) {
          const name = e instanceof DOMException ? e.name : ''
          this.onerror?.({ error: name === 'NotAllowedError' || name === 'SecurityError' ? 'not-allowed' : name === 'NotFoundError' ? 'audio-capture' : 'network' })
          this.finish()
        }
      })()
    }

    /** Stops listening; the words still being worked out arrive first, then onend. */
    stop() {
      if (this.stopping) return
      this.stopping = true
      if (!this.rec) return // still loading: start() finishes up when it gets there
      this.rec.retrieveFinalResult()
      // If the last result never comes (nothing said), end anyway.
      setTimeout(() => this.finish(), 1500)
    }

    private finish() {
      if (this.ended) return
      this.ended = true
      this.stream?.getTracks().forEach((t) => t.stop())
      void this.ctx?.close().catch(() => undefined)
      this.rec?.remove()
      this.onend?.()
    }
  }
}
