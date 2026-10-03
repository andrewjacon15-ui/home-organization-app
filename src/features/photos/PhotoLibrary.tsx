import { Check } from 'lucide-react'
import { useRef, useState } from 'react'
import { ICON_STROKE } from '../../components/Icons'
import { formatBytes, libraryUsage, type Photo } from './photosApi'

interface Props {
  photos: Photo[]
  /** 0..1 while an upload batch is running, null otherwise. */
  progress: { done: number; total: number; fraction: number } | null
  onUpload: (files: File[]) => void
  onCaption: (photo: Photo, caption: string) => void
  /** Removes photos (anyone in the household may remove any photo). */
  onDelete: (photos: Photo[]) => void
  onStart: () => void
}

export function PhotoLibrary({ photos, progress, onUpload, onCaption, onDelete, onStart }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<Photo | null>(null)
  const selected = open && photos.find((p) => p.id === open.id)
  // Select mode: tap photos to pick several, then remove them together.
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const togglePick = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const stopPicking = () => {
    setPicking(false)
    setPicked(new Set())
  }
  const removePicked = () => {
    const chosen = photos.filter((p) => picked.has(p.id))
    if (chosen.length && confirm(`Remove ${chosen.length === 1 ? 'this photo' : `these ${chosen.length} photos`} for everyone?`)) {
      onDelete(chosen)
      stopPicking()
    }
  }

  return (
    <div className="photos">
      <header className="photos__head">
        <h1 className="page-title">Photos</h1>
        {picking ? (
          <div className="row">
            <span className="muted">{picked.size} selected</span>
            <button type="button" className="button" onClick={stopPicking}>
              Cancel
            </button>
            <button type="button" className="button button--danger" disabled={picked.size === 0} onClick={removePicked}>
              Remove
            </button>
          </div>
        ) : (
        <div className="row">
          <button type="button" className="button" disabled={photos.length === 0} onClick={() => setPicking(true)}>
            Select
          </button>
          <button type="button" className="button" disabled={photos.length === 0} onClick={onStart}>
            Start slideshow
          </button>
          <button type="button" className="button button--primary" disabled={!!progress} onClick={() => input.current?.click()}>
            Add photos
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            aria-label="Choose photos or videos"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = ''
              if (files.length) onUpload(files)
            }}
          />
        </div>
        )}
      </header>

      {photos.length > 0 && <StorageLine photos={photos} />}

      {progress && (
        <div className="photos__progress" role="status">
          Uploading {Math.min(progress.done + 1, progress.total)} of {progress.total}…
          <progress max={1} value={(progress.done + progress.fraction) / progress.total} />
        </div>
      )}

      {photos.length === 0 ? (
        <p className="empty">No photos yet. Add some and the wall display shows them as a slideshow when nobody's using it.</p>
      ) : (
        <ul className="photos__grid">
          {photos.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`photos__thumb${picked.has(p.id) ? ' photos__thumb--picked' : ''}`}
                aria-label={p.caption || (p.kind === 'video' ? 'Video' : 'Photo')}
                aria-pressed={picking ? picked.has(p.id) : undefined}
                onClick={() => (picking ? togglePick(p.id) : setOpen(p))}
              >
                {p.kind === 'video' ? <video src={p.url} muted preload="metadata" /> : <img src={p.thumbUrl ?? p.url} alt="" loading="lazy" />}
                {p.kind === 'video' && <span className="photos__badge">Video</span>}
                {picking && <span className="photos__check" aria-hidden>{picked.has(p.id) && <Check size={16} strokeWidth={ICON_STROKE + 0.75} />}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="photos__backdrop" onClick={() => setOpen(null)}>
          <div className="photos__detail" role="dialog" aria-label="Photo details" onClick={(e) => e.stopPropagation()}>
            {selected.kind === 'video' ? <video src={selected.url} controls muted playsInline /> : <img src={selected.url} alt={selected.caption} />}
            <CaptionField key={selected.id} value={selected.caption} onSave={(c) => onCaption(selected, c)} />
            <div className="row photos__actions">
              <button
                type="button"
                className="link photos__delete"
                onClick={() => {
                  if (confirm('Delete this from the family photos?')) {
                    onDelete([selected])
                    setOpen(null)
                  }
                }}
              >
                Delete
              </button>
              <button type="button" className="button" onClick={() => setOpen(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CaptionField({ value, onSave }: { value: string; onSave: (caption: string) => void }) {
  const [draft, setDraft] = useState(value)
  const commit = () => {
    if (draft.trim() !== value) onSave(draft)
  }
  return (
    <label className="photos__caption">
      Caption
      <input
        value={draft}
        maxLength={200}
        placeholder="Beach day, summer 2026"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
    </label>
  )
}

/** How much of the free storage the library uses, with a warning before it runs out. */
function StorageLine({ photos }: { photos: Photo[] }) {
  const u = libraryUsage(photos)
  const near = u.share >= 0.8
  const older = u.uncounted ? ` (${u.uncounted} older ${u.uncounted === 1 ? 'photo isn’t' : 'photos aren’t'} counted)` : ''
  return (
    <p className={`photos__storage${near ? ' photos__storage--near' : ' muted'}`}>
      Photos use {formatBytes(u.bytes)} of the 5 GB of free storage{older}.{near && ' Remove some videos or old photos to stay free.'}
    </p>
  )
}
