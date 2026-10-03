import { fireEvent, render, screen, within } from '@testing-library/react'
import { useReducer } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { isHeldAwake } from '../../lib/keepAwake'
import { TimersProvider } from '../timers/TimersContext'
import { cookingFactor, cookingReducer, FRESH, type CookingState } from './cookingApi'
import { CookingView } from './CookingMode'
import type { Recipe } from './recipesApi'

const recipe: Recipe = {
  id: 'p',
  title: 'Pancakes',
  servings: 4,
  minutes: 20,
  url: null,
  ingredients: '1 1/2 cups flour\n2 eggs\n1 1/4 cups milk\nButter, for the pan',
  steps: 'Whisk the dry ingredients.\nAdd milk and eggs.\nCook on a hot griddle, 2-3 minutes per side.',
}

vi.mock('../timers/alarm', () => ({ primeAlarm: vi.fn(), startAlarm: vi.fn(), stopAlarm: vi.fn(), canRaiseVolume: () => false }))

describe('cooking session reducer', () => {
  it('checks and unchecks ingredients and steps', () => {
    let s = cookingReducer(FRESH, { type: 'item', i: 2 })
    s = cookingReducer(s, { type: 'item', i: 0 })
    expect(s.items).toEqual([0, 2])
    s = cookingReducer(s, { type: 'item', i: 2 })
    expect(s.items).toEqual([0])
    s = cookingReducer(s, { type: 'step', i: 1 })
    expect(s.steps).toEqual([1])
  })

  it('Next finishes the step and moves on, never past the last', () => {
    let s: CookingState = FRESH
    s = cookingReducer(s, { type: 'next', total: 3 })
    s = cookingReducer(s, { type: 'next', total: 3 })
    s = cookingReducer(s, { type: 'next', total: 3 })
    expect(s).toMatchObject({ step: 2, steps: [0, 1, 2] })
    expect(cookingReducer(s, { type: 'goto', step: -4, total: 3 }).step).toBe(0)
  })

  it('scales the batch between an eighth and sixteen times, and back to as written', () => {
    expect(cookingReducer(FRESH, { type: 'scale', f: 0.5 }).scale).toBe(0.5)
    expect(cookingReducer(FRESH, { type: 'scale', f: 100 }).scale).toBe(16)
    expect(cookingReducer({ ...FRESH, scale: 2 }, { type: 'scale', f: 1 }).scale).toBeNull()
    expect(cookingFactor({ ...FRESH, servings: 6 }, 4)).toBe(1.5)
    expect(cookingFactor({ ...FRESH, scale: 0.5 }, null)).toBe(0.5)
  })

  it('keeps servings between 1 and 100', () => {
    expect(cookingReducer(FRESH, { type: 'servings', n: 0 }).servings).toBe(1)
    expect(cookingReducer(FRESH, { type: 'servings', n: 500 }).servings).toBe(100)
  })
})

function Harness({ oneStep = false, onReset = vi.fn(), onDone = vi.fn() }: { oneStep?: boolean; onReset?: () => void; onDone?: () => void }) {
  const [state, dispatch] = useReducer(cookingReducer, FRESH)
  return (
    <TimersProvider>
      <CookingView recipe={recipe} state={state} onAction={dispatch} onReset={onReset} onDone={onDone} oneStep={oneStep} />
    </TimersProvider>
  )
}

describe('CookingView', () => {
  it('checks off ingredients and steps (crossed out) and counts progress', () => {
    render(<Harness />)
    const dialog = screen.getByRole('dialog', { name: 'Cooking Pancakes' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '2 eggs' }))
    expect(screen.getByRole('checkbox', { name: '2 eggs' }).closest('label')).toHaveClass('cooking__check--done')
    fireEvent.click(screen.getByRole('button', { name: /Whisk the dry ingredients/ }))
    expect(screen.getByRole('button', { name: /Whisk the dry ingredients/ })).toHaveAttribute('aria-pressed', 'true')
    expect(dialog).toHaveTextContent('1 of 4 ingredients · 1 of 3 steps')
  })

  it('scales amounts with the servings', () => {
    render(<Harness />)
    expect(screen.getByText('Serves 4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More servings' }))
    fireEvent.click(screen.getByRole('button', { name: 'More servings' }))
    expect(screen.getByText('Serves 6')).toBeInTheDocument()
    expect(screen.getByText('2 1/4 cups flour')).toBeInTheDocument()
    expect(screen.getByText('3 eggs')).toBeInTheDocument()
    expect(screen.getByText('Butter, for the pan')).toBeInTheDocument()
    expect(screen.getByText(/amounts × 1.5/)).toBeInTheDocument()
  })

  it('halves, doubles and shows metric amounts, steps included', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Double' }))
    expect(screen.getByText('Serves 8')).toBeInTheDocument()
    expect(screen.getByText('3 cups flour')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Half' }))
    expect(screen.getByText('Serves 2')).toBeInTheDocument()
    expect(screen.getByText('1 egg', { exact: false })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Metric' }))
    expect(screen.getByText('180 ml flour')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Metric' }))
  })

  it('shows every step to start, with Step by step as a choice', () => {
    render(<Harness />)
    expect(within(screen.getByRole('region', { name: 'Steps' })).getAllByRole('listitem')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Step by step' }))
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
  })

  it('walks one big step at a time on the tablet, finishing with Done', () => {
    const onDone = vi.fn()
    render(<Harness oneStep onDone={onDone} />)
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument()
    expect(screen.getByText('Cook on a hot griddle, 2-3 minutes per side.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(onDone).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Show all steps' }))
    expect(within(screen.getByRole('region', { name: 'Steps' })).getAllByRole('button', { pressed: true }).map((b) => b.textContent)).toEqual([expect.stringContaining('Whisk'), expect.stringContaining('Add milk')])
  })

  it('shows ingredients and steps side by side, and either can fill the screen', () => {
    const { container } = render(<Harness />)
    const cooking = container.querySelector('.cooking')!
    expect(cooking).toHaveClass('cooking--both')
    fireEvent.click(screen.getByRole('button', { name: 'Full screen steps' }))
    expect(cooking).toHaveClass('cooking--steps')
    fireEvent.click(screen.getByRole('button', { name: 'Show ingredients and steps' }))
    fireEvent.click(screen.getByRole('button', { name: 'Full screen ingredients' }))
    expect(cooking).toHaveClass('cooking--ingredients')
  })

  it('readies a timer when you reach a step that calls for one, and starts it from the step', () => {
    localStorage.clear()
    render(<Harness oneStep />)
    expect(screen.queryByRole('button', { name: /Step 3/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    // Spawned, ready, in the header…
    expect(screen.getByRole('button', { name: /Step 3: Cook on a/ })).toHaveTextContent('Ready · 2:00')
    // …and started from the step itself.
    fireEvent.click(screen.getByRole('button', { name: 'Start 2–3 min timer' }))
    expect(screen.getByRole('button', { name: /Pause timer, 2:00 left/ })).toBeInTheDocument()
  })

  it('clears timers it readied but nobody started when you finish', () => {
    localStorage.clear()
    const onDone = vi.fn()
    render(<Harness onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: /Whisk the dry ingredients/ }))
    fireEvent.click(screen.getByRole('button', { name: /Add milk and eggs/ }))
    expect(screen.getByRole('button', { name: /Step 3: Cook on a/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('button', { name: /Step 3: Cook on a/ })).not.toBeInTheDocument()
    expect(onDone).toHaveBeenCalled()
  })

  it('keeps the screen awake (pausing sleep mode and the screensaver) while open', () => {
    const { unmount } = render(<Harness />)
    expect(isHeldAwake()).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    unmount()
    expect(isHeldAwake()).toBe(false)
  })
})
