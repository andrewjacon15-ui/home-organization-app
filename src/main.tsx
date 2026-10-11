import '@fontsource-variable/inter'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { takeInviteFromUrl } from './features/admin/householdInvites'
import { reloadForNewBuild } from './lib/staleBuild'

// A household invite link (/?household=CODE) is remembered through Google sign-in.
takeInviteFromUrl()

// A page open during a deploy asks for files the new release replaced: reload into the new one.
window.addEventListener('vite:preloadError', (e) => {
  if (reloadForNewBuild()) e.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
