import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { handleDriveRedirect } from './core/googleDrive'
import { applyAppearance } from './store/theme'
import { useSettings } from './store/useSettings'
import './styles/app.css'

// Paint the persisted theme before React renders to avoid a flash of night mode.
const initialSettings = useSettings.getState()
applyAppearance(initialSettings.appearance, initialSettings.chordColor)

// Complete a Google Drive sign-in redirect if one is in flight. The callback
// stores the token and the Storage & backups panel reads it on open.
void handleDriveRedirect().catch((error) => {
  console.error('Google Drive sign-in failed', error)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  })
}
