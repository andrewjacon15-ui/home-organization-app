import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { normalizeHex, PERSON_COLORS, readableOn } from '../lib/colors'
import { fetchLiveVersion } from '../lib/version'
import { ColorPicker } from './ColorPicker'

describe('colors', () => {
  it('offers twelve distinct hex presets', () => {
    expect(PERSON_COLORS).toHaveLength(12)
    expect(new Set(PERSON_COLORS.map((c) => c.hex)).size).toBe(12)
    for (const c of PERSON_COLORS) expect(c.hex).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('normalizes hex input', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc')
    expect(normalizeHex('1d4ed8')).toBe('#1d4ed8')
    expect(normalizeHex(' #1D4ED8 ')).toBe('#1d4ed8')
    expect(normalizeHex('blue')).toBeNull()
    expect(normalizeHex('#12345')).toBeNull()
  })

  it('picks readable text for a highlight color', () => {
    expect(readableOn('#1d4ed8')).toBe('#ffffff')
    expect(readableOn('#facc15')).toBe('#000000')
    expect(readableOn('#ffffff')).toBe('#000000')
  })
})

describe('ColorPicker', () => {
  it('selects a preset', async () => {
    const onChange = vi.fn()
    render(<ColorPicker label="Your color" value="#c2410c" onChange={onChange} />)
    expect(screen.getAllByRole('radio')).toHaveLength(12)
    expect(screen.getByRole('radio', { name: 'Rust' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('radio', { name: 'Teal' }))
    expect(onChange).toHaveBeenCalledWith('#0f766e')
  })

  it('accepts a custom hex code and ignores junk', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColorPicker label="Your color" value="#c2410c" onChange={onChange} />)
    const field = screen.getByLabelText('Your color hex code')
    await user.clear(field)
    await user.type(field, 'ff00aa{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('#ff00aa')
    onChange.mockClear()
    await user.clear(field)
    await user.type(field, 'nope{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    expect(field).toHaveValue('#c2410c')
  })
})

describe('fetchLiveVersion', () => {
  it('reads version.json without caching, and returns null when offline', async () => {
    const ok = vi.fn(async (_u: string | URL | Request, _init?: RequestInit) => ({ ok: true, json: async () => ({ version: '1.0.0+abc', buildTime: 'x' }) }) as Response)
    expect(await fetchLiveVersion(ok)).toEqual({ version: '1.0.0+abc', buildTime: 'x' })
    expect(String(ok.mock.calls[0][0])).toMatch(/^\/version\.json\?t=\d+$/)
    expect(ok.mock.calls[0][1]).toEqual({ cache: 'no-store' })
    expect(await fetchLiveVersion(vi.fn(async () => Promise.reject(new Error('offline'))))).toBeNull()
  })
})
