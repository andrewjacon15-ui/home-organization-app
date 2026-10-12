import { useState } from 'react'
import { deletePhoto, updateCaption, uploadAll, uploadMedia, type UploadProgress } from './photosApi'
import { PhotoLibrary } from './PhotoLibrary'
import { useScreensaver } from './ScreensaverContext'

export function PhotosPage({ familyId, userId }: { familyId: string; userId: string }) {
  const { photos, startNow } = useScreensaver()
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  const upload = async (files: File[]) => {
    const failed = await uploadAll(files, (file, onProgress) => uploadMedia(familyId, userId, file, onProgress), setProgress)
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
        onDelete={(list) => void Promise.all(list.map((p) => deletePhoto(familyId, p))).catch(report)}
        onStart={startNow}
      />
    </>
  )
}
