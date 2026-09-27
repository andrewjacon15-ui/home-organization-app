import { GOOGLE_CALENDAR_CLIENT_ID } from '../../firebase'

// Minimal types for Google Identity Services' OAuth code flow.
interface CodeResponse {
  code?: string
  error?: string
  error_description?: string
}
interface CodeClient {
  requestCode(): void
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient(config: {
            client_id: string
            scope: string
            ux_mode: 'popup'
            login_hint?: string
            callback: (response: CodeResponse) => void
            error_callback?: (error: { type: string; message?: string }) => void
          }): CodeClient
        }
      }
    }
  }
}

// openid + email let the server verify which Google account was connected.
const SCOPES = 'openid email https://www.googleapis.com/auth/calendar.readonly'

let loading: Promise<void> | null = null

/** Loads the GIS script once. Call early (on page mount) so the popup opens inside the click handler. */
export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loading = null
      reject(new Error("Couldn't load Google sign-in. Check the connection and try again."))
    }
    document.head.appendChild(script)
  })
  return loading
}

export class ConnectCancelled extends Error {}

/** Opens Google's consent popup and resolves with a one-time auth code for the server to exchange. */
export async function requestCalendarCode(loginHint?: string): Promise<string> {
  await loadGoogleIdentity()
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initCodeClient({
      client_id: GOOGLE_CALENDAR_CLIENT_ID,
      scope: SCOPES,
      ux_mode: 'popup',
      login_hint: loginHint,
      callback: (res) => {
        if (res.code) resolve(res.code)
        else reject(new Error(res.error_description || res.error || 'Google did not return an authorization code.'))
      },
      error_callback: (err) => {
        if (err.type === 'popup_closed') reject(new ConnectCancelled('cancelled'))
        else reject(new Error(err.message || `Google sign-in failed (${err.type}).`))
      },
    })
    client.requestCode()
  })
}
