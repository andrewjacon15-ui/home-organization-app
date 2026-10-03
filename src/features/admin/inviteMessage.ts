import { INVITE_DAYS } from './householdInvites'

/** The device the invited person will set up first; each gets its own steps. */
export const INVITE_DEVICES = ['iphone', 'android', 'computer', 'tablet'] as const
export type InviteDevice = (typeof INVITE_DEVICES)[number]

export const INVITE_DEVICE_LABELS: Record<InviteDevice, string> = {
  iphone: 'iPhone or iPad',
  android: 'Android phone',
  computer: 'Computer',
  tablet: 'Wall tablet',
}

const SIGN_IN = 'Tap Sign in with Google and use the Google account you want for the household.'
const NAME_IT = 'Name your household and tap Create my household.'
const FAMILY = 'Invite your family in Settings → Family. They sign in with the email you add; no link needed.'

function steps(device: InviteDevice, link: string, home: string): string[] {
  switch (device) {
    case 'iphone':
      return [
        `Open this link in Safari: ${link}`,
        SIGN_IN,
        NAME_IT,
        'Put it on your Home Screen: tap the Share button (the square with an arrow), then Add to Home Screen. Open it from there from now on.',
        FAMILY,
      ]
    case 'android':
      return [
        `Open this link in Chrome: ${link}`,
        SIGN_IN,
        NAME_IT,
        'Put it on your home screen: tap the ⋮ menu, then Add to home screen (or Install app). Open it from there from now on.',
        FAMILY,
      ]
    case 'computer':
      return [
        `Open this link in Chrome, Edge or Safari: ${link}`,
        'Click Sign in with Google and use the Google account you want for the household.',
        'Name your household and click Create my household.',
        'To bring in your Google Calendar, go to Settings → Google Calendar and click Connect.',
        FAMILY,
      ]
    case 'tablet':
      return [
        `Start on your phone or computer, not the tablet: open this link there: ${link}`,
        SIGN_IN,
        NAME_IT,
        'Connect Google Calendar from the phone or computer too (Settings → Google Calendar), since the tablet’s browser can block the sign-in window.',
        `On the tablet, open ${home} in Chrome and sign in with the same Google account. Your household opens by itself.`,
        'In Settings → Device & side bar, set This device is a to Tablet. Then use the ⋮ menu → Add to home screen so it opens full screen.',
        'Plug the tablet in and set its screen timeout as long as it goes. The app dims itself at night (Settings → Sleep mode) and shows your photos when idle (Settings → Photos & screensaver).',
      ]
  }
}

/**
 * The ready-to-send text for a household invite: the link plus numbered setup steps
 * for the device the person will use. Plain text, so it pastes into any message app.
 */
export function inviteMessage(link: string, device: InviteDevice, origin = new URL(link).origin): string {
  const list = steps(device, link, origin)
    .map((s, i) => `${i + 1}. ${s}`)
    .join('\n')
  return [
    'You’re invited to set up your own household on Family Organizer: a shared calendar, lists, chores, meals and photos that only the people you add can see.',
    list,
    `The link works once and expires in ${INVITE_DAYS} days.`,
  ].join('\n\n')
}
