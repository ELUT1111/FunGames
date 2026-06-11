import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

export default function Play() {
  const { id } = useParams()
  const [game, setGame] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`/api/games/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? '游戏不存在' : `HTTP ${res.status}`)
        return res.json()
      })
      .then(setGame)
      .catch((err) => setError(err.message))
  }, [id])

  useEffect(() => {
    if (game) document.title = `${game.name} · FunGames`
    return () => {
      document.title = 'FunGames · 游戏聚合平台'
    }
  }, [game])

  const enterFullscreen = () => {
    document.getElementById('game-frame')?.requestFullscreen?.()
  }

  if (error) {
    return (
      <div className="page play-page">
        <p className="status error">{error}</p>
        <Link to="/" className="btn">
          ← 返回首页
        </Link>
      </div>
    )
  }

  return (
    <div className="play-page">
      <div className="play-bar">
        <Link to="/" className="btn">
          ← 返回
        </Link>
        <span className="play-title">
          {game ? `${game.icon} ${game.name}` : '加载中…'}
        </span>
        <div className="play-actions">
          <button className="btn" onClick={enterFullscreen}>
            ⛶ 全屏
          </button>
          <a className="btn" href={`/games/${id}/`} target="_blank" rel="noreferrer">
            ↗ 新标签页
          </a>
        </div>
      </div>
      <iframe
        id="game-frame"
        className="game-frame"
        src={`/games/${id}/`}
        title={game?.name ?? id}
        allow="fullscreen; gamepad; autoplay"
      />
    </div>
  )
}
