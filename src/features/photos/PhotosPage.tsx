import { useState } from 'react'
import { deletePhoto, updateCaption, uploadMedia } from './photosApi'
import { PhotoLibrary } from './PhotoLibrary'
import { useScreensaver } from './ScreensaverContext'

export function PhotosPage({ familyId, userId }: { familyId: string; userId: string }) {
  const { photos, startNow } = useScreensaver()
  const [progress, setProgress] = useState<{ done: number; total: number; fraction: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  const upload = async (files: File[]) => {
    const failed: string[] = []
    for (let i = 0; i < files.length; i++) {
      setProgress({ done: i, total: files.length, fraction: 0 })
      try {
        await uploadMedia(familyId, userId, files[i], (fraction) => setProgress({ done: i, total: files.length, fraction }))
      } catch (e) {
        failed.push(`${files[i].name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    setProgress(null)
    if (failed.length) setError(`Couldn't upload ${failed.join('; ')}`)
  }

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      <PhotoLibrary
        photos={photos}
        progress={progress}
        onUpload={(files) => void upload(files)}
        onCaption={(p, caption) => updateCaption(familyId, p.id, caption).catch(report)}
        onDelete={(p) => deletePhoto(familyId, p).catch(report)}
        onStart={startNow}
      />
    </>
  )
}
