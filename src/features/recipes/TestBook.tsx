import { useState } from 'react'
import { entryFor } from './catalog'
import { RecipeBook, type BookProps } from './RecipeBook'
import { structured, type Recipe } from './recipesApi'

/** Test harness: a RecipeBook over plain recipes, indexed the way the server indexes them. */
export function TestBook({ recipes, ...rest }: Omit<BookProps, 'entries' | 'selected' | 'current' | 'onSelect'> & { recipes: Recipe[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const entries = recipes.map((r) => entryFor({ ...structured(r), ...r }))
  return <RecipeBook {...rest} entries={entries} selected={selected} current={recipes.find((r) => r.id === selected) ?? null} onSelect={setSelected} />
}
