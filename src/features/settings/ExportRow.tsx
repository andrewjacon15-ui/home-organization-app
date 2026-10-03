import { useState } from 'react'
import { downloadJson, exportFileName, exportHousehold } from './exportData'

/** Settings → About → Your data: download everything the household keeps, as one file. */
export function ExportRow({ familyId, name, run = exportHousehold, save = downloadJson }: { familyId: string; name: string; run?: typeof exportHousehold; save?: typeof downloadJson }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function go() {
    setState('busy')
    try {
      const data = await run(familyId)
      const file = exportFileName(name)
      save(data, file)
      setState('done')
      setMessage(`Saved ${file}.${Array.isArray(data.skipped) && data.skipped.length ? ` Left out what only its owner can see (${(data.skipped as string[]).join(', ')}).` : ''}`)
    } catch (e) {
      setState('error')
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="setting-row">
      <span className="setting-row__label">
        Your data
        <span className="setting-row__hint" role="status">
          {state === 'idle' || state === 'busy'
            ? 'Download a copy of everything your household keeps here (calendar, lists, chores, meals, recipes, countdowns, settings, and photo links), as one JSON file.'
            : message}
        </span>
      </span>
      <button type="button" className="button" onClick={() => void go()} disabled={state === 'busy'}>
        {state === 'busy' ? 'Preparing…' : 'Download a copy'}
      </button>
    </div>
  )
}
