/**
 * Features that need something set up first. Shared with the web app, which hides what
 * isn't turned on instead of letting it fail.
 *
 * ONLINE_SEARCH: "What can I make?" → Online, via the Brave Search API. Turn on only after the
 * household agrees to Brave's pricing ($5 of free credit a month, about 1,000 searches; the
 * function stops at 900) and the key is stored:
 *   npx firebase-tools functions:secrets:set BRAVE_SEARCH_API_KEY
 * then set this to true, merge, and deploy functions.
 */
export const ONLINE_SEARCH = true
