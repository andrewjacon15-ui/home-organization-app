import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StaticSettings } from '../settings/SettingsContext'
import { PhotoLibrary } from './PhotoLibrary'
import { fitWithin, formatBytes, libraryUsage, shuffled, type Photo } from './photosApi'
import { ScreensaverProvider } from './ScreensaverContext'
import { Slideshow } from './Slideshow'
import { clockLayout } from './slideshowLayout'

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

  it('puts the clock beside tall photos (in the black band), and along the bottom of wide ones', () => {
    // The wall tablet: 1280×720.
    expect(clockLayout(3 / 4, 1280, 720)).toEqual({ side: true, band: 1280 - 540 - 24 })
    expect(clockLayout(9 / 16, 1280, 720).side).toBe(true)
    expect(clockLayout(4 / 3, 1280, 720).side).toBe(false)
    expect(clockLayout(16 / 9, 1280, 720).side).toBe(false)
    // A phone held upright has no side band.
    expect(clockLayout(3 / 4, 375, 812).side).toBe(false)
    expect(clockLayout(undefined, 1280, 720).side).toBe(false)

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 })
    const { container } = render(<Slideshow photos={[photo('a')]} seconds={5} shuffle={false} onExit={vi.fn()} />)
    const overlay = () => container.querySelector('.slideshow__overlay')!
    expect(overlay()).not.toHaveClass('slideshow__overlay--side')
    const img = container.querySelector('.slideshow__layer--on img')!
    Object.defineProperty(img, 'naturalWidth', { value: 3000 })
    Object.defineProperty(img, 'naturalHeight', { value: 4000 })
    fireEvent.load(img)
    expect(overlay()).toHaveClass('slideshow__overlay--side')
    expect(container.querySelector('.slideshow__layer--on')).toHaveClass('slideshow__layer--side')
    expect((overlay() as HTMLElement).style.getPropertyValue('--band')).toBe('716px')
  })
})

describe('photo storage', () => {
  it('adds up what the library stores, against the 5 GB free', () => {
    const u = libraryUsage([photo('a', { bytes: 600_000 }), photo('b', { bytes: 400_000 }), photo('c')])
    expect(u).toMatchObject({ bytes: 1_000_000, uncounted: 1 })
    expect(formatBytes(1_000_000)).toBe('977 KB')
    expect(formatBytes(312 * 1024 ** 2)).toBe('312 MB')
    expect(formatBytes(4.6 * 1024 ** 3)).toBe('4.6 GB')
  })
})

describe('PhotoLibrary', () => {
  it('shows thumbnails in the grid and how much storage is used', () => {
    const props = { progress: null, onUpload: vi.fn(), onCaption: vi.fn(), onDelete: vi.fn(), onStart: vi.fn() }
    const { container } = render(<PhotoLibrary photos={[photo('a', { thumbUrl: 'https://img/a_thumb.jpg', bytes: 4.5 * 1024 ** 3 }), photo('b')]} {...props} />)
    expect(container.querySelector('.photos__grid img')).toHaveAttribute('src', 'https://img/a_thumb.jpg')
    expect(screen.getByText(/Photos use 4\.5 GB of the 5 GB of free storage \(1 older photo isn’t counted\)\. Remove some videos/)).toBeInTheDocument()
  })


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
    expect(props.onDelete).toHaveBeenCalledWith([expect.objectContaining({ id: 'a' })])
    expect(screen.queryByRole('dialog', { name: 'Photo details' })).not.toBeInTheDocument()
  })

  it('removes several photos at once in Select mode, after confirming', () => {
    const onDelete = vi.fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PhotoLibrary photos={[photo('a'), photo('b', { caption: 'Beach' }), photo('c', { caption: 'Lake' })]} {...props} onDelete={onDelete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Beach' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lake' }))
    expect(screen.getByRole('button', { name: 'Beach' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(confirm).toHaveBeenCalledWith('Remove these 2 photos for everyone?')
    expect(onDelete).toHaveBeenCalledWith([expect.objectContaining({ id: 'b' }), expect.objectContaining({ id: 'c' })])
    // Back to browsing.
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument()
  })

  it('keeps photos when the removal is cancelled', () => {
    const onDelete = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<PhotoLibrary photos={[photo('a')]} {...props} onDelete={onDelete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Photo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onDelete).not.toHaveBeenCalled()
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
