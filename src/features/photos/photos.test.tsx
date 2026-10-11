import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StaticSettings } from '../settings/SettingsContext'
import { PhotoLibrary } from './PhotoLibrary'
import { fitWithin, formatBytes, libraryUsage, shuffled, type Photo } from './photosApi'
import { ScreensaverProvider, useScreensaver } from './ScreensaverContext'
import { Slideshow } from './Slideshow'

let library: Photo[] = []
let watching = 0
vi.mock('./photosApi', async (importActual) => ({
  ...(await importActual<typeof import('./photosApi')>()),
  watchPhotos: (_familyId: string, onChange: (p: Photo[]) => void) => {
    watching++
    onChange(library)
    return () => {
      watching--
    }
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

  it('keeps the clock in one place and drifts each photo a different way for its whole time on screen', () => {
    const { container } = render(<Slideshow photos={[photo('a', { width: 3000, height: 4000 }), photo('b', { width: 4000, height: 3000 })]} seconds={10} shuffle={false} onExit={vi.fn()} />)
    const overlay = container.querySelector('.slideshow__overlay')!
    const drift = () => [...container.querySelector('.slideshow__layer--on img')!.classList].find((c) => /--(in|out)-/.test(c))
    expect(overlay.className).toBe('slideshow__overlay')
    // 10 seconds on screen plus the fade in and out.
    expect((container.querySelector('.slideshow') as HTMLElement).style.getPropertyValue('--drift-ms')).toBe('13200ms')
    const first = drift()
    act(() => vi.advanceTimersByTime(10_000))
    expect(container.querySelector('.slideshow__overlay')).toBe(overlay)
    expect(overlay.className).toBe('slideshow__overlay')
    expect(drift()).not.toBe(first)
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

  it('tells iPhone and iPad users to tap ✓ once and wait while the picker gets photos ready', () => {
    const { rerender } = render(<PhotoLibrary photos={[]} {...props} platform="ios" />)
    expect(screen.getByText(/After you tap ✓, the picker stays open/)).toBeInTheDocument()
    rerender(<PhotoLibrary photos={[]} {...props} platform="ios" progress={{ done: 0, total: 40, fraction: 0 }} />)
    expect(screen.queryByText(/After you tap ✓/)).not.toBeInTheDocument()
    rerender(<PhotoLibrary photos={[]} {...props} platform="android" />)
    expect(screen.queryByText(/After you tap ✓/)).not.toBeInTheDocument()
  })

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

  it('reads the photo library on a phone only while a photo screen is open', () => {
    library = [photo('a')]
    function PhotoScreen() {
      const { photos } = useScreensaver()
      return <p>{photos.length} photos</p>
    }
    const { rerender } = render(
      <StaticSettings>
        <ScreensaverProvider familyId="f" kiosk={false}>
          <p>app</p>
        </ScreensaverProvider>
      </StaticSettings>,
    )
    expect(watching).toBe(0)
    rerender(
      <StaticSettings>
        <ScreensaverProvider familyId="f" kiosk={false}>
          <PhotoScreen />
        </ScreensaverProvider>
      </StaticSettings>,
    )
    expect(screen.getByText('1 photos')).toBeInTheDocument()
    expect(watching).toBe(1)
    rerender(
      <StaticSettings>
        <ScreensaverProvider familyId="f" kiosk={false}>
          <p>app</p>
        </ScreensaverProvider>
      </StaticSettings>,
    )
    expect(watching).toBe(0)
  })
})
