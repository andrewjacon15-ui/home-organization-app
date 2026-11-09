# Claude MCP server

Lets Claude read and add to the household: "what's on this week?", "add milk and eggs to
groceries", "put the dentist on Thursday at 3:30 for me", "plan dinners for next week". It runs
on this computer and talks to Claude over stdio. It works in **Claude desktop app chats** and
**Claude Code**. (Claude on the web and on phones can't reach a server on your computer; that
would need a hosted version.)

## What Claude can do

| Tool | Does |
|---|---|
| `overview` | Calendar, chores and meals day by day, plus countdowns (default: the next 7 days) |
| `lists` | Open items on the lists, by aisle or person |
| `recipes` | Search the recipe book by title or ingredient |
| `add_list_items` | Add items (skips ones already there; grocery items file themselves into aisles) |
| `check_off` | Check items off a list |
| `add_event` | Add a calendar event (timed or all day, for anyone in the household) |
| `add_chore` | Add a chore, one-off or repeating |
| `set_meals` | Set a day's breakfast, lunch, dinner or notes |
| `add_countdown` | Add a countdown (one-time, or a yearly birthday/anniversary) |

**Nothing deletes.** The service account below can write to the whole database (it skips the app's
security rules), so these tools are the limit: they only add things, check list items off, and
set meals. To remove something, use the app.

**Cheap by design.** Every read is narrow: a date range, one list's open items, or the recipe index,
never "everything". Results are cached for two minutes (basics like people and lists for ten), so
a typical day of use is a few hundred reads against Firestore's free 50,000 a day. Answers are
short plain text with no ids or JSON, so a week is about 1–2k tokens. The nine tool definitions
cost about 1,200 tokens per conversation.

## 1. Create the service account (once, in the Google Cloud console)

1. Open the service accounts page for the project:
   https://console.cloud.google.com/iam-admin/serviceaccounts?project=home-organization-app-dkcbl
   (sign in with the Google account that owns the Firebase project).
2. Click **+ Create service account**.
   - **Service account name:** `claude-household`
   - **Description:** `Claude MCP server on my PC: reads and adds to the household`
   - Click **Create and continue**.
3. Under **Grant this service account access to project**, choose the role
   **Cloud Datastore User**. Type "Datastore User" in the filter to find it. It can read and write
   Firestore data, but it can't change the database's settings, rules or indexes, and it has nothing
   to do with Storage, Functions or billing. Click **Continue**, then **Done**.
   Don't use the Firebase console's "Generate new private key" button instead: that key belongs to an
   account with much wider powers.
4. In the list, click **claude-household**, open the **Keys** tab, then **Add key → Create new key →
   JSON → Create**. A `.json` file downloads.
   - If it says key creation is disabled by an organization policy, tell Claude. Plain Gmail-owned
     projects don't normally have that policy.
5. Move that file to `C:\Users\ajaco\.secrets\home-org-claude.json`. Create the `.secrets` folder if
   it isn't there, then delete the copy in Downloads.
   - Keep it out of this repo, OneDrive and email. It's a password for the database.
     (`npm run check:repo` refuses to commit anything that looks like a key.)
   - If it ever leaks, go back to **Keys** and delete it. The old file stops working at once.
     Then make a new one.

## 2. Install (once, and after pulling changes to this folder)

```bash
npm install --prefix tools/claude-mcp
```

## 3. Connect Claude

**Claude desktop app:** open `%APPDATA%\Claude\claude_desktop_config.json` (Settings → Developer →
Edit Config) and add this under `"mcpServers"`. Then quit and reopen the app.

```json
"home-organizer": {
  "command": "node",
  "args": [
    "C:\\Users\\ajaco\\code\\home-organization-app\\tools\\claude-mcp\\node_modules\\tsx\\dist\\cli.mjs",
    "--tsconfig", "C:\\Users\\ajaco\\code\\home-organization-app\\tools\\claude-mcp\\tsconfig.json",
    "C:\\Users\\ajaco\\code\\home-organization-app\\tools\\claude-mcp\\src\\server.ts"
  ],
  "env": {
    "GOOGLE_APPLICATION_CREDENTIALS": "C:\\Users\\ajaco\\.secrets\\home-org-claude.json",
    "MEMBER_EMAIL": "andrewjacon15@gmail.com"
  }
}
```

**Claude Code** (every project): run this once in a terminal.

```bash
claude mcp add home-organizer --scope user -e GOOGLE_APPLICATION_CREDENTIALS=C:/Users/ajaco/.secrets/home-org-claude.json -e MEMBER_EMAIL=andrewjacon15@gmail.com -- node C:/Users/ajaco/code/home-organization-app/tools/claude-mcp/node_modules/tsx/dist/cli.mjs --tsconfig C:/Users/ajaco/code/home-organization-app/tools/claude-mcp/tsconfig.json C:/Users/ajaco/code/home-organization-app/tools/claude-mcp/src/server.ts
```

### Settings

- `MEMBER_EMAIL`: who Claude acts as. "Me" means this person, and new items are "added by" them.
  Defaults to the household's owner.
- `FAMILY_ID`: which household to use. Leave it out when there's only one. With more than one, the
  first tool call answers with the households and their ids; add the right one as
  `"FAMILY_ID": "…"` next to the others.

## Notes

- Meals set through Claude don't add their groceries the way the app's planner does. Ask Claude to
  add them ("…and put what we need on the grocery list").
- Dates and times use this computer's timezone.
- The tests for the text and the documents Claude writes are in `src/format.test.ts`. They run with
  the app's tests (`npm test`).
