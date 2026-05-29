import { useEffect } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { bindGetAccessToken } from './auth'

interface Props {
  children: React.ReactNode
}

export function AuthGate({ children }: Props) {
  const {
    isLoading,
    isAuthenticated,
    loginWithRedirect,
    logout,
    user,
    getAccessTokenSilently,
  } = useAuth0()

  // Make the token getter available to non-React code (net.ts, fetches).
  useEffect(() => {
    bindGetAccessToken(async () => {
      if (!isAuthenticated) return null
      try {
        return await getAccessTokenSilently()
      } catch {
        return null
      }
    })
  }, [isAuthenticated, getAccessTokenSilently])

  if (isLoading) {
    return <Splash>Loading…</Splash>
  }

  if (!isAuthenticated) {
    return (
      <Splash>
        <h1 style={{ margin: 0, fontSize: 32 }}>Wall of Anger</h1>
        <p style={{ opacity: 0.75, marginTop: 8 }}>
          You need to sign in to throw, shoot, and join rooms.
        </p>
        <button
          onClick={() => loginWithRedirect()}
          style={btn}
        >
          Sign in to continue
        </button>
      </Splash>
    )
  }

  return (
    <>
      {/* Tiny floating logout chip */}
      <div
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 60,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(0,0,0,0.55)',
          border: '1px solid rgba(255,255,255,0.15)',
          padding: '4px 8px',
          borderRadius: 6,
          color: '#fafafa',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 12,
        }}
      >
        <span style={{ opacity: 0.8 }}>
          {user?.email ?? user?.name ?? 'Signed in'}
        </span>
        <button
          onClick={() =>
            logout({ logoutParams: { returnTo: window.location.origin } })
          }
          style={{
            background: 'transparent',
            color: '#fca5a5',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 4,
            padding: '2px 8px',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Sign out
        </button>
      </div>
      {children}
    </>
  )
}

function Splash({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(circle at 50% 35%, #1f2937, #0a0a0f)',
        color: '#fafafa',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {children}
    </div>
  )
}

const btn: React.CSSProperties = {
  marginTop: 18,
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  padding: '12px 24px',
  borderRadius: 6,
  fontSize: 15,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
