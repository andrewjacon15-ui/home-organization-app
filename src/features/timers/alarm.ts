/**
 * The kitchen-timer alarm: loud, repeating, and at full volume.
 *
 * - Sound is made with Web Audio (no file to load) at full gain, in a pattern that's easy
 *   to hear over a running fan: three sharp beeps, a pause, again.
 * - On the wall tablet, Fully Kiosk's JavaScript interface turns the media volume up to the
 *   maximum while the alarm rings, wakes the screen, and puts the volume back afterwards.
 *   (Fully: Settings → Advanced Web Settings → Enable JavaScript Interface.)
 * - Phones also vibrate. A web page can't change a phone's volume; the alarm plays at the
 *   loudest the page can.
 */

interface FullyApi {
  getAudioVolume?: (stream: number) => number
  setAudioVolume?: (level: number, stream: number) => void
  turnScreenOn?: () => void
}

/** Android's media stream, which the browser's audio plays on. */
const MUSIC_STREAM = 3

const fully = (): FullyApi | null => {
  const f = (window as unknown as { fully?: FullyApi }).fully
  return f && typeof f === 'object' ? f : null
}

let ctx: AudioContext | null = null
let loop: ReturnType<typeof setInterval> | null = null
let savedVolume: number | null = null

function context(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  ctx ??= new AudioContext()
  return ctx
}

/** Call from a tap (starting a timer) so the browser lets the alarm play later. */
export function primeAlarm() {
  void context()?.resume()
}

function beeps() {
  const ac = context()
  if (!ac) return
  void ac.resume()
  const now = ac.currentTime
  for (let i = 0; i < 3; i++) {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'square'
    osc.frequency.value = i === 2 ? 1568 : 1175
    const at = now + i * 0.22
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(1, at + 0.01)
    gain.gain.setValueAtTime(1, at + 0.15)
    gain.gain.linearRampToValueAtTime(0, at + 0.17)
    osc.connect(gain).connect(ac.destination)
    osc.start(at)
    osc.stop(at + 0.2)
  }
  navigator.vibrate?.([300, 120, 300, 120, 300])
}

/** Starts ringing (no-op if it already is). */
export function startAlarm() {
  if (loop) return
  const f = fully()
  try {
    if (f?.getAudioVolume && f.setAudioVolume) {
      savedVolume = f.getAudioVolume(MUSIC_STREAM)
      f.setAudioVolume(100, MUSIC_STREAM)
    }
    f?.turnScreenOn?.()
  } catch {
    // The interface is off or limited: the alarm still plays at full page volume.
  }
  beeps()
  loop = setInterval(beeps, 1400)
}

/** Stops ringing and puts the tablet's volume back. */
export function stopAlarm() {
  if (loop) clearInterval(loop)
  loop = null
  navigator.vibrate?.(0)
  const f = fully()
  if (savedVolume != null && f?.setAudioVolume) {
    try {
      f.setAudioVolume(savedVolume, MUSIC_STREAM)
    } catch {
      // nothing to restore
    }
  }
  savedVolume = null
}

export const isRinging = () => loop != null

/** Whether this screen can turn its own volume up (Fully Kiosk with the JavaScript interface on). */
export const canRaiseVolume = () => !!fully()?.setAudioVolume
