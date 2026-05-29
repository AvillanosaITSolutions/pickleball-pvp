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

  // Provision the DB user row on first authenticated load.
  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    ;(async () => {
      try {
        const token = await getAccessTokenSilently()
        if (cancelled) return
        const apiBase = (import.meta as any).env?.VITE_API_BASE_URL ?? ''
        await fetch(`${apiBase}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch {
        // Non-fatal — the next API call (e.g. checkout) will also provision.
      }
    })()
    return () => { cancelled = true }
  }, [isAuthenticated, getAccessTokenSilently])

  if (isLoading) {
    return <Splash><div style={spinner} /></Splash>
  }

  if (!isAuthenticated) {
    return <LandingPage onLogin={() => loginWithRedirect()} onSignup={() => loginWithRedirect()} />
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

// Hand-built punk-poster landing. Anton (display) + JetBrains Mono (body) from
// Google Fonts. Asymmetric, rotated stickers, ticker tape — intentionally NOT
// a generic vibe-coded SaaS template.

const FONT_LINK = (
  <link
    href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700&family=Archivo+Black&display=swap"
    rel="stylesheet"
  />
)

function LandingPage({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background:
          // Concrete-ish noise via stacked gradients (no image asset needed)
          'repeating-linear-gradient(45deg, rgba(255,255,255,0.012) 0 2px, transparent 2px 6px), ' +
          'radial-gradient(circle at 75% 12%, rgba(220,38,38,0.22), transparent 45%), ' +
          'radial-gradient(circle at 12% 88%, rgba(234,179,8,0.18), transparent 45%), ' +
          '#0c0c0c',
        color: '#f5f1e8',
        overflowY: 'auto',
        fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
      }}
    >
      {FONT_LINK}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes tickerL { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes tickerR { from { transform: translateX(-50%) } to { transform: translateX(0) } }
        @keyframes wiggle { 0%,100% { transform: rotate(var(--r,0deg)) } 50% { transform: rotate(calc(var(--r,0deg) + 1.2deg)) } }
        .display { font-family: "Anton", "Archivo Black", "Impact", sans-serif; letter-spacing: 0.5px; }
      `}</style>

      {/* TOP TICKER */}
      <Ticker
        direction="L"
        items={['SMASH', '·', 'BREAK', '·', 'SHATTER', '·', 'OBLITERATE', '·', 'PULVERIZE', '·', 'RUIN', '·', 'DECIMATE', '·']}
        bg="#dc2626"
        fg="#0c0c0c"
      />

      <div style={{ position: 'relative', maxWidth: 1080, margin: '0 auto', padding: '56px 28px 120px' }}>
        {/* HUGE SCREAMING TITLE */}
        <div style={{ position: 'relative' }}>
          <h1
            className="display"
            style={{
              margin: 0,
              fontSize: 'clamp(72px, 16vw, 220px)',
              lineHeight: 0.85,
              textTransform: 'uppercase',
              color: '#f5f1e8',
              textShadow: '6px 6px 0 #dc2626',
            }}
          >
            Wall<br />of<span style={{ color: '#facc15' }}> Anger</span>
          </h1>

          {/* TAPED STICKER */}
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 0,
              padding: '14px 18px',
              background: '#facc15',
              color: '#0c0c0c',
              transform: 'rotate(8deg)',
              fontFamily: '"Anton", sans-serif',
              fontSize: 22,
              lineHeight: 1,
              textTransform: 'uppercase',
              boxShadow: '0 4px 0 rgba(0,0,0,0.35)',
              border: '3px solid #0c0c0c',
              animation: 'wiggle 3.5s ease-in-out infinite',
              ['--r' as any]: '8deg',
            }}
          >
            5 min<br />FREE.<br />
            <span style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace' }}>no card.</span>
          </div>
        </div>

        {/* SUB-MANIFESTO */}
        <div
          style={{
            marginTop: 28,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            alignItems: 'end',
            gap: 24,
            borderTop: '2px solid #f5f1e8',
            borderBottom: '2px solid #f5f1e8',
            padding: '18px 0',
          }}
        >
          <p style={{ margin: 0, fontSize: 'clamp(14px, 1.4vw, 17px)', lineHeight: 1.5, maxWidth: 640 }}>
            A browser rage room. You throw tomatoes, eggs, bricks, bowling balls,
            a television. You upload a face if you have someone in mind.
            You hand out the room code if you want company. Nothing breaks in real life.
          </p>
          <div
            style={{
              fontFamily: '"Anton", sans-serif',
              fontSize: 14,
              letterSpacing: 2,
              border: '2px solid #facc15',
              color: '#facc15',
              padding: '6px 10px',
              whiteSpace: 'nowrap',
            }}
          >
            ED. 001 · MNL
          </div>
        </div>

        {/* CTA STACK */}
        <div style={{ marginTop: 36, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={onSignup} className="display" style={brickBtn}>
            ► Sign up · throw stuff
          </button>
          <button onClick={onLogin} style={ghostBtn}>
            $ already_a_user --login
          </button>
        </div>

        {/* MANIFESTO STICKERS — overlapping rotated notes, not a card grid */}
        <div style={{ marginTop: 96, position: 'relative', minHeight: 260 }}>
          <Sticker rot={-3} top={0}   left="2%"  bg="#f5f1e8" fg="#0c0c0c" head="EVERYTHING SHATTERS"
            body="Bottles. Vases. Lightbulbs. Picture frames. Even the TV on the wall.
                  Hit something hard enough and it explodes into shards." />
          <Sticker rot={4}  top={40}  left="30%" bg="#dc2626" fg="#f5f1e8" head="BRING THE PISTOL"
            body="Switch to the gun. Real raycast holes appear on whatever you hit.
                  Don't aim it at the wall, aim it at the porcelain plate stack." />
          <Sticker rot={-2} top={100} left="58%" bg="#facc15" fg="#0c0c0c" head="THE FACE GOES HERE"
            body="Upload a photo. The dummy wears it. You decide what happens next.
                  We don't keep the image. It's gone the moment you close the tab." />
          <Sticker rot={6}  top={160} left="10%" bg="#0c0c0c" fg="#facc15" head="WITH FRIENDS"
            body="Make a room. Send the 6-letter code. They show up as a blue capsule
                  with their name on it. You see each other's throws."
            border />
        </div>

        {/* RULES — fake newsprint columns */}
        <div
          style={{
            marginTop: 80,
            border: '2px solid #f5f1e8',
            padding: 24,
            background: 'rgba(245,241,232,0.04)',
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            columnGap: 28,
            rowGap: 14,
          }}
        >
          <SectionTitle>HOW IT WORKS</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 22 }}>
            <Rule n="01" head="LOG IN" body="Google, Facebook, or email. No phone number, no SMS code, no ID upload." />
            <Rule n="02" head="GET 5 MIN" body="The timer starts ticking the moment your mouse locks in the room." />
            <Rule n="03" head="TOP UP" body="From ₱30. PayMongo handles cards, GCash, Maya, GrabPay." />
          </div>
        </div>

        {/* FOOTER LINE */}
        <div
          style={{
            marginTop: 56,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            fontSize: 11,
            opacity: 0.55,
            letterSpacing: 1,
            textTransform: 'uppercase',
            borderTop: '1px dashed rgba(245,241,232,0.3)',
            paddingTop: 18,
            flexWrap: 'wrap',
          }}
        >
          <span>Wasd · mouse · headphones recommended</span>
          <span>Chrome / desktop · webGL required</span>
          <span>Made in Manila · not actually breaking anything</span>
        </div>
      </div>

      {/* BOTTOM TICKER (opposite direction) */}
      <Ticker
        direction="R"
        items={['HOSTED ON A POTATO', '·', 'NO REFUNDS ON SHARDS', '·', 'PHYSICS BY RAPIER', '·', 'AUTH BY AUTH0', '·']}
        bg="#facc15"
        fg="#0c0c0c"
        bottom
      />
    </div>
  )
}

function Ticker({
  items, direction, bg, fg, bottom,
}: { items: string[]; direction: 'L' | 'R'; bg: string; fg: string; bottom?: boolean }) {
  const row = (
    <div style={{ display: 'inline-flex', gap: 24, padding: '10px 12px', whiteSpace: 'nowrap' }}>
      {items.map((it, i) => (
        <span
          key={i}
          className="display"
          style={{ fontSize: 18, letterSpacing: 2, textTransform: 'uppercase' }}
        >
          {it}
        </span>
      ))}
    </div>
  )
  return (
    <div
      style={{
        position: bottom ? 'sticky' : 'static',
        bottom: bottom ? 0 : undefined,
        background: bg,
        color: fg,
        borderTop: bottom ? `3px solid #0c0c0c` : 'none',
        borderBottom: bottom ? 'none' : `3px solid #0c0c0c`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          width: 'max-content',
          animation: `${direction === 'L' ? 'tickerL' : 'tickerR'} 28s linear infinite`,
        }}
      >
        {row}
        {row}
      </div>
    </div>
  )
}

function Sticker({
  rot, top, left, bg, fg, head, body, border,
}: {
  rot: number; top: number; left: string; bg: string; fg: string
  head: string; body: string; border?: boolean
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: `rotate(${rot}deg)`,
        background: bg,
        color: fg,
        padding: '14px 16px',
        maxWidth: 320,
        boxShadow: '0 6px 0 rgba(0,0,0,0.35)',
        border: border ? '3px solid #facc15' : '3px solid #0c0c0c',
      }}
    >
      <div
        className="display"
        style={{ fontSize: 22, lineHeight: 1, marginBottom: 6, textTransform: 'uppercase' }}
      >
        {head}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.45, opacity: 0.92 }}>{body}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="display"
      style={{
        writingMode: 'vertical-rl',
        transform: 'rotate(180deg)',
        fontSize: 38,
        letterSpacing: 4,
        color: '#facc15',
        borderRight: '2px solid #facc15',
        paddingRight: 14,
      }}
    >
      {children}
    </div>
  )
}

function Rule({ n, head, body }: { n: string; head: string; body: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#facc15', letterSpacing: 2, marginBottom: 4 }}>§ {n}</div>
      <div className="display" style={{ fontSize: 22, lineHeight: 1.05, marginBottom: 6, textTransform: 'uppercase' }}>
        {head}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.45, opacity: 0.78 }}>{body}</div>
    </div>
  )
}

const brickBtn: React.CSSProperties = {
  background: '#dc2626',
  color: '#f5f1e8',
  border: '3px solid #0c0c0c',
  padding: '16px 24px',
  fontSize: 22,
  cursor: 'pointer',
  textTransform: 'uppercase',
  boxShadow: '6px 6px 0 #0c0c0c',
  letterSpacing: 1,
  fontFamily: 'inherit',
}
const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  color: '#f5f1e8',
  border: '2px solid #f5f1e8',
  padding: '14px 18px',
  fontSize: 13,
  letterSpacing: 1,
  cursor: 'pointer',
  fontFamily: '"JetBrains Mono", monospace',
}
