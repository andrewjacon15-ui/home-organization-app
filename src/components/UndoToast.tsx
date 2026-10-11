import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { UndoContext, type Restore } from '../lib/undo'
import { CloseIcon } from './Icons'

/** How long Undo stays on screen. */
export const UNDO_MS = 7000

/** The "Deleted · Undo" message along the bottom of the screen (one at a time; the newest wins). */
export function UndoProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; restore: Restore; action: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const offer = useCallback((message: string, restore: Restore, action = 'Undo') => {
    setError(null)
    setToast({ id: ++seq.current, message, restore, action })
  }, [])
  const value = useMemo(() => ({ offer }), [offer])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), UNDO_MS)
    return () => clearTimeout(t)
  }, [toast])

  const undo = async () => {
    if (!toast) return
    const { restore } = toast
    setToast(null)
    try {
      await restore()
    } catch (e) {
      setError(`Couldn’t ${toast.action === 'Undo' ? 'undo' : 'do that'}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <UndoContext.Provider value={value}>
      {children}
      {(toast || error) && (
        <div className="undo-toast" role="status">
          <span className="undo-toast__text">{error ?? toast?.message}</span>
          {toast && (
            <button type="button" className="undo-toast__undo" onClick={() => void undo()}>
              {toast.action}
            </button>
          )}
          <button type="button" className="icon-button undo-toast__close" aria-label="Dismiss" onClick={() => (setToast(null), setError(null))}>
            <CloseIcon size={18} />
          </button>
        </div>
      )}
    </UndoContext.Provider>
  )
}
