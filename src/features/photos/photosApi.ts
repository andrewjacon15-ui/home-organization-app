import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'
import { db, storage } from '../../firebase'

export interface Photo {
  id: string
  storagePath: string
  url: string
  kind: 'image' | 'video'
  width?: number
  height?: number
  /** A small copy for the grid (photos uploaded since thumbnails were added). */
  thumbPath?: string
  thumbUrl?: string
  /** Stored size of the file and its thumbnail, for the storage readout. */
  bytes?: number
  caption: string
  uploadedBy: string
  createdAt?: Date
}

const photosCol = (familyId: string) => collection(db, 'families', familyId, 'photos')
/** Photos never change once uploaded, so browsers keep them for a year (no repeat downloads). */
const CACHE = 'public, max-age=31536000'

/** Longest side for uploaded photos: sharp on the wall tablet, a fraction of a phone photo's size. */
export const MAX_EDGE = 2560
/** Longest side for the grid's thumbnails: sharp in a 160 px tile on any screen, about 40 KB. */
export const THUMB_EDGE = 480
/** Cloud Storage keeps 5 GB at no cost. */
export const FREE_STORAGE_BYTES = 5 * 1024 ** 3

export function watchPhotos(familyId: string, onChange: (photos: Photo[]) => void) {
  return onSnapshot(photosCol(familyId), (snap) => {
    const list = snap.docs
      .map((d) => {
        const x = d.data()
        return {
          id: d.id,
          storagePath: x.storagePath,
          url: x.url ?? '',
          kind: x.kind === 'video' ? 'video' : 'image',
          width: x.width,
          height: x.height,
          thumbPath: typeof x.thumbPath === 'string' ? x.thumbPath : undefined,
          thumbUrl: typeof x.thumbUrl === 'string' ? x.thumbUrl : undefined,
          bytes: typeof x.bytes === 'number' ? x.bytes : undefined,
          caption: x.caption ?? '',
          uploadedBy: x.uploadedBy,
          createdAt: x.createdAt?.toDate?.(),
        } as Photo
      })
      .filter((p) => p.url)
    list.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    onChange(list)
  })
}

/** Fits width x height inside a box of `max` on the longest side, never enlarging. */
export function fitWithin(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** Photos uploading at once: the network work overlaps, while decoding stays one at a time. */
export const UPLOADS_AT_ONCE = 2

let decoding: Promise<unknown> = Promise.resolve()

/**
 * Runs `work` after any earlier work has finished, so only one big photo is open in memory at a
 * time. Phones close the page when several are (iOS above all: a 48 MP photo is about 190 MB decoded).
 */
export function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const run = decoding.then(work, work)
  decoding = run.catch(() => undefined)
  return run
}

function drawn(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  return canvas
}

function jpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process that photo.'))), 'image/jpeg', quality))
}

/**
 * Downscales a photo to JPEG in the browser (respecting phone camera rotation), and makes its grid
 * thumbnail from the downscaled copy, so the original is decoded once.
 */
async function prepareImage(file: Blob): Promise<{ blob: Blob; width: number; height: number; thumb: Blob | null }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE)
  const canvas = drawn(bitmap, width, height)
  bitmap.close()
  const t = fitWithin(width, height, THUMB_EDGE)
  const small = drawn(canvas, t.width, t.height)
  try {
    const [blob, thumb] = await Promise.all([jpeg(canvas, 0.86), jpeg(small, 0.8).catch(() => null)])
    return { blob, width, height, thumb }
  } finally {
    // iOS caps the memory all canvases may use; give it back now rather than whenever they're collected.
    for (const c of [canvas, small]) c.width = c.height = 0
  }
}

/** Uploads one file to Storage and resolves with its download URL. */
async function put(path: string, body: Blob, contentType: string, onProgress?: (fraction: number) => void): Promise<string> {
  const task = uploadBytesResumable(ref(storage, path), body, { contentType, cacheControl: CACHE })
  await new Promise<void>((resolve, reject) => {
    task.on('state_changed', (s) => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0), reject, () => resolve())
  })
  return getDownloadURL(task.snapshot.ref)
}

/** Uploads one photo or video and records it. `onProgress` gets 0..1. */
export async function uploadMedia(familyId: string, userId: string, file: File, onProgress?: (fraction: number) => void): Promise<void> {
  const isVideo = file.type.startsWith('video/')
  if (!isVideo && !file.type.startsWith('image/')) throw new Error(`${file.name} isn't a photo or video.`)
  const id = doc(photosCol(familyId)).id

  let body: Blob = file
  let contentType = file.type
  let ext = (file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')).toLowerCase()
  let size: { width?: number; height?: number } = {}
  let thumbBlob: Blob | null = null
  if (!isVideo) {
    try {
      const small = await oneAtATime(() => prepareImage(file))
      body = small.blob
      contentType = 'image/jpeg'
      ext = 'jpg'
      size = { width: small.width, height: small.height }
      thumbBlob = small.thumb
    } catch {
      // Formats the browser can't decode (e.g. HEIC outside Safari) upload as-is, without a thumbnail.
    }
  }

  // The photo and its small copy for the grid go up together. Without a thumbnail, the grid
  // falls back to the full photo.
  const storagePath = `families/${familyId}/photos/${id}.${ext}`
  const thumbPath = `families/${familyId}/photos/${id}_thumb.jpg`
  const [url, thumbUrl] = await Promise.all([
    put(storagePath, body, contentType, onProgress),
    thumbBlob ? put(thumbPath, thumbBlob, 'image/jpeg').catch(() => null) : Promise.resolve(null),
  ])
  await setDoc(doc(photosCol(familyId), id), {
    storagePath,
    url,
    kind: isVideo ? 'video' : 'image',
    ...size,
    ...(thumbUrl ? { thumbPath, thumbUrl } : {}),
    bytes: body.size + (thumbUrl && thumbBlob ? thumbBlob.size : 0),
    caption: '',
    uploadedBy: userId,
    createdAt: serverTimestamp(),
  })
}

export interface UploadProgress {
  /** Files finished (uploaded or failed). */
  done: number
  total: number
  /** How far along the files still uploading are, added up (0..UPLOADS_AT_ONCE). */
  fraction: number
}

/**
 * Uploads a batch `atOnce` files at a time, reporting progress as it goes. Resolves with a
 * line for each file that failed, in the order they were chosen.
 */
export async function uploadAll(
  files: File[],
  uploadOne: (file: File, onProgress: (fraction: number) => void) => Promise<void>,
  onProgress: (p: UploadProgress) => void,
  atOnce = UPLOADS_AT_ONCE,
): Promise<string[]> {
  const failed: { i: number; text: string }[] = []
  const going = new Map<number, number>()
  let done = 0
  let next = 0
  const report = () => onProgress({ done, total: files.length, fraction: [...going.values()].reduce((a, b) => a + b, 0) })
  const worker = async () => {
    while (next < files.length) {
      const i = next++
      going.set(i, 0)
      report()
      try {
        await uploadOne(files[i], (fraction) => {
          going.set(i, fraction)
          report()
        })
      } catch (e) {
        failed.push({ i, text: `${files[i].name}: ${e instanceof Error ? e.message : String(e)}` })
      }
      going.delete(i)
      done++
      report()
    }
  }
  await Promise.all(Array.from({ length: Math.min(atOnce, files.length) }, worker))
  return failed.sort((a, b) => a.i - b.i).map((x) => x.text)
}

export function updateCaption(familyId: string, photoId: string, caption: string) {
  return updateDoc(doc(photosCol(familyId), photoId), { caption: caption.trim().slice(0, 200) })
}

export async function deletePhoto(familyId: string, photo: Photo) {
  for (const path of [photo.storagePath, photo.thumbPath].filter((p): p is string => !!p)) {
    await deleteObject(ref(storage, path)).catch((e: { code?: string }) => {
      if (e?.code !== 'storage/object-not-found') throw e
    })
  }
  await deleteDoc(doc(photosCol(familyId), photo.id))
}

/** Fisher–Yates shuffle (returns a new array). `random` is injectable for tests. */
export function shuffled<T>(items: T[], random = Math.random): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** "312 MB": a size in friendly units. */
export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

/** How much of the free storage the photo library uses (photos from before sizes were kept aren't counted). */
export function libraryUsage(photos: Photo[]): { bytes: number; uncounted: number; share: number } {
  const bytes = photos.reduce((n, p) => n + (p.bytes ?? 0), 0)
  return { bytes, uncounted: photos.filter((p) => p.bytes == null).length, share: bytes / FREE_STORAGE_BYTES }
}
