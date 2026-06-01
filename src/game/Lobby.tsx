import { useEffect, useState } from 'react'
import { useMultiplayer } from './multiplayer'
import { quickplay, createRoom, joinRoom } from './net'
import { crazyReadInviteParams, onCrazyInviteParams, initCrazyGames, crazyGetUser, onCrazyAuthChange } from './crazygames'

// Game modes — `rage` is the only live mode today. More modes plug in here
// and get a matching `gameServer.define(...)` on the server.
export interface GameMode {
  id: string
  label: string
  blurb: string
  enabled: boolean
}

// Push the current room into the URL so the tab can be shared / bookmarked.
// Uses replaceState so it doesn't pollute browser history with each join.
export function writeInviteUrl(roomCode: string, mode: string) {
  const u = new URL(window.location.href)
  u.searchParams.set('room', roomCode)
  u.searchParams.set('mode', mode)
  window.history.replaceState({}, '', `${u.pathname}?${u.searchParams.toString()}`)
}

export function clearInviteUrl() {
  window.history.replaceState({}, '', window.location.pathname)
}

const ALL_GAME_MODES: GameMode[] = [
  { id: 'rage',   label: 'Wall of Anger', blurb: 'Solo or with friends. Throw everything at the wall.',        enabled: true },
  { id: 'sabong', label: 'Cluck Fighters', blurb: 'Up to 10 chickens in the ring. Peck, dodge, last cluck wins.',  enabled: true },
]

// Single-game builds (CrazyGames submissions) restrict the lobby to one mode.
const BUILD_GAME = (import.meta.env.VITE_GAME as string | undefined) ?? 'all'
export const GAME_MODES: GameMode[] = BUILD_GAME === 'all'
  ? ALL_GAME_MODES
  : ALL_GAME_MODES.filter((m) => m.id === BUILD_GAME)

interface Props {
  onEnter: () => void
}

export function Lobby({ onEnter }: Props) {
  const myName = useMultiplayer((s) => s.myName)
  const setName = useMultiplayer((s) => s.setName)
  const code = useMultiplayer((s) => s.code)
  const [mode, setMode] = useState<string>(() => {
    if (BUILD_GAME !== 'all') return BUILD_GAME
    try { return localStorage.getItem('mpMode') || 'rage' } catch { return 'rage' }
  })
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState<'quick' | 'create' | 'join' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { try { localStorage.setItem('mpMode', mode) } catch {} }, [mode])

  // Pre-fill display name from the CrazyGames-signed-in user (if any). Don't
  // overwrite a name the player already typed/saved — only fill if empty.
  useEffect(() => {
    let cancelled = false
    crazyGetUser().then((u) => {
      if (cancelled || !u?.username) return
      if (!useMultiplayer.getState().myName.trim()) setName(u.username)
    })
    const off = onCrazyAuthChange((u) => {
      if (u?.username && !useMultiplayer.getState().myName.trim()) setName(u.username)
    })
    return () => { cancelled = true; off() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Already connected to a room? Skip the lobby.
  useEffect(() => { if (code) onEnter() }, [code, onEnter])

  // Auto-join from an invite. Two sources are checked, in order:
  //   1. CrazyGames SDK invite params — used when embedded on crazygames.com.
  //      Their static URL doesn't carry query params, so we ask the SDK.
  //   2. URL params (?room=XYZ&mode=sabong) — used outside CG embed.
  // Also subscribes to CG's live invite-params listener so a friend's click
  // mid-session can yank us into their room.
  useEffect(() => {
    if (code) return
    // URL params first (works without the SDK, e.g. local dev).
    const url = new URL(window.location.href)
    const urlRoom = url.searchParams.get('room')
    const urlMode = url.searchParams.get('mode')
    if (urlRoom) { attemptJoin(urlRoom, urlMode); return }

    // Then ask CrazyGames once init resolves — embed-only path.
    let cancelled = false
    initCrazyGames().then(() => {
      if (cancelled || useMultiplayer.getState().code) return
      const cg = crazyReadInviteParams()
      if (cg?.roomCode) attemptJoin(cg.roomCode, cg.mode ?? null)
    })

    // Live updates: a friend clicked invite while we were already in the lobby.
    const off = onCrazyInviteParams((p) => {
      if (!p.roomCode) return
      attemptJoin(p.roomCode, p.mode ?? null)
    })
    return () => { cancelled = true; off() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function attemptJoin(inviteRoom: string, inviteMode: string | null) {
    if (inviteMode) setMode(inviteMode)
    const name = myName.trim() || `Player${Math.floor(Math.random() * 1000)}`
    setBusy('join')
    // Colyseus room IDs are case-sensitive — never uppercase them.
    joinRoom(inviteRoom, name, inviteMode || mode).then((res) => {
      setBusy(null)
      if (res.ok) {
        writeInviteUrl(inviteRoom, inviteMode || mode)
        onEnter()
      } else {
        setErr(res.error || 'Invite link is no longer valid')
        // Clear the bad URL so a refresh starts fresh
        window.history.replaceState({}, '', window.location.pathname)
      }
    })
  }

  async function go(action: 'quick' | 'create' | 'join') {
    if (busy) return
    setBusy(action); setErr(null)
    const name = myName.trim() || `Player${Math.floor(Math.random() * 1000)}`
    let res: { ok: boolean; error?: string; code?: string }
    let resolvedCode: string | undefined
    if (action === 'quick') {
      res = await quickplay(name, mode); resolvedCode = res.code
    } else if (action === 'create') {
      res = await createRoom(name, mode); resolvedCode = res.code
    } else {
      const c = joinCode.trim()
      res = await joinRoom(c, name, mode); resolvedCode = c
    }
    setBusy(null)
    if (!res.ok) { setErr(res.error || 'Could not connect'); return }
    if (resolvedCode) writeInviteUrl(resolvedCode, mode)
    onEnter()
  }

  return (
    <div style={shell}>
      <link href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div style={card}>
        <div className="display" style={title}>PICK YOUR FIGHT</div>
        <div style={sub}>Solo destroys time. Rooms make it personal.</div>

        <label style={label}>Display name</label>
        <input
          value={myName}
          onChange={(e) => setName(e.target.value)}
          placeholder="anonymous_rage"
          style={input}
          maxLength={24}
        />

        {GAME_MODES.length > 1 && <label style={{ ...label, marginTop: 16 }}>Game mode</label>}
        <div style={{ ...modeGrid, display: GAME_MODES.length > 1 ? modeGrid.display : 'none' }}>
          {GAME_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => m.enabled && setMode(m.id)}
              disabled={!m.enabled}
              style={{
                ...modeBtn,
                borderColor: mode === m.id ? '#facc15' : 'rgba(255,255,255,0.15)',
                opacity: m.enabled ? 1 : 0.4,
                cursor: m.enabled ? 'pointer' : 'not-allowed',
              }}
            >
              <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 18, letterSpacing: 1 }}>
                {m.label}{!m.enabled && ' · soon'}
              </div>
              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>{m.blurb}</div>
            </button>
          ))}
        </div>

        <div style={ctaRow}>
          <button onClick={() => go('quick')} disabled={!!busy} style={primaryBtn}>
            {busy === 'quick' ? 'Finding room…' : '⚡ Quickplay'}
          </button>
          <button onClick={() => go('create')} disabled={!!busy} style={ghostBtn}>
            {busy === 'create' ? 'Creating…' : '+ Create private room'}
          </button>
        </div>

        <div style={joinRow}>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="ROOM CODE"
            maxLength={12}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            style={{ ...input, letterSpacing: 2, flex: 1 }}
          />
          <button onClick={() => go('join')} disabled={!!busy || !joinCode.trim()} style={ghostBtn}>
            {busy === 'join' ? 'Joining…' : 'Join'}
          </button>
        </div>

        <div style={skipRow}>
          <button onClick={onEnter} style={skipBtn} title="Practice offline — no multiplayer">
            Skip · practice solo →
          </button>
        </div>

        {err && <div style={errBox}>{err}</div>}

        <MobileNotice />
      </div>
    </div>
  )
}

// Mobile browsers can't request pointer lock, so the 3D gameplay won't work.
// The lobby itself (joining/creating rooms, sharing invite links) does work,
// so we surface a clear note rather than hiding the page entirely.
function MobileNotice() {
  const isTouch = typeof window !== 'undefined' &&
    (('ontouchstart' in window) || (navigator.maxTouchPoints ?? 0) > 0) &&
    !window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
  if (!isTouch) return null
  return (
    <div style={mobileNote}>
      📱 Cluck Fighters supports touch — on-screen joystick + tap to peck.
      Wall of Anger still needs a mouse + keyboard, so play that one on desktop.
    </div>
  )
}

const mobileNote: React.CSSProperties = {
  marginTop: 14, padding: '10px 12px', fontSize: 12,
  background: 'rgba(234,179,8,0.12)', border: '1px solid #facc15',
  color: '#fef3c7', lineHeight: 1.45,
}

const shell: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 50,
  background:
    'radial-gradient(circle at 30% 20%, rgba(220,38,38,0.25), transparent 50%), ' +
    'radial-gradient(circle at 80% 80%, rgba(234,179,8,0.18), transparent 50%), ' +
    '#0c0c0c',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#f5f1e8',
  fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
  padding: 24,
  overflowY: 'auto',
}
const card: React.CSSProperties = {
  width: '100%', maxWidth: 560,
  background: 'rgba(12,12,12,0.85)',
  border: '2px solid #f5f1e8',
  boxShadow: '8px 8px 0 rgba(220,38,38,0.8)',
  padding: 28,
}
const title: React.CSSProperties = {
  fontFamily: 'Anton, sans-serif', fontSize: 48, lineHeight: 0.9,
  letterSpacing: 1, marginBottom: 6, textShadow: '3px 3px 0 #dc2626',
}
const sub: React.CSSProperties = { opacity: 0.7, fontSize: 13, marginBottom: 22 }
const label: React.CSSProperties = { fontSize: 11, opacity: 0.7, letterSpacing: 2, textTransform: 'uppercase' }
const input: React.CSSProperties = {
  marginTop: 6, width: '100%', padding: '10px 12px',
  background: 'rgba(255,255,255,0.05)', color: '#f5f1e8',
  border: '2px solid rgba(255,255,255,0.15)', outline: 'none',
  fontFamily: 'inherit', fontSize: 14,
}
const modeGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 8, marginTop: 6,
}
const modeBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', color: '#f5f1e8',
  border: '2px solid', padding: '12px 12px', textAlign: 'left',
  fontFamily: 'inherit',
}
const ctaRow: React.CSSProperties = { marginTop: 22, display: 'flex', gap: 10, flexWrap: 'wrap' }
const primaryBtn: React.CSSProperties = {
  flex: '1 1 200px', padding: '14px 18px',
  background: '#dc2626', color: '#f5f1e8',
  border: '2px solid #0c0c0c', boxShadow: '4px 4px 0 #0c0c0c',
  fontFamily: 'Anton, sans-serif', letterSpacing: 1, fontSize: 18,
  cursor: 'pointer', textTransform: 'uppercase',
}
const ghostBtn: React.CSSProperties = {
  padding: '12px 14px',
  background: 'transparent', color: '#f5f1e8',
  border: '2px solid #f5f1e8', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 13, letterSpacing: 1,
}
const joinRow: React.CSSProperties = { marginTop: 12, display: 'flex', gap: 8 }
const skipRow: React.CSSProperties = { marginTop: 16, textAlign: 'right' }
const skipBtn: React.CSSProperties = {
  background: 'transparent', color: 'rgba(245,241,232,0.55)',
  border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
}
const errBox: React.CSSProperties = {
  marginTop: 14, padding: '8px 12px', fontSize: 12,
  background: 'rgba(220,38,38,0.18)', border: '1px solid #dc2626', color: '#fecaca',
}
