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

/** Downscales a photo to JPEG in the browser (respecting phone camera rotation). */
async function shrinkImage(file: Blob, max = MAX_EDGE, quality = 0.86): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const { width, height } = fitWithin(bitmap.width, bitmap.height, max)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process that photo.'))), 'image/jpeg', quality))
  return { blob, width, height }
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
  if (!isVideo) {
    try {
      const small = await shrinkImage(file)
      body = small.blob
      contentType = 'image/jpeg'
      ext = 'jpg'
      size = { width: small.width, height: small.height }
    } catch {
      // Formats the browser can't decode (e.g. HEIC outside Safari) upload as-is.
    }
  }

  const storagePath = `families/${familyId}/photos/${id}.${ext}`
  const task = uploadBytesResumable(ref(storage, storagePath), body, { contentType, cacheControl: CACHE })
  await new Promise<void>((resolve, reject) => {
    task.on('state_changed', (s) => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0), reject, () => resolve())
  })
  const url = await getDownloadURL(task.snapshot.ref)

  // A small thumbnail for the grid, so browsing the library doesn't download every full photo.
  let thumb: { thumbPath: string; thumbUrl: string } | Record<string, never> = {}
  let bytes = body.size
  if (!isVideo && contentType === 'image/jpeg') {
    try {
      const small = await shrinkImage(body, THUMB_EDGE, 0.8)
      const thumbPath = `families/${familyId}/photos/${id}_thumb.jpg`
      const t = await uploadBytesResumable(ref(storage, thumbPath), small.blob, { contentType: 'image/jpeg', cacheControl: CACHE })
      thumb = { thumbPath, thumbUrl: await getDownloadURL(t.ref) }
      bytes += small.blob.size
    } catch {
      // The grid falls back to the full photo.
    }
  }
  await setDoc(doc(photosCol(familyId), id), {
    storagePath,
    url,
    kind: isVideo ? 'video' : 'image',
    ...size,
    ...thumb,
    bytes,
    caption: '',
    uploadedBy: userId,
    createdAt: serverTimestamp(),
  })
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
