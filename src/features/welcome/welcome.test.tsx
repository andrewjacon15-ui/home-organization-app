import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectPlatform, rememberWelcomed, shouldWelcome, tourSteps } from './welcome'
import { WelcomeTour } from './WelcomeTour'

const at = (iso: string) => ({ toDate: () => new Date(iso) })

afterEach(() => localStorage.clear())

describe('who sees the welcome tour', () => {
  it('shows it once to people who join from now on', () => {
    expect(shouldWelcome({ joinedAt: at('2026-10-05T10:00:00Z') }, 'f', 'u')).toBe(true)
    // Already in the household before the tour existed, or already seen (anywhere).
    expect(shouldWelcome({ joinedAt: at('2026-09-01T10:00:00Z') }, 'f', 'u')).toBe(false)
    expect(shouldWelcome({ joinedAt: at('2026-10-05T10:00:00Z'), welcomedAt: at('2026-10-05T10:05:00Z') }, 'f', 'u')).toBe(false)
    expect(shouldWelcome({ joinedAt: null }, 'f', 'u')).toBe(false)
    expect(shouldWelcome(undefined, 'f', 'u')).toBe(false)
    rememberWelcomed('f', 'u')
    expect(shouldWelcome({ joinedAt: at('2026-10-05T10:00:00Z') }, 'f', 'u')).toBe(false)
  })
})

describe('tour steps', () => {
  it('ends with setup for the device in hand', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', false)).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)', false)).toBe('android')
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0)', false)).toBe('other')
    const text = (device: 'phone' | 'tablet' | 'desktop', p: 'ios' | 'android' | 'other') => tourSteps('The Rivera Family', device, p).map((s) => s.text).join(' ')
    expect(text('phone', 'ios')).toMatch(/Share button.*Add to Home Screen/)
    expect(text('phone', 'android')).toMatch(/⋮ menu, then Add to home screen/)
    expect(text('tablet', 'android')).toMatch(/family display/)
    expect(text('desktop', 'other')).toMatch(/address bar/)
    expect(tourSteps('The Rivera Family', 'phone', 'ios')[0].title).toBe('Welcome to The Rivera Family')
  })
})

describe('WelcomeTour', () => {
  it('walks through the cards and closes with Get started, or jumps to a part of the app', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onNavigate = vi.fn()
    const steps = tourSteps('The Rivera Family', 'phone', 'ios')
    const { unmount } = render(<WelcomeTour steps={steps} onNavigate={onNavigate} onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Welcome to The Rivera Family' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument()
    for (let i = 1; i < steps.length; i++) await user.click(screen.getByRole('button', { name: /Next/ }))
    expect(screen.getByText(`${steps.length} of ${steps.length}`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Get started' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()

    render(<WelcomeTour steps={steps} onNavigate={onNavigate} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: /Next/ }))
    await user.click(screen.getByRole('button', { name: 'Open Home' }))
    expect(onNavigate).toHaveBeenCalledWith('home')
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
