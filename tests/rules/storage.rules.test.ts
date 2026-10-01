import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, type Firestore } from 'firebase/firestore'
import { deleteObject, getBytes, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// Storage rules check family membership in Firestore, so both emulators run.
const FAM = 'famA'
const BOB = { uid: 'bob', email: 'bob@example.com' }
const MALLORY = { uid: 'mallory', email: 'mallory@example.com' }

let env: RulesTestEnvironment

const storageFor = (u: { uid: string; email: string }) => env.authenticatedContext(u.uid, { email: u.email, email_verified: true }).storage() as unknown as FirebaseStorage

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-family-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  })
})

afterAll(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.clearStorage()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore
    await setDoc(doc(db, `families/${FAM}/members/${BOB.uid}`), { displayName: 'Bob', email: BOB.email, color: '#123456' })
    await setDoc(doc(db, `families/famB/members/${MALLORY.uid}`), { displayName: 'M', email: MALLORY.email, color: '#123456' })
  })
})

describe('cookbook files in Storage', () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46])

  it('lets members upload EPUB and PDF originals and read them back', async () => {
    const s = storageFor(BOB)
    await assertSucceeds(uploadBytes(ref(s, `families/${FAM}/cookbooks/bk1/original.pdf`), pdf, { contentType: 'application/pdf' }))
    await assertSucceeds(uploadBytes(ref(s, `families/${FAM}/cookbooks/bk2/original.epub`), pdf, { contentType: 'application/epub+zip' }))
    await assertSucceeds(getBytes(ref(s, `families/${FAM}/cookbooks/bk1/original.pdf`)))
  })

  it('accepts only the original book file, of the right type, and no deletes from the app', async () => {
    const s = storageFor(BOB)
    await assertFails(uploadBytes(ref(s, `families/${FAM}/cookbooks/bk1/cover.png`), pdf, { contentType: 'image/png' }))
    await assertFails(uploadBytes(ref(s, `families/${FAM}/cookbooks/bk1/original.pdf`), pdf, { contentType: 'text/html' }))
    await assertFails(uploadBytes(ref(s, `families/${FAM}/cookbooks/bk1/original.exe`), pdf, { contentType: 'application/pdf' }))
    await uploadBytes(ref(s, `families/${FAM}/cookbooks/bk1/original.pdf`), pdf, { contentType: 'application/pdf' })
    await assertFails(deleteObject(ref(s, `families/${FAM}/cookbooks/bk1/original.pdf`)))
  })

  it('keeps other families out', async () => {
    await uploadBytes(ref(storageFor(BOB), `families/${FAM}/cookbooks/bk1/original.pdf`), pdf, { contentType: 'application/pdf' })
    await assertFails(getBytes(ref(storageFor(MALLORY), `families/${FAM}/cookbooks/bk1/original.pdf`)))
    await assertFails(uploadBytes(ref(storageFor(MALLORY), `families/${FAM}/cookbooks/bk3/original.pdf`), pdf, { contentType: 'application/pdf' }))
  })
})

describe('family photos in Storage', () => {
  it('lets family members upload, view, and delete photos and videos', async () => {
    const s = storageFor(BOB)
    await assertSucceeds(uploadBytes(ref(s, `families/${FAM}/photos/p1.jpg`), jpeg, { contentType: 'image/jpeg' }))
    await assertSucceeds(uploadBytes(ref(s, `families/${FAM}/photos/v1.mp4`), jpeg, { contentType: 'video/mp4' }))
    await assertSucceeds(getBytes(ref(s, `families/${FAM}/photos/p1.jpg`)))
    await assertSucceeds(deleteObject(ref(s, `families/${FAM}/photos/p1.jpg`)))
  })

  it('keeps other families and strangers out', async () => {
    await uploadBytes(ref(storageFor(BOB), `families/${FAM}/photos/p1.jpg`), jpeg, { contentType: 'image/jpeg' })
    await assertFails(getBytes(ref(storageFor(MALLORY), `families/${FAM}/photos/p1.jpg`)))
    await assertFails(uploadBytes(ref(storageFor(MALLORY), `families/${FAM}/photos/x.jpg`), jpeg, { contentType: 'image/jpeg' }))
    await assertFails(deleteObject(ref(storageFor(MALLORY), `families/${FAM}/photos/p1.jpg`)))
    const anon = env.unauthenticatedContext().storage() as unknown as FirebaseStorage
    await assertFails(getBytes(ref(anon, `families/${FAM}/photos/p1.jpg`)))
  })

  it('only accepts images and videos, and only under photos/', async () => {
    const s = storageFor(BOB)
    await assertFails(uploadBytes(ref(s, `families/${FAM}/photos/virus.exe`), jpeg, { contentType: 'application/octet-stream' }))
    await assertFails(uploadBytes(ref(s, `families/${FAM}/other/p.jpg`), jpeg, { contentType: 'image/jpeg' }))
    await assertFails(uploadBytes(ref(s, `somewhere/p.jpg`), jpeg, { contentType: 'image/jpeg' }))
  })
})
