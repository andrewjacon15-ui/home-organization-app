const KIOSK_KEY = 'kioskMode'

/**
 * Kiosk browsers (Fully Kiosk on the wall tablet) swallow popups without an
 * error, leaving signInWithPopup pending forever, so they go straight to a
 * full-page redirect. Start the kiosk at `?kiosk=1`; it's remembered after that.
 */
export function isKioskBrowser(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('kiosk')) localStorage.setItem(KIOSK_KEY, '1')
    if (localStorage.getItem(KIOSK_KEY) === '1') return true
  } catch {
    // Storage can be unavailable; fall through to the user-agent checks.
  }
  return 'fully' in window || /FullyKiosk|; wv\)/.test(navigator.userAgent)
}
