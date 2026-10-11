import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const resolve = vi.hoisted(() => ({ fn: vi.fn() }))
vi.mock('./lib/hooks', async (importActual) => ({
  ...(await importActual<typeof import('./lib/hooks')>()),
  useAuthUser: () => ({ uid: 'u1', email: 'andrew@example.test', displayName: 'Andrew Jacobs' }),
}))
vi.mock('./lib/family', async (importActual) => ({
  ...(await importActual<typeof import('./lib/family')>()),
  resolveFamily: (...a: unknown[]) => resolve.fn(...a),
}))

const offline = new Error('Failed to get document because the client is offline.')

describe('starting up without a connection', () => {
  beforeEach(() => {
    resolve.fn.mockReset()
    resolve.fn.mockRejectedValueOnce(offline).mockResolvedValue(null)
  })

  it('says it can’t reach the household and tries again when asked', async () => {
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Can’t reach your household right now.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Welcome, Andrew' })).toBeInTheDocument()
    expect(resolve.fn).toHaveBeenCalledTimes(2)
  })

  it('tries again by itself once the device is back online (the tablet booting before its Wi-Fi)', async () => {
    render(<App />)
    await screen.findByRole('alert')
    act(() => void window.dispatchEvent(new Event('online')))
    expect(await screen.findByRole('heading', { name: 'Welcome, Andrew' })).toBeInTheDocument()
  })
})
