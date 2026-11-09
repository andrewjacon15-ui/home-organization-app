/**
 * MCP server: lets Claude (desktop app chats, Claude Code) read and add to the household.
 * Runs on this computer over stdio; see README.md for the service account and setup.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { toDateKey } from '../../../src/lib/dates'
import { Household } from './household'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
const clock = z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM (24-hour)')

const house = await Household.open()
const server = new McpServer({ name: 'home-organizer', version: '1.0.0' })

/** Every tool answers in short plain text; errors (no such list, no such person) come back as text Claude can act on. */
function tool<S extends z.ZodRawShape>(name: string, description: string, shape: S, run: (a: z.objectOutputType<S, z.ZodTypeAny>) => Promise<string>) {
  // The SDK checks the arguments against `shape` before calling; its generic callback type
  // doesn't follow a generic shape, hence the cast.
  const handler = async (a: z.objectOutputType<S, z.ZodTypeAny>) => {
    try {
      return { content: [{ type: 'text' as const, text: await run(a) }] }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true }
    }
  }
  server.registerTool(name, { description, inputSchema: shape }, handler as never)
}

tool(
  'overview',
  `Calendar events, chores and meals day by day, plus upcoming countdowns. Today is ${toDateKey(new Date())}. Use this for summaries and "what's on" questions.`,
  { start: date.optional().describe('First day (default today)'), days: z.number().int().min(1).max(14).optional().describe('How many days (default 7)') },
  (a) => house.overview(a.start ?? toDateKey(new Date()), a.days ?? 7),
)

tool('lists', 'Open (not checked off) items on the lists, grouped by aisle or person. Give a list name for just that one.', { list: z.string().optional().describe('e.g. "grocery", "to-do"') }, (a) => house.listSummary(a.list))

tool('recipes', "Search the household's recipe book by title or ingredient words. Empty query lists favorites first.", { query: z.string().describe('e.g. "chicken", "soup", "" for all') }, (a) => house.recipes(a.query))

tool(
  'add_list_items',
  "Add items to a list (skips ones already on it). Grocery items file themselves into store aisles. Use person only on lists with per-person sections.",
  { list: z.string(), items: z.array(z.string().min(1)).min(1).max(50), person: z.string().optional().describe('First name or "me"') },
  (a) => house.addListItems(a.list, a.items, a.person),
)

tool('check_off', 'Check items off a list (they move to Done and clear themselves later). Matches by text.', { list: z.string(), items: z.array(z.string().min(1)).min(1).max(50) }, (a) => house.checkOff(a.list, a.items))

tool(
  'add_event',
  'Add an event to the family calendar. Without a start time it is all day.',
  { title: z.string().min(1).max(200), date, start: clock.optional(), end: clock.optional(), people: z.array(z.string()).optional().describe('First names or "me" (default me)') },
  (a) => house.addEvent(a),
)

tool(
  'add_chore',
  'Add a chore. Without a person it is "up for grabs". Repeating chores start on date (default today).',
  {
    title: z.string().min(1).max(200),
    person: z.string().optional(),
    date: date.optional().describe('Due date, or first date for repeating'),
    time: clock.optional(),
    repeat: z.enum(['none', 'daily', 'weekdays', 'weekly', 'biweekly', 'monthly']).optional(),
    days: z.array(z.number().int().min(0).max(6)).optional().describe('Weekly: weekdays, 0 = Sunday'),
    points: z.number().int().min(0).max(100).optional().describe('Stars (default 1)'),
  },
  (a) => house.addChore(a),
)

tool(
  'set_meals',
  "Set meals for a day. Only the meals given change. Doesn't add groceries; follow with add_list_items if asked.",
  { date, breakfast: z.string().max(200).optional(), lunch: z.string().max(200).optional(), dinner: z.string().max(200).optional(), notes: z.string().max(500).optional() },
  ({ date: d, ...meals }) => house.setMeals(d, meals),
)

tool(
  'add_countdown',
  'Add a countdown shown on the home screen. Birthdays and anniversaries repeat every year.',
  { title: z.string().min(1).max(80), date, kind: z.enum(['once', 'birthday', 'anniversary']).optional() },
  (a) => house.addCountdown(a.title, a.date, a.kind),
)

await server.connect(new StdioServerTransport())
