/** A side band at least this wide (CSS px) holds the clock beside the picture instead of on it. */
const MIN_SIDE_PX = 300
const GAP_PX = 24

/**
 * Where the clock goes for a picture of this shape on this screen. A tall photo on the
 * landscape wall tablet leaves wide black bands: the photo moves to the right and the clock
 * and date sit in the band on the left, on black, never over the picture. Wide photos keep
 * the clock along the bottom over a dark fade.
 */
export function clockLayout(aspect: number | undefined, screenW: number, screenH: number): { side: boolean; band: number } {
  if (!aspect || !screenW || !screenH) return { side: false, band: 0 }
  const shown = Math.min(screenW, screenH * aspect)
  const band = screenW - shown - GAP_PX
  return band >= MIN_SIDE_PX ? { side: true, band } : { side: false, band: 0 }
}
