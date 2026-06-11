import { useEffect, useState } from 'react'
import GameCard from '../components/GameCard.jsx'

export default function Home() {
  const [games, setGames] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/games')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(setGames)
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div className="page">
      <header className="hero">
        <h1>
          <span className="logo">🕹️</span> FunGames
        </h1>
        <p className="subtitle">游戏聚合平台 · 点击卡片即刻开玩</p>
      </header>

      <main className="grid-wrap">
        {error && <p className="status error">加载失败:{error}(请确认后端已启动)</p>}
        {!error && games === null && <p className="status">加载中…</p>}
        {games && games.length === 0 && <p className="status">games 目录下还没有游戏</p>}
        {games && games.length > 0 && (
          <div className="grid">
            {games.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
