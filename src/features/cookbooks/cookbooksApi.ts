import { collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'
import { db, functions, storage } from '../../firebase'

export type CookbookStatus = 'uploading' | 'queued' | 'parsing' | 'done' | 'error'

export interface Cookbook {
  id: string
  title: string
  author: string | null
  format: 'epub' | 'pdf'
  status: CookbookStatus
  progress: { done: number; total: number; unit: 'chapters' | 'pages' } | null
  ocr: boolean
  recipeCount: number
  reviewCount: number
  error: string | null
  coverPath: string | null
  createdAt: number
}

/** Same limit as storage.rules and firestore.rules. */
export const MAX_COOKBOOK_BYTES = 300 * 1024 * 1024

const booksCol = (familyId: string) => collection(db, 'families', familyId, 'cookbooks')

export function watchCookbooks(familyId: string, onChange: (books: Cookbook[]) => void) {
  return onSnapshot(booksCol(familyId), (snap) => {
    const list = snap.docs.map((d) => {
      const x = d.data()
      return {
        id: d.id,
        title: x.title ?? 'Untitled',
        author: x.author ?? null,
        format: x.format === 'epub' ? 'epub' : 'pdf',
        status: x.status ?? 'queued',
        progress: x.progress ?? null,
        ocr: !!x.ocr,
        recipeCount: x.recipeCount ?? 0,
        reviewCount: x.reviewCount ?? 0,
        error: x.error ?? null,
        coverPath: x.coverPath ?? null,
        createdAt: x.createdAt?.toMillis?.() ?? Date.now(),
      } satisfies Cookbook
    })
    list.sort((a, b) => b.createdAt - a.createdAt)
    onChange(list)
  })
}

/** "salt-fat-acid-heat.pdf" → format and a starting title (the parser may fill in the author). */
export function describeFile(name: string): { format: 'epub' | 'pdf'; title: string } | null {
  const m = /^(.*)\.(epub|pdf)$/i.exec(name.trim())
  if (!m) return null
  const title = m[1].replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled cookbook'
  return { format: m[2].toLowerCase() as 'epub' | 'pdf', title: title.slice(0, 200) }
}

/** Uploads the original, records it, and starts parsing. `onProgress` gets 0–1. */
export async function uploadCookbook(familyId: string, userId: string, file: File, onProgress?: (fraction: number) => void): Promise<string> {
  const info = describeFile(file.name)
  if (!info) throw new Error(`${file.name} isn't an EPUB or PDF.`)
  if (file.size > MAX_COOKBOOK_BYTES) throw new Error(`${file.name} is over 300 MB.`)
  const bookRef = doc(booksCol(familyId))
  const storagePath = `families/${familyId}/cookbooks/${bookRef.id}/original.${info.format}`
  await setDoc(bookRef, { title: info.title, format: info.format, storagePath, sizeBytes: file.size, status: 'uploading', createdBy: userId, createdAt: serverTimestamp() })
  const task = uploadBytesResumable(ref(storage, storagePath), file, { contentType: info.format === 'pdf' ? 'application/pdf' : 'application/epub+zip' })
  await new Promise<void>((resolve, reject) => {
    task.on('state_changed', (s) => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0), reject, () => resolve())
  })
  await reparseCookbook(familyId, bookRef.id)
  return bookRef.id
}

export function renameCookbook(familyId: string, bookId: string, title: string) {
  return updateDoc(doc(booksCol(familyId), bookId), { title: title.trim().slice(0, 200) })
}

export function reparseCookbook(familyId: string, bookId: string) {
  return httpsCallable(functions, 'cookbookParse')({ familyId, bookId })
}

export function deleteCookbook(familyId: string, bookId: string, removeRecipes: boolean) {
  return httpsCallable<unknown, { removedRecipes: number }>(functions, 'cookbookDelete')({ familyId, bookId, removeRecipes })
}

export function coverUrl(path: string) {
  return getDownloadURL(ref(storage, path))
}
