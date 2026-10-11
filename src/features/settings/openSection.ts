/** A one-time request, from elsewhere in the app, to open Settings at a section. */
const KEY = 'settings-open-section'

export function requestSettingsSection(id: string) {
  try {
    sessionStorage.setItem(KEY, id)
  } catch {
    // Without storage Settings just opens at the top.
  }
}

export function takeSettingsSection(): string | null {
  try {
    const v = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return v
  } catch {
    return null
  }
}
