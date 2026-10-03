import { describe, expect, it } from 'vitest'
import { navFor } from '../components/navTabs'
import { detectDevice, layoutFor } from './device'

describe('detectDevice', () => {
  it('treats the kiosk as the wall tablet, whatever its screen says', () => {
    expect(detectDevice({ kiosk: true, coarse: false, shortSide: 720 })).toBe('tablet')
  })

  it('sorts touch screens into phones and tablets by size, and mice into computers', () => {
    expect(detectDevice({ kiosk: false, coarse: true, shortSide: 390 })).toBe('phone')
    expect(detectDevice({ kiosk: false, coarse: true, shortSide: 820 })).toBe('tablet')
    expect(detectDevice({ kiosk: false, coarse: false, shortSide: 1080 })).toBe('desktop')
  })
})

describe('layoutFor', () => {
  it('gives narrow windows the phone layout and leaves phones alone in landscape', () => {
    expect(layoutFor('desktop', 600)).toBe('phone')
    expect(layoutFor('desktop', 1280)).toBe('desktop')
    expect(layoutFor('phone', 844)).toBe('phone')
    expect(layoutFor('tablet', 1280)).toBe('tablet')
  })
})

describe('navFor', () => {
  it('shows every section by default, with the first four in the phone bar', () => {
    const tabs = navFor(undefined)
    expect(tabs.map((t) => t.id)).toEqual(['home', 'calendar', 'lists', 'chores', 'rewards', 'meals', 'recipes', 'photos', 'weather', 'settings'])
    expect(tabs.filter((t) => t.phone).map((t) => t.id)).toEqual(['home', 'calendar', 'lists', 'chores'])
  })

  it('drops hidden sections, refills the phone bar, and never hides Settings', () => {
    const tabs = navFor(['lists', 'photos', 'settings'])
    expect(tabs.map((t) => t.id)).toEqual(['home', 'calendar', 'chores', 'rewards', 'meals', 'recipes', 'weather', 'settings'])
    expect(tabs.filter((t) => t.phone).map((t) => t.id)).toEqual(['home', 'calendar', 'chores', 'rewards'])
  })
})
