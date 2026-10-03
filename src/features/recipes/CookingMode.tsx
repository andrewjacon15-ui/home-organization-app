import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Pause, Play, Timer } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ICON_STROKE } from '../../components/Icons'
import { useKeepAwake } from '../../lib/keepAwake'
import { findTimes, formatClock, formatSpan, stepLabel, type StepTime } from '../timers/timerMath'
import { TimerDock } from '../timers/Timers'
import { timeLeft } from '../timers/timerState'
import { useTimers } from '../timers/useTimers'
import { amountText, stepText, useMetric } from './amounts'
import { ScaleBar } from './ScaleBar'
import { cookingFactor, cookingReducer, endCooking, FRESH, saveCooking, watchCooking, type CookingAction, type CookingState } from './cookingApi'
import { lines, type Recipe } from './recipesApi'

interface ViewProps {
  recipe: Recipe
  state: CookingState
  onAction: (a: CookingAction) => void
  onReset: () => void
  onDone: () => void
  /** One big step at a time (off to start: every step shows, and "Step by step" switches). */
  oneStep?: boolean
}

type Focus = 'both' | 'ingredients' | 'steps'

/** Where a step's timer comes from, so the same step never spawns it twice. */
const sourceOf = (recipeId: string, step: number, k: number) => `${recipeId}#${step}#${k}`

/** A step's timer: start it, or see it count down, right on the step. */
function StepTimer({ source, time, label, big = false }: { source: string; time: StepTime; label: string; big?: boolean }) {
  const { timers, now, add, start, pause } = useTimers()
  const t = timers.find((x) => x.source === source)
  const length = formatSpan(time.seconds, time.maxSeconds)
  const cls = `step-timer${big ? ' step-timer--big' : ''}`
  if (!t || t.state === 'ready' || t.state === 'paused') {
    return (
      <button
        type="button"
        className={`${cls} step-timer--ready`}
        onClick={(e) => {
          e.stopPropagation()
          if (t) start(t.id)
          else add(label, time.seconds, { start: true, source })
        }}
      >
        <Play size={big ? 20 : 16} strokeWidth={ICON_STROKE} aria-hidden />
        {t?.state === 'paused' ? `Resume timer · ${formatClock(t.leftMs)}` : `Start ${length} timer`}
      </button>
    )
  }
  if (t.state === 'running') {
    return (
      <button
        type="button"
        className={`${cls} step-timer--running`}
        aria-label={`Pause timer, ${formatClock(timeLeft(t, now))} left`}
        onClick={(e) => {
          e.stopPropagation()
          pause(t.id)
        }}
      >
        <Pause size={big ? 20 : 16} strokeWidth={ICON_STROKE} aria-hidden />
        {formatClock(timeLeft(t, now))} left
      </button>
    )
  }
  return <span className={`${cls} step-timer--done`}>Time’s up</span>
}

function StepTimers({ recipeId, step, text, big }: { recipeId: string; step: number; text: string; big?: boolean }) {
  const times = findTimes(text)
  if (!times.length) return null
  return (
    <span className="step-timers">
      {times.map((t, k) => (
        <StepTimer key={k} source={sourceOf(recipeId, step, k)} time={t} label={stepLabel(text, step + 1)} big={big} />
      ))}
    </span>
  )
}

/**
 * The cooking screen: ingredients on one side, steps on the other (either can fill the
 * screen), serving scaler, and kitchen timers. When the step you're on calls for a time
 * ("bake 35 minutes"), its timer appears ready to start.
 */
export function CookingView({ recipe, state, onAction, onReset, onDone, oneStep: initialOneStep = false }: ViewProps) {
  const [oneStep, setOneStep] = useState(initialOneStep)
  const [focus, setFocus] = useState<Focus>('both')
  const { add, hasSource, timers, dismiss, setPanelOpen } = useTimers()
  const ingredients = lines(recipe.ingredients)
  const steps = lines(recipe.steps)
  const [metric, setMetric] = useMetric()
  const base = recipe.servings ?? null
  const factor = cookingFactor(state, base)
  // The step you're on: the one shown big, or else the first not yet checked off.
  const firstOpen = steps.findIndex((_, i) => !state.steps.includes(i))
  const current = oneStep ? Math.min(state.step, Math.max(0, steps.length - 1)) : firstOpen
  useKeepAwake(true)

  // While cooking, timers show in this header instead of the corner (which would cover Next).
  useEffect(() => {
    document.documentElement.dataset.cooking = '1'
    return () => {
      delete document.documentElement.dataset.cooking
    }
  }, [])

  // A step that calls for a time gets its timer, ready to start, when you reach it.
  const currentText = current >= 0 ? steps[current] : undefined
  useEffect(() => {
    if (currentText == null) return
    findTimes(currentText).forEach((t, k) => {
      const source = sourceOf(recipe.id, current, k)
      if (!hasSource(source)) add(stepLabel(currentText, current + 1), t.seconds, { source })
    })
    // Only when the step changes; hasSource/add change with every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe.id, current, currentText])

  /** Timers this recipe spawned that were never started go away with the recipe. */
  const tidy = () => timers.filter((t) => t.state === 'ready' && t.source?.startsWith(`${recipe.id}#`)).forEach((t) => dismiss(t.id))

  const expand = (pane: Exclude<Focus, 'both'>, name: string) => (
    <button
      type="button"
      className="icon-button"
      aria-label={focus === pane ? 'Show ingredients and steps' : `Full screen ${name}`}
      aria-pressed={focus === pane}
      onClick={() => setFocus(focus === pane ? 'both' : pane)}
    >
      {focus === pane ? <Minimize2 size={20} strokeWidth={ICON_STROKE} aria-hidden /> : <Maximize2 size={20} strokeWidth={ICON_STROKE} aria-hidden />}
    </button>
  )

  return (
    <div className={`cooking cooking--${focus}${oneStep ? ' cooking--one' : ''}`} role="dialog" aria-modal="true" aria-label={`Cooking ${recipe.title}`}>
      <header className="cooking__head">
        <h1 className="cooking__title">{recipe.title}</h1>
        <div className="row cooking__tools">
          <ScaleBar base={base} factor={factor} onScale={(f) => onAction({ type: 'scale', f })} metric={metric} onMetric={setMetric} />
          <button type="button" className="button" onClick={() => setPanelOpen(true)}>
            <Timer size={18} strokeWidth={ICON_STROKE} aria-hidden /> Timers
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              tidy()
              onReset()
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              tidy()
              onDone()
            }}
          >
            Done
          </button>
        </div>
        <p className="cooking__progress muted">
          {state.items.length} of {ingredients.length} ingredients · {state.steps.length} of {steps.length} steps
          {factor !== 1 && ` · amounts × ${Math.round(factor * 100) / 100}`}
        </p>
        <TimerDock inline />
      </header>

      <div className="cooking__body">
        <section className="cooking__pane cooking__ingredients" aria-label="Ingredients">
          <div className="cooking__pane-head">
            <h2>Ingredients</h2>
            {expand('ingredients', 'ingredients')}
          </div>
          <ul>
            {ingredients.map((line, i) => {
              const on = state.items.includes(i)
              return (
                <li key={i}>
                  <label className={`cooking__check${on ? ' cooking__check--done' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => onAction({ type: 'item', i })} />
                    <span>{amountText(line, factor, metric)}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="cooking__pane cooking__steps" aria-label="Steps">
          <div className="cooking__pane-head">
            <h2>Steps</h2>
            <div className="row">
              {steps.length > 1 && (
                <button type="button" className="button" aria-pressed={oneStep} onClick={() => setOneStep((v) => !v)}>
                  {oneStep ? 'Show all steps' : 'Step by step'}
                </button>
              )}
              {expand('steps', 'steps')}
            </div>
          </div>
          {oneStep && steps.length > 0 ? (
            <div className="cooking__one">
              <p className="cooking__count">
                Step {current + 1} of {steps.length}
              </p>
              <p className={`cooking__big${state.steps.includes(current) ? ' cooking__big--done' : ''}`}>{stepText(steps[current], metric)}</p>
              <StepTimers recipeId={recipe.id} step={current} text={steps[current]} big />
              <div className="row cooking__nav">
                <button type="button" className="button cooking__navbtn" disabled={current === 0} onClick={() => onAction({ type: 'goto', step: current - 1, total: steps.length })}>
                  <ChevronLeft size={22} strokeWidth={ICON_STROKE} aria-hidden /> Back
                </button>
                {current < steps.length - 1 ? (
                  <button type="button" className="button button--primary cooking__navbtn" onClick={() => onAction({ type: 'next', total: steps.length })}>
                    Next <ChevronRight size={22} strokeWidth={ICON_STROKE} aria-hidden />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button button--primary cooking__navbtn"
                    onClick={() => {
                      tidy()
                      onDone()
                    }}
                  >
                    Finish
                  </button>
                )}
              </div>
            </div>
          ) : (
            <ol>
              {steps.map((s, i) => {
                const on = state.steps.includes(i)
                return (
                  <li key={i} className={i === current ? 'cooking__current' : undefined}>
                    <button type="button" className={`cooking__step${on ? ' cooking__step--done' : ''}`} aria-pressed={on} onClick={() => onAction({ type: 'step', i })}>
                      <span className="cooking__num" aria-hidden>
                        {i + 1}
                      </span>
                      <span>{stepText(s, metric)}</span>
                    </button>
                    {!on && <StepTimers recipeId={recipe.id} step={i} text={s} />}
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}

/** Cooking mode with live, shared progress (any device in the family sees the same checks). */
export function CookingMode({ familyId, userId, recipe, scale = 1, oneStep = false, onClose }: { familyId: string; userId: string; recipe: Recipe; scale?: number; oneStep?: boolean; onClose: () => void }) {
  // A batch size picked on the recipe (½×, 2×) carries into a new cooking session.
  const [start] = useState<CookingState>(() => cookingReducer(FRESH, { type: 'scale', f: scale }))
  const [state, setState] = useState<CookingState>(start)
  const latest = useRef(state)
  const [error, setError] = useState<string | null>(null)
  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  useEffect(
    () =>
      watchCooking(familyId, recipe.id, (s) => {
        latest.current = s ?? start
        setState(latest.current)
      }),
    [familyId, recipe.id, start],
  )

  return (
    <>
      <CookingView
        recipe={recipe}
        state={state}
        oneStep={oneStep}
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
