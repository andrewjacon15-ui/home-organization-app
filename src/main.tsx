import '@fontsource-variable/inter'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { takeInviteFromUrl } from './features/admin/householdInvites'

// A household invite link (/?household=CODE) is remembered through Google sign-in.
takeInviteFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
