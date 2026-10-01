import { useEffect, useState } from 'react'
import { SettingsSection } from '../settings/SettingRows'
import { coverUrl, deleteCookbook, renameCookbook, reparseCookbook, uploadCookbook, watchCookbooks, type Cookbook } from './cookbooksApi'
import { CookbookList } from './CookbookList'

/** Settings → Cookbooks: the library, wired to Firestore, Storage, and the parsing functions. */
export function CookbookSettings({ familyId, userId, onReview }: { familyId: string; userId: string; onReview: () => void }) {
  const [books, setBooks] = useState<Cookbook[]>([])
  const [uploads, setUploads] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  useEffect(() => watchCookbooks(familyId, setBooks), [familyId])

  const upload = async (files: File[]) => {
    for (const file of files) {
      setUploads((u) => ({ ...u, [file.name]: 0 }))
      try {
        await uploadCookbook(familyId, userId, file, (f) => setUploads((u) => ({ ...u, [file.name]: f })))
      } catch (e) {
        report(e)
      } finally {
        setUploads(({ [file.name]: _done, ...rest }) => rest)
      }
    }
  }

  return (
    <SettingsSection title="Cookbooks" id="cookbooks">
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      <CookbookList
        books={books}
        uploads={uploads}
        coverUrl={coverUrl}
        onUpload={(files) => void upload(files)}
        onRename={(b, title) => renameCookbook(familyId, b.id, title).catch(report)}
        onReparse={(b) => reparseCookbook(familyId, b.id).catch(report)}
        onDelete={(b, remove) => deleteCookbook(familyId, b.id, remove).catch(report)}
        onReview={onReview}
      />
    </SettingsSection>
  )
}
