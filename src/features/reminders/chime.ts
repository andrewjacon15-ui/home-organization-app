// A short two-note chime made with Web Audio, so there's no sound file to load.
// Browsers only allow audio after the page has been touched once; we unlock on the
// first tap. On the wall tablet, Fully Kiosk's "Autoplay audio" setting lifts that limit.

let ctx: AudioContext | null = null

function context(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  ctx ??= new AudioContext()
  return ctx
}

export function unlockAudioOnFirstTouch() {
  const unlock = () => {
    void context()?.resume()
    window.removeEventListener('pointerdown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
}

/** Plays the chime at `volume` (0–1). Silently does nothing where audio is unavailable. */
export function playChime(volume = 0.6) {
  const ac = context()
  if (!ac) return
  void ac.resume()
  const now = ac.currentTime
  ;[
    { freq: 880, at: 0 },
    { freq: 1318.5, at: 0.18 },
  ].forEach(({ freq, at }) => {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, now + at)
    gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, volume)) * 0.4, now + at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.9)
    osc.connect(gain).connect(ac.destination)
    osc.start(now + at)
    osc.stop(now + at + 1)
  })
}
