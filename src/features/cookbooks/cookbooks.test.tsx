import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RecipeBook } from '../recipes/RecipeBook'
import type { Recipe } from '../recipes/recipesApi'
import { describeFile, type Cookbook } from './cookbooksApi'
import { CookbookList } from './CookbookList'

const book = (id: string, extra: Partial<Cookbook> = {}): Cookbook => ({
  id,
  title: `Book ${id}`,
  author: null,
  format: 'pdf',
  status: 'done',
  progress: null,
  ocr: false,
  recipeCount: 0,
  reviewCount: 0,
  error: null,
  coverPath: null,
  createdAt: 0,
  ...extra,
})

const handlers = () => ({ coverUrl: vi.fn(async () => 'https://img/cover.png'), onUpload: vi.fn(), onRename: vi.fn(), onReparse: vi.fn(), onDelete: vi.fn(), onReview: vi.fn() })

describe('describeFile', () => {
  it('reads the format and a starting title from the file name', () => {
    expect(describeFile('salt_fat-acid heat.PDF')).toEqual({ format: 'pdf', title: 'salt fat acid heat' })
    expect(describeFile('Family Suppers.epub')).toEqual({ format: 'epub', title: 'Family Suppers' })
    expect(describeFile('notes.docx')).toBeNull()
  })
})

describe('CookbookList', () => {
  it('shows each book with its status, counts, OCR badge, and progress', async () => {
    render(
      <CookbookList
        books={[
          book('a', { title: 'Salt Fat Acid Heat', author: 'Samin Nosrat', recipeCount: 120, reviewCount: 7, coverPath: 'families/f/cookbooks/a/cover.png' }),
          book('b', { title: 'Old Family Book', status: 'parsing', ocr: true, progress: { done: 40, total: 220, unit: 'pages' }, recipeCount: 12 }),
          book('c', { title: 'Locked', status: 'error', error: "Can't read this file: it's DRM-protected." }),
        ]}
        uploads={{ 'new-book.epub': 0.5 }}
        {...handlers()}
      />,
    )
    const sfah = screen.getByRole('listitem', { name: 'Salt Fat Acid Heat' })
    expect(sfah).toHaveTextContent('PDF · Samin Nosrat · 120 recipes')
    expect(sfah).toHaveTextContent('Ready')
    expect(within(sfah).getByRole('button', { name: '7 need review' })).toBeInTheDocument()
    // The cover is decorative (alt=""), so look it up directly.
    await waitFor(() => expect(sfah.querySelector('img')).toHaveAttribute('src', 'https://img/cover.png'))

    const old = screen.getByRole('listitem', { name: 'Old Family Book' })
    expect(old).toHaveTextContent('OCR')
    expect(old).toHaveTextContent('Reading pages 40 of 220…')
    expect(within(old).getByRole('button', { name: 'Re-parse Old Family Book' })).toBeDisabled()

    expect(screen.getByRole('listitem', { name: 'Locked' })).toHaveTextContent("DRM-protected")
    expect(screen.getByLabelText('Uploading new-book.epub')).toHaveAttribute('value', '0.5')
  })

  it('uploads, renames, re-parses, and opens the review list', () => {
    const h = handlers()
    render(<CookbookList books={[book('a', { reviewCount: 2, recipeCount: 5 })]} uploads={{}} {...h} />)
    const file = new File(['%PDF'], 'mine.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Choose cookbook files'), { target: { files: [file] } })
    expect(h.onUpload).toHaveBeenCalledWith([file])

    fireEvent.click(screen.getByRole('button', { name: 'Rename Book a' }))
    fireEvent.change(screen.getByLabelText('Cookbook title'), { target: { value: 'Weeknights' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(h.onRename).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'Weeknights')

    fireEvent.click(screen.getByRole('button', { name: 'Re-parse Book a' }))
    expect(h.onReparse).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
    fireEvent.click(screen.getByRole('button', { name: '2 need review' }))
    expect(h.onReview).toHaveBeenCalled()
  })

  it('asks whether to remove the recipes too when deleting', () => {
    const h = handlers()
    render(<CookbookList books={[book('a', { recipeCount: 31 })]} uploads={{}} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Book a' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Book a' })
    const remove = within(dialog).getByRole('checkbox', { name: 'Also remove its 31 recipes from the catalog' })
    expect(remove).not.toBeChecked()
    fireEvent.click(remove)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(h.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps recipes by default and can be cancelled', () => {
    const h = handlers()
    render(<CookbookList books={[book('a', { recipeCount: 3 })]} uploads={{}} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Book a' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(h.onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Book a' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(h.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), false)
  })
})

describe('Needs review', () => {
  const recipe = (id: string, extra: Partial<Recipe> = {}): Recipe => ({ id, title: `Recipe ${id}`, ingredients: '1 cup flour', steps: 'Mix.', servings: null, minutes: null, url: null, ...extra })
  const props = { today: '2026-10-01', onSave: vi.fn(), onDelete: vi.fn(), onPlan: vi.fn() }

  it('filters to low-confidence cookbook recipes and clears one with "Looks right"', () => {
    const onMarkReviewed = vi.fn()
    render(
      <RecipeBook
        {...props}
        recipes={[recipe('a'), recipe('b', { needsReview: true, source: { type: 'cookbook', bookTitle: 'Old Family Book', location: 'p. 7 (OCR)' } })]}
        onMarkReviewed={onMarkReviewed}
        initialFilter="review"
      />,
    )
    const list = screen.getByRole('list', { name: 'Recipes' })
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual([expect.stringContaining('Recipe b')])
    fireEvent.click(within(list).getByRole('button', { name: /Recipe b/ }))
    expect(screen.getByRole('note')).toHaveTextContent('read automatically from a scanned page')
    expect(within(screen.getByRole('article', { name: 'Recipe b' })).getByText('Old Family Book')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Looks right' }))
    expect(onMarkReviewed).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))

    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(within(list).getAllByRole('button')).toHaveLength(2)
  })

  it('hides the filter when nothing needs review', () => {
    render(<RecipeBook {...props} recipes={[recipe('a')]} />)
    expect(screen.queryByRole('button', { name: /Needs review/ })).not.toBeInTheDocument()
  })
})
