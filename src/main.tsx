import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'
import './index.css'
import App from './App.tsx'

const domain = import.meta.env.VITE_AUTH0_DOMAIN as string
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID as string
const audience = import.meta.env.VITE_AUTH0_AUDIENCE as string

// CrazyGames builds skip Auth0 — wrapping in Auth0Provider would still hit
// their endpoints on mount and break in iframe sandboxes.
const SKIP_AUTH = !!import.meta.env.VITE_GAME && import.meta.env.VITE_GAME !== 'all'

const root = createRoot(document.getElementById('root')!)
root.render(
  <StrictMode>
    {SKIP_AUTH ? (
      <App />
    ) : (
      <Auth0Provider
        domain={domain}
        clientId={clientId}
        authorizationParams={{
          redirect_uri: window.location.origin,
          audience,
        }}
        cacheLocation="localstorage"
      >
        <App />
      </Auth0Provider>
    )}
  </StrictMode>,
)
