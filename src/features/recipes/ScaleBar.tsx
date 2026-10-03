import { formatQuantity } from '@shared/recipes/quantity.js'
import { AddIcon, RemoveIcon } from '../../components/Icons'
import { clampScale } from './amounts'

const PRESETS = [
  { f: 0.5, label: '½×', name: 'Half' },
  { f: 1, label: '1×', name: 'As written' },
  { f: 2, label: '2×', name: 'Double' },
]

interface Props {
  /** Servings the recipe makes as written (null when it doesn't say). */
  base: number | null | undefined
  factor: number
  onScale: (factor: number) => void
  metric: boolean
  onMetric: (on: boolean) => void
}

/**
 * Half / as written / double, a servings stepper when the recipe says how many it serves,
 * and US or metric. Ingredient amounts follow; anything without an amount stays as written.
 */
export function ScaleBar({ base, factor, onScale, metric, onMetric }: Props) {
  const servings = base ? base * factor : null
  const step = (by: number) => onScale(clampScale((Math.max(1, Math.round((servings ?? 0) + by))) / base!))
  return (
    <div className="scale-bar" role="group" aria-label="Amounts">
      <div className="segmented segmented--small" role="group" aria-label="Batch size">
        {PRESETS.map((p) => (
          <button
            key={p.f}
            type="button"
            className={`segmented__item${Math.abs(factor - p.f) < 1e-6 ? ' segmented__item--active' : ''}`}
            aria-pressed={Math.abs(factor - p.f) < 1e-6}
            aria-label={p.name}
            title={p.name}
            onClick={() => onScale(p.f)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {servings != null && (
        <div className="scale-bar__servings" role="group" aria-label="Servings">
          <button type="button" className="icon-button" aria-label="Fewer servings" disabled={servings <= 1} onClick={() => step(-1)}>
            <RemoveIcon size={18} />
          </button>
          <span aria-live="polite">Serves {formatQuantity(servings)}</span>
          <button type="button" className="icon-button" aria-label="More servings" disabled={factor >= 16} onClick={() => step(1)}>
            <AddIcon size={18} />
          </button>
        </div>
      )}
      <label className="scale-bar__metric">
        <input type="checkbox" className="switch" checked={metric} onChange={(e) => onMetric(e.target.checked)} />
        Metric
      </label>
    </div>
  )
}
