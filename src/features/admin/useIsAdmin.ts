import { useEffect, useState } from 'react'
import { adminApi, type AdminApi } from './householdInvites'

/** Whether the signed-in person is the app's administrator (false until known). */
export function useIsAdmin(api: Pick<AdminApi, 'isAdmin'> = adminApi): boolean {
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    let live = true
    void api.isAdmin().then((yes) => live && setAdmin(yes))
    return () => {
      live = false
    }
  }, [api])
  return admin
}
