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
  caption: string
  uploadedBy: string
  createdAt?: Date
}

const photosCol = (familyId: string) => collection(db, 'families', familyId, 'photos')

/** Longest side for uploaded photos: sharp on the wall tablet, a fraction of a phone photo's size. */
export const MAX_EDGE = 2560

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
async function shrinkImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const { width, height } = fitWithin(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process that photo.'))), 'image/jpeg', 0.86))
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
  const task = uploadBytesResumable(ref(storage, storagePath), body, { contentType, cacheControl: 'public, max-age=31536000' })
  await new Promise<void>((resolve, reject) => {
    task.on('state_changed', (s) => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0), reject, () => resolve())
  })
  const url = await getDownloadURL(task.snapshot.ref)
  await setDoc(doc(photosCol(familyId), id), {
    storagePath,
    url,
    kind: isVideo ? 'video' : 'image',
    ...size,
    caption: '',
    uploadedBy: userId,
    createdAt: serverTimestamp(),
  })
}

export function updateCaption(familyId: string, photoId: string, caption: string) {
  return updateDoc(doc(photosCol(familyId), photoId), { caption: caption.trim().slice(0, 200) })
}

export async function deletePhoto(familyId: string, photo: Photo) {
  await deleteObject(ref(storage, photo.storagePath)).catch((e: { code?: string }) => {
    if (e?.code !== 'storage/object-not-found') throw e
  })
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
