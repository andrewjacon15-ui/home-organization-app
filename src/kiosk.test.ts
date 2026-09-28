import { afterEach, describe, expect, it, vi } from 'vitest'

import { isKioskBrowser } from './kiosk'

describe('isKioskBrowser', () => {
  afterEach(() => {
    localStorage.clear()
    window.history.replaceState(null, '', '/')
    vi.unstubAllGlobals()
  })

  it('is false in a normal browser', () => {
    expect(isKioskBrowser()).toBe(false)
  })

  it('turns on with ?kiosk and stays on after the param is gone', () => {
    window.history.replaceState(null, '', '/?kiosk=1')
    expect(isKioskBrowser()).toBe(true)
    window.history.replaceState(null, '', '/')
    expect(isKioskBrowser()).toBe(true)
  })

  it('detects an Android WebView user agent', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 13; rk3562; wv) AppleWebKit/537.36' })
    expect(isKioskBrowser()).toBe(true)
  })
})
