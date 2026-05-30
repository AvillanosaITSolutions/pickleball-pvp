import { useEffect, useState } from 'react'
import { useMultiplayer } from './multiplayer'
import { quickplay, createRoom, joinRoom } from './net'

// Game modes — `rage` is the only live mode today. More modes plug in here
// and get a matching `gameServer.define(...)` on the server.
export interface GameMode {
  id: string
  label: string
  blurb: string
  enabled: boolean
}

export const GAME_MODES: GameMode[] = [
  { id: 'rage',   label: 'Wall of Anger', blurb: 'Solo or with friends. Throw everything at the wall.',        enabled: true },
  { id: 'sabong', label: 'Sabong',        blurb: '1v1 — rooster vs rooster. Peck the other bird out.',         enabled: true },
]

interface Props {
  onEnter: () => void
}

export function Lobby({ onEnter }: Props) {
  const myName = useMultiplayer((s) => s.myName)
  const setName = useMultiplayer((s) => s.setName)
  const code = useMultiplayer((s) => s.code)
  const [mode, setMode] = useState<string>(() => {
    try { return localStorage.getItem('mpMode') || 'rage' } catch { return 'rage' }
  })
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState<'quick' | 'create' | 'join' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { try { localStorage.setItem('mpMode', mode) } catch {} }, [mode])

  // Already connected to a room? Skip the lobby.
  useEffect(() => { if (code) onEnter() }, [code, onEnter])

  async function go(action: 'quick' | 'create' | 'join') {
    if (busy) return
    setBusy(action); setErr(null)
    const name = myName.trim() || `Player${Math.floor(Math.random() * 1000)}`
    let res: { ok: boolean; error?: string }
    if (action === 'quick') res = await quickplay(name, mode)
    else if (action === 'create') res = await createRoom(name, mode)
    else res = await joinRoom(joinCode.trim().toUpperCase(), name, mode)
    setBusy(null)
    if (!res.ok) { setErr(res.error || 'Could not connect'); return }
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

        <label style={{ ...label, marginTop: 16 }}>Game mode</label>
        <div style={modeGrid}>
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
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            maxLength={12}
            style={{ ...input, textTransform: 'uppercase', letterSpacing: 2, flex: 1 }}
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
      </div>
    </div>
  )
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
