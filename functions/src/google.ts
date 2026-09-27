import { calendar, type calendar_v3 } from '@googleapis/calendar'
import { OAuth2Client } from 'google-auth-library'
import type { GoogleApi, GoogleEvent } from './types.js'

/** Real Google implementation. The browser gets the code via the GIS popup, so the redirect URI is "postmessage". */
export function googleApi(clientId: string, clientSecret: string): GoogleApi {
  const client = () => new OAuth2Client({ clientId, clientSecret, redirectUri: 'postmessage' })

  return {
    async exchangeCode(code) {
      const oauth = client()
      const { tokens } = await oauth.getToken(code)
      if (!tokens.id_token) throw new Error('Google did not return an ID token; is the "openid email" scope requested?')
      const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: clientId })
      const email = ticket.getPayload()?.email
      if (!email) throw new Error('Google account has no email address.')
      return { refreshToken: tokens.refresh_token ?? undefined, email: email.toLowerCase(), scope: tokens.scope ?? '' }
    },

    async listEvents(refreshToken, timeMin, timeMax) {
      const oauth = client()
      oauth.setCredentials({ refresh_token: refreshToken })
      const api = calendar({ version: 'v3', auth: oauth as unknown as calendar_v3.Options['auth'] })
      const items: GoogleEvent[] = []
      let pageToken: string | undefined
      do {
        const res = await api.events.list({
          calendarId: 'primary',
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: true, // expand recurring events into instances
          maxResults: 2500,
          pageToken,
        })
        items.push(...(res.data.items ?? []))
        pageToken = res.data.nextPageToken ?? undefined
      } while (pageToken)
      return items
    },

    async revoke(refreshToken) {
      await client().revokeToken(refreshToken)
    },
  }
}
