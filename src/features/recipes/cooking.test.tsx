import { fireEvent, render, screen, within } from '@testing-library/react'
import { useReducer } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { isHeldAwake } from '../../lib/keepAwake'
import { cookingReducer, FRESH, type CookingState } from './cookingApi'
import { CookingView } from './CookingMode'
import type { Recipe } from './recipesApi'

const recipe: Recipe = {
  id: 'p',
  title: 'Pancakes',
  servings: 4,
  minutes: 20,
  url: null,
  ingredients: '1 1/2 cups flour\n2 eggs\n1 1/4 cups milk\nButter, for the pan',
  steps: 'Whisk the dry ingredients.\nAdd milk and eggs.\nCook on a hot griddle.',
}

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

  it('keeps servings between 1 and 100', () => {
    expect(cookingReducer(FRESH, { type: 'servings', n: 0 }).servings).toBe(1)
    expect(cookingReducer(FRESH, { type: 'servings', n: 500 }).servings).toBe(100)
  })
})

function Harness({ oneStep = false, onReset = vi.fn(), onDone = vi.fn() }: { oneStep?: boolean; onReset?: () => void; onDone?: () => void }) {
  const [state, dispatch] = useReducer(cookingReducer, FRESH)
  return <CookingView recipe={recipe} state={state} onAction={dispatch} onReset={onReset} onDone={onDone} oneStep={oneStep} />
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

  it('walks one big step at a time on the tablet, finishing with Done', () => {
    const onDone = vi.fn()
    render(<Harness oneStep onDone={onDone} />)
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument()
    expect(screen.getByText('Cook on a hot griddle.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(onDone).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Show all steps' }))
    expect(screen.getAllByRole('button', { pressed: true }).map((b) => b.textContent)).toEqual([expect.stringContaining('Whisk'), expect.stringContaining('Add milk')])
  })

  it('keeps the screen awake (pausing sleep mode and the screensaver) while open', () => {
    const { unmount } = render(<Harness />)
    expect(isHeldAwake()).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    unmount()
    expect(isHeldAwake()).toBe(false)
  })
})
