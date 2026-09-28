import { calendar, type calendar_v3 } from '@googleapis/calendar'
import { OAuth2Client } from 'google-auth-library'
import type { GoogleApi, GoogleCalendarEntry, GoogleEvent } from './types.js'

/** Real Google implementation. The browser gets the code via the GIS popup, so the redirect URI is "postmessage". */
export function googleApi(clientId: string, clientSecret: string): GoogleApi {
  const client = () => new OAuth2Client({ clientId, clientSecret, redirectUri: 'postmessage' })
  const calendarApi = (refreshToken: string) => {
    const oauth = client()
    oauth.setCredentials({ refresh_token: refreshToken })
    return calendar({ version: 'v3', auth: oauth as unknown as calendar_v3.Options['auth'] })
  }

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

    async listCalendars(refreshToken) {
      const api = calendarApi(refreshToken)
      const items: GoogleCalendarEntry[] = []
      let pageToken: string | undefined
      do {
        const res = await api.calendarList.list({ maxResults: 250, pageToken })
        for (const c of res.data.items ?? []) {
          if (!c.id || c.deleted || c.hidden) continue
          items.push({ id: c.id, summary: c.summaryOverride || c.summary || c.id, backgroundColor: c.backgroundColor, primary: c.primary, selected: c.selected, accessRole: c.accessRole })
        }
        pageToken = res.data.nextPageToken ?? undefined
      } while (pageToken)
      return items
    },

    async listEvents(refreshToken, calendarId, timeMin, timeMax) {
      const api = calendarApi(refreshToken)
      const items: GoogleEvent[] = []
      let pageToken: string | undefined
      do {
        const res = await api.events.list({
          calendarId,
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
