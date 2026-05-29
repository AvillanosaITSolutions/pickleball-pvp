import { Game } from './game/Game'
import { AuthGate } from './game/AuthGate'
import './App.css'

function App() {
  return (
    <AuthGate>
      <Game />
    </AuthGate>
  )
}

export default App
