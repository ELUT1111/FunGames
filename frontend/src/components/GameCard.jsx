import { Link } from 'react-router-dom'

export default function GameCard({ game }) {
  return (
    <Link to={`/play/${game.id}`} className="card" style={{ '--theme': game.theme }}>
      <div className="card-cover">
        {game.cover ? (
          <img src={game.cover} alt={game.name} loading="lazy" />
        ) : (
          <span className="card-icon">{game.icon}</span>
        )}
      </div>
      <div className="card-body">
        <h2 className="card-name">{game.name}</h2>
        {game.description && <p className="card-desc">{game.description}</p>}
        {game.tags?.length > 0 && (
          <div className="card-tags">
            {game.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <span className="card-play">▶ 开始游戏</span>
    </Link>
  )
}
