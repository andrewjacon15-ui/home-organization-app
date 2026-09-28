import { useState } from 'react'

interface Props {
  title: string
  hint?: string
  /** Called with the 4 digits; return false to show an error and clear. */
  onSubmit: (pin: string) => Promise<boolean> | boolean
  onCancel?: () => void
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

/** A big, touch-friendly 4-digit keypad. Submits automatically on the fourth digit. */
export function PinPad({ title, hint, onSubmit, onCancel }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  async function press(key: string) {
    if (busy) return
    if (key === '⌫') {
      setPin(pin.slice(0, -1))
      return
    }
    const next = (pin + key).slice(0, 4)
    setPin(next)
    setError(false)
    if (next.length === 4) {
      setBusy(true)
      const ok = await onSubmit(next)
      setBusy(false)
      if (!ok) {
        setError(true)
        setPin('')
      }
    }
  }

  return (
    <div className="pinpad" role="group" aria-label={title}>
      <h2 className="pinpad__title">{title}</h2>
      {hint && <p className="muted">{hint}</p>}
      <div className={`pinpad__dots${error ? ' pinpad__dots--error' : ''}`} aria-live="polite" aria-label={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`pinpad__dot${i < pin.length ? ' pinpad__dot--on' : ''}`} />
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          Wrong PIN. Try again.
        </p>
      )}
      <div className="pinpad__keys">
        {KEYS.map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : (
            <button key={i} type="button" className="pinpad__key" onClick={() => void press(k)} aria-label={k === '⌫' ? 'Delete digit' : k}>
              {k}
            </button>
          ),
        )}
      </div>
      {onCancel && (
        <button type="button" className="link" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  )
}
