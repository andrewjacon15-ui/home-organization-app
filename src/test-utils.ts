import { fireEvent, screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

function optionIn(option: string): HTMLElement {
  const list = screen.getByRole('listbox')
  const byName = within(list).queryByRole('option', { name: option })
  const byValue = [...list.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.dataset.value === option)
  const target = byName ?? byValue
  if (!target) throw new Error(`No option "${option}"`)
  return target
}

/** Picks an option in the app's dropdown (components/Select) by its text or its value. */
export async function choose(user: UserEvent, combobox: HTMLElement, option: string) {
  await user.click(combobox)
  await user.click(optionIn(option))
}

/** The same, with plain events (for tests that don't use user-event). */
export function chooseNow(combobox: HTMLElement, option: string) {
  fireEvent.click(combobox)
  fireEvent.click(optionIn(option))
}
