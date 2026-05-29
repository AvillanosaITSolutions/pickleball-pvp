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
    return <Splash><div style={spinner} /></Splash>
  }

  if (!isAuthenticated) {
    return <LandingPage onLogin={() => loginWithRedirect()} onSignup={() => loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })} />
  }

  return (
    <>
      {/* Tiny floating logout chip */}
      <div
        style={{
          position: 'fixed',
          bottom: 12,
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

const spinner: React.CSSProperties = {
  width: 36,
  height: 36,
  border: '3px solid rgba(255,255,255,0.15)',
  borderTopColor: '#f97316',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
}

function LandingPage({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background:
          'radial-gradient(circle at 20% 20%, rgba(249,115,22,0.18), transparent 55%), ' +
          'radial-gradient(circle at 80% 80%, rgba(59,130,246,0.18), transparent 55%), ' +
          'linear-gradient(180deg, #0a0a0f 0%, #18181b 100%)',
        color: '#fafafa',
        overflowY: 'auto',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }
        @keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }`}</style>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '64px 24px 96px' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div
            style={{
              display: 'inline-block',
              padding: '4px 12px',
              borderRadius: 999,
              background: 'rgba(249,115,22,0.15)',
              border: '1px solid rgba(249,115,22,0.4)',
              color: '#fdba74',
              fontSize: 12,
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: 18,
            }}
          >
            5 minutes free on us
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 'clamp(40px, 7vw, 72px)',
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -1,
              background: 'linear-gradient(180deg, #fafafa 0%, #fb923c 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Wall of Anger
          </h1>
          <p
            style={{
              marginTop: 16,
              fontSize: 'clamp(16px, 2vw, 20px)',
              opacity: 0.8,
              maxWidth: 560,
              marginLeft: 'auto',
              marginRight: 'auto',
              lineHeight: 1.5,
            }}
          >
            A virtual rage room. Throw tomatoes, eggs, bricks and TVs at the wall.
            Smash bottles and vases. Upload a face. Invite a friend and break things together.
          </p>

          <div
            style={{
              marginTop: 28,
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button onClick={onSignup} style={primaryBtn}>
              Start free — 5 minutes
            </button>
            <button onClick={onLogin} style={secondaryBtn}>
              I already have an account
            </button>
          </div>
          <p style={{ marginTop: 12, fontSize: 12, opacity: 0.5 }}>
            No card required for the trial. Top up with PayMongo when you run out.
          </p>
        </div>

        {/* Features */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 56,
          }}
        >
          <Feature emoji="🍅" title="Throw anything"
            body="Tomatoes, eggs, bananas, bricks, bowling balls — even a chair." />
          <Feature emoji="📸" title="Upload a face"
            body="Pin a photo on the dummy. Your call who deserves it." />
          <Feature emoji="🔫" title="Pull out a pistol"
            body="Switch to the gun for actual ranged carnage with real holes in props." />
          <Feature emoji="👥" title="Bring a friend"
            body="Share a 6-letter room code. See each other's avatars in real time." />
        </div>

        {/* How it works */}
        <div
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: 24,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 18,
          }}
        >
          <Step n="1" title="Sign in" body="One click via Google, Facebook, or email." />
          <Step n="2" title="Get 5 min free" body="Walk in, look around, start swinging." />
          <Step n="3" title="Top up if you like" body="Plans from ₱30. PayMongo handles checkout." />
        </div>

        <p style={{ textAlign: 'center', marginTop: 40, opacity: 0.4, fontSize: 12 }}>
          Headphones recommended. Use WASD + mouse. Best in Chrome on desktop.
        </p>
      </div>
    </div>
  )
}

function Feature({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: 18,
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 8, animation: 'float 4s ease-in-out infinite' }}>{emoji}</div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ opacity: 0.65, fontSize: 14, lineHeight: 1.45 }}>{body}</div>
    </div>
  )
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: '#f97316',
          color: '#0a0a0f',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 10,
        }}
      >
        {n}
      </div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ opacity: 0.65, fontSize: 14, lineHeight: 1.45 }}>{body}</div>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  background: 'linear-gradient(180deg, #f97316 0%, #ea580c 100%)',
  color: '#fff',
  border: 'none',
  padding: '14px 28px',
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxShadow: '0 8px 24px rgba(249,115,22,0.35)',
  transition: 'transform 0.1s',
}
const secondaryBtn: React.CSSProperties = {
  background: 'transparent',
  color: '#fafafa',
  border: '1px solid rgba(255,255,255,0.25)',
  padding: '14px 24px',
  borderRadius: 8,
  fontSize: 16,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
