import { useState } from 'react'
import { Game } from './game/Game'
import { SabongGame } from './game/SabongGame'
import { AuthGate } from './game/AuthGate'
import { Lobby, clearInviteUrl } from './game/Lobby'
import { useMultiplayer } from './game/multiplayer'
import './App.css'

function App() {
  const [inGame, setInGame] = useState(false)
  const mode = useMultiplayer((s) => s.mode)
  const exit = () => { setInGame(false); clearInviteUrl() }
  return (
    <AuthGate>
      {inGame
        ? (mode === 'sabong' ? <SabongGame onExit={exit} /> : <Game />)
        : <Lobby onEnter={() => setInGame(true)} />}
    </AuthGate>
  )
}

export default App
