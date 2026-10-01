import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { scaleFactor, scaleLine } from '@shared/recipes/scaler.js'
import { ICON_STROKE } from '../../components/Icons'
import { useDevice } from '../../lib/DeviceContext'
import { useKeepAwake } from '../../lib/keepAwake'
import { cookingReducer, endCooking, FRESH, saveCooking, watchCooking, type CookingAction, type CookingState } from './cookingApi'
import { lines, type Recipe } from './recipesApi'

interface ViewProps {
  recipe: Recipe
  state: CookingState
  onAction: (a: CookingAction) => void
  onReset: () => void
  onDone: () => void
  /** One big step at a time (default on the wall tablet). */
  oneStep?: boolean
}

/** The clean cooking screen: ingredient checklist, numbered steps, serving scaler. */
export function CookingView({ recipe, state, onAction, onReset, onDone, oneStep: initialOneStep = false }: ViewProps) {
  const [oneStep, setOneStep] = useState(initialOneStep)
  const ingredients = lines(recipe.ingredients)
  const steps = lines(recipe.steps)
  const base = recipe.servings ?? null
  const servings = state.servings ?? base
  const factor = scaleFactor(base, servings)
  const step = Math.min(state.step, Math.max(0, steps.length - 1))
  useKeepAwake(true)

  return (
    <div className={`cooking${oneStep ? ' cooking--one' : ''}`} role="dialog" aria-modal="true" aria-label={`Cooking ${recipe.title}`}>
      <header className="cooking__head">
        <h1 className="cooking__title">{recipe.title}</h1>
        <div className="row cooking__tools">
          {base ? (
            <div className="cooking__servings" role="group" aria-label="Servings">
              <button type="button" className="icon-button" aria-label="Fewer servings" disabled={!servings || servings <= 1} onClick={() => onAction({ type: 'servings', n: (servings ?? 1) - 1 })}>
                <Minus size={20} strokeWidth={ICON_STROKE} aria-hidden />
              </button>
              <span aria-live="polite">Serves {servings}</span>
              <button type="button" className="icon-button" aria-label="More servings" onClick={() => onAction({ type: 'servings', n: (servings ?? 0) + 1 })}>
                <Plus size={20} strokeWidth={ICON_STROKE} aria-hidden />
              </button>
            </div>
          ) : null}
          {steps.length > 1 && (
            <button type="button" className="button" aria-pressed={oneStep} onClick={() => setOneStep((v) => !v)}>
              {oneStep ? 'Show all steps' : 'One step at a time'}
            </button>
          )}
          <button type="button" className="button" onClick={onReset}>
            Reset
          </button>
          <button type="button" className="button button--primary" onClick={onDone}>
            Done
          </button>
        </div>
        <p className="cooking__progress muted">
          {state.items.length} of {ingredients.length} ingredients · {state.steps.length} of {steps.length} steps
          {factor !== 1 && ` · amounts × ${Math.round(factor * 100) / 100}`}
        </p>
      </header>

      <div className="cooking__body">
        <section className="cooking__ingredients" aria-label="Ingredients">
          <h2>Ingredients</h2>
          <ul>
            {ingredients.map((line, i) => {
              const on = state.items.includes(i)
              return (
                <li key={i}>
                  <label className={`cooking__check${on ? ' cooking__check--done' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => onAction({ type: 'item', i })} />
                    <span>{scaleLine(line, factor)}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="cooking__steps" aria-label="Steps">
          {oneStep && steps.length > 0 ? (
            <div className="cooking__one">
              <p className="cooking__count">
                Step {step + 1} of {steps.length}
              </p>
              <p className={`cooking__big${state.steps.includes(step) ? ' cooking__big--done' : ''}`}>{steps[step]}</p>
              <div className="row cooking__nav">
                <button type="button" className="button cooking__navbtn" disabled={step === 0} onClick={() => onAction({ type: 'goto', step: step - 1, total: steps.length })}>
                  <ChevronLeft size={22} strokeWidth={ICON_STROKE} aria-hidden /> Back
                </button>
                {step < steps.length - 1 ? (
                  <button type="button" className="button button--primary cooking__navbtn" onClick={() => onAction({ type: 'next', total: steps.length })}>
                    Next <ChevronRight size={22} strokeWidth={ICON_STROKE} aria-hidden />
                  </button>
                ) : (
                  <button type="button" className="button button--primary cooking__navbtn" onClick={onDone}>
                    Finish
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <h2>Steps</h2>
              <ol>
                {steps.map((s, i) => {
                  const on = state.steps.includes(i)
                  return (
                    <li key={i}>
                      <button type="button" className={`cooking__step${on ? ' cooking__step--done' : ''}`} aria-pressed={on} onClick={() => onAction({ type: 'step', i })}>
                        <span className="cooking__num" aria-hidden>
                          {i + 1}
                        </span>
                        <span>{s}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

/** Cooking mode with live, shared progress (any device in the family sees the same checks). */
export function CookingMode({ familyId, userId, recipe, onClose }: { familyId: string; userId: string; recipe: Recipe; onClose: () => void }) {
  const { device } = useDevice()
  const [state, setState] = useState<CookingState>(FRESH)
  const latest = useRef(state)
  const [error, setError] = useState<string | null>(null)
  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  useEffect(
    () =>
      watchCooking(familyId, recipe.id, (s) => {
        latest.current = s ?? FRESH
        setState(latest.current)
      }),
    [familyId, recipe.id],
  )

  return (
    <>
      <CookingView
        recipe={recipe}
        state={state}
        oneStep={device === 'tablet'}
        onAction={(a) => {
          const next = cookingReducer(latest.current, a)
          latest.current = next
          setState(next)
          saveCooking(familyId, recipe.id, userId, next).catch(report)
        }}
        onReset={() => {
          latest.current = FRESH
          setState(FRESH)
          endCooking(familyId, recipe.id).catch(report)
        }}
        onDone={() => {
          endCooking(familyId, recipe.id).catch(() => undefined)
          onClose()
        }}
      />
      {error && (
        <p className="error cooking__error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
