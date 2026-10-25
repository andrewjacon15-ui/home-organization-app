import { useEffect, useRef } from 'react'
import { AddIcon, CloseIcon } from '../../components/Icons'
import { AutoText } from '../../components/AutoText'

interface Props {
  /** "Ingredient" or "Step": names each row ("Ingredient 2") and the add button. */
  noun: string
  /** The lines as saved: one per line. */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Steps are numbered; ingredients aren't. */
  numbered?: boolean
  maxLength: number
}

const toRows = (value: string) => {
  const rows = value.split('\n')
  return rows.length ? rows : ['']
}

/**
 * A recipe's ingredients or steps, one row each: Enter (or "Add") starts the next row, a pasted
 * list splits into rows, and an empty row's Backspace joins the one above. Saved as plain lines.
 */
export function LinesEditor({ noun, value, onChange, placeholder, numbered = false, maxLength }: Props) {
  const rows = toRows(value)
  const refs = useRef<(HTMLTextAreaElement | null)[]>([])
  // The row to focus once the change is on screen (after adding, joining or pasting).
  const pending = useRef<{ row: number; at?: number } | null>(null)
  const setFocus = (f: { row: number; at?: number }) => {
    pending.current = f
  }
  useEffect(() => {
    const f = pending.current
    if (!f) return
    pending.current = null
    const el = refs.current[f.row]
    if (!el) return
    el.focus()
    const at = f.at ?? el.value.length
    el.setSelectionRange(at, at)
  })

  const save = (next: string[]) => onChange(next.join('\n').slice(0, maxLength))
  const setRow = (i: number, text: string) => save(rows.map((r, j) => (j === i ? text : r)))
  const insert = (at: number, added: string[]) => save([...rows.slice(0, at), ...added, ...rows.slice(at)])
  const remove = (i: number) => {
    const next = rows.filter((_, j) => j !== i)
    save(next.length ? next : [''])
    setFocus({ row: Math.max(0, i - 1) })
  }

  return (
    <div className="lines-editor" role="group" aria-label={`${noun}s`}>
      <ol className={`lines-editor__rows${numbered ? ' lines-editor__rows--numbered' : ''}`}>
        {rows.map((row, i) => (
          <li key={i} className="lines-editor__row">
            {numbered && (
              <span className="lines-editor__n" aria-hidden>
                {i + 1}
              </span>
            )}
            <AutoText
              ref={(el) => {
                refs.current[i] = el
              }}
              value={row}
              aria-label={`${noun} ${i + 1}`}
              placeholder={i === 0 ? placeholder : undefined}
              onChange={(e) => setRow(i, e.target.value.replace(/\n/g, ' '))}
              onKeyDown={(e) => {
                const el = e.currentTarget
                if (e.key === 'Enter' && !e.shiftKey) {
                  // The text after the cursor moves down to the new row.
                  e.preventDefault()
                  const at = el.selectionStart ?? row.length
                  save([...rows.slice(0, i), row.slice(0, at).trimEnd(), row.slice(at).trimStart(), ...rows.slice(i + 1)])
                  setFocus({ row: i + 1, at: 0 })
                } else if (e.key === 'Backspace' && i > 0 && el.selectionStart === 0 && el.selectionEnd === 0) {
                  e.preventDefault()
                  const above = rows[i - 1]
                  save([...rows.slice(0, i - 1), above + (above && row ? ' ' : '') + row, ...rows.slice(i + 1)])
                  setFocus({ row: i - 1, at: above.length })
                }
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text')
                if (!text.includes('\n')) return
                // A pasted list becomes rows (bullets and numbering dropped).
                e.preventDefault()
                const pasted = text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•▢◦]|\d+[.)])\s+/, '').trim()).filter(Boolean)
                if (!pasted.length) return
                const keep = row.trim() ? [row] : []
                save([...rows.slice(0, i), ...keep, ...pasted, ...rows.slice(i + 1)])
                setFocus({ row: i + keep.length + pasted.length - 1 })
              }}
            />
            {(rows.length > 1 || row) && (
              <button type="button" className="icon-button lines-editor__remove" onClick={() => remove(i)} aria-label={`Remove ${noun.toLowerCase()} ${i + 1}`}>
                <CloseIcon size={16} />
              </button>
            )}
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="link lines-editor__add"
        onClick={() => {
          // An empty last row is used rather than adding another.
          if (!rows[rows.length - 1].trim()) return refs.current[rows.length - 1]?.focus()
          insert(rows.length, [''])
          setFocus({ row: rows.length })
        }}
      >
        <AddIcon size={16} aria-hidden /> Add {noun.toLowerCase()}
      </button>
    </div>
  )
}
