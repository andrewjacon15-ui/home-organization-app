import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StaticSettings } from '../settings/SettingsContext'
import { PhotoLibrary } from './PhotoLibrary'
import { fitWithin, shuffled, type Photo } from './photosApi'
import { ScreensaverProvider } from './ScreensaverContext'
import { Slideshow } from './Slideshow'

let library: Photo[] = []
vi.mock('./photosApi', async (importActual) => ({
  ...(await importActual<typeof import('./photosApi')>()),
  watchPhotos: (_familyId: string, onChange: (p: Photo[]) => void) => {
    onChange(library)
    return () => undefined
  },
}))

const photo = (id: string, extra: Partial<Photo> = {}): Photo => ({ id, storagePath: `families/f/photos/${id}.jpg`, url: `https://img/${id}.jpg`, kind: 'image', caption: '', uploadedBy: 'u', ...extra })

describe('fitWithin', () => {
  it('scales the longest side down to the limit and never enlarges', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2560, height: 1920 })
    expect(fitWithin(3024, 4032)).toEqual({ width: 1920, height: 2560 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
})

describe('shuffled', () => {
  it('returns a permutation without touching the input', () => {
    const input = [1, 2, 3, 4, 5]
    const out = shuffled(input, () => 0)
    expect(out).not.toEqual(input)
    expect([...out].sort()).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5])
  })
})

describe('Slideshow', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('cross-fades to the next photo on a timer and closes on tap', () => {
    const onExit = vi.fn()
    const { container } = render(<Slideshow photos={[photo('a', { caption: 'Beach day' }), photo('b')]} seconds={5} shuffle={false} onExit={onExit} />)
    const visible = () => container.querySelector('.slideshow__layer--on img')?.getAttribute('src')
    expect(visible()).toBe('https://img/a.jpg')
    expect(screen.getByText('Beach day')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(5_000))
    expect(visible()).toBe('https://img/b.jpg')
    act(() => vi.advanceTimersByTime(5_000))
    expect(visible()).toBe('https://img/a.jpg')
    fireEvent.click(screen.getByRole('dialog', { name: /photo slideshow/i }))
    expect(onExit).toHaveBeenCalled()
  })
})

describe('PhotoLibrary', () => {
  const props = { progress: null, onUpload: vi.fn(), onCaption: vi.fn(), onDelete: vi.fn(), onStart: vi.fn() }

  it('explains the empty state and disables the slideshow', () => {
    render(<PhotoLibrary photos={[]} {...props} />)
    expect(screen.getByText(/no photos yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start slideshow' })).toBeDisabled()
  })

  it('uploads chosen files, edits captions, and deletes after confirming', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PhotoLibrary photos={[photo('a'), photo('v', { kind: 'video', url: 'https://img/v.mp4' })]} {...props} />)
    expect(screen.getByText('Video')).toBeInTheDocument()

    const file = new File(['x'], 'beach.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('Choose photos or videos'), { target: { files: [file] } })
    expect(props.onUpload).toHaveBeenCalledWith([file])

    fireEvent.click(screen.getByRole('button', { name: 'Photo' }))
    const caption = screen.getByLabelText('Caption')
    fireEvent.change(caption, { target: { value: 'Beach day' } })
    fireEvent.blur(caption)
    expect(props.onCaption).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'Beach day')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(props.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
    expect(screen.queryByRole('dialog', { name: 'Photo details' })).not.toBeInTheDocument()
  })

  it('shows upload progress', () => {
    render(<PhotoLibrary photos={[]} {...props} progress={{ done: 1, total: 3, fraction: 0.5 }} />)
    expect(screen.getByRole('status')).toHaveTextContent('Uploading 2 of 3')
    expect(screen.getByRole('button', { name: 'Add photos' })).toBeDisabled()
  })
})

describe('ScreensaverProvider', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    library = []
  })

  const mount = (kiosk: boolean, settings = {}) =>
    render(
      <StaticSettings settings={settings}>
        <ScreensaverProvider familyId="f" kiosk={kiosk}>
          <p>app</p>
        </ScreensaverProvider>
      </StaticSettings>,
    )
  const slideshow = () => screen.queryByRole('dialog', { name: /photo slideshow/i })

  it('starts on the wall display after the idle time, and a tap closes it', () => {
    library = [photo('a'), photo('b')]
    mount(true, { screensaverAfterMinutes: 2 })
    act(() => vi.advanceTimersByTime(60_000))
    expect(slideshow()).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(70_000))
    fireEvent.click(slideshow()!)
    expect(slideshow()).not.toBeInTheDocument()
  })

  it('stays off on phones, when disabled, or with no photos', () => {
    library = [photo('a')]
    const phone = mount(false)
    act(() => vi.advanceTimersByTime(60 * 60_000))
    expect(slideshow()).not.toBeInTheDocument()
    phone.unmount()

    const disabled = mount(true, { screensaverEnabled: false })
    act(() => vi.advanceTimersByTime(60 * 60_000))
    expect(slideshow()).not.toBeInTheDocument()
    disabled.unmount()

    library = []
    mount(true)
    act(() => vi.advanceTimersByTime(60 * 60_000))
    expect(slideshow()).not.toBeInTheDocument()
  })
})
