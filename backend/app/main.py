"""FunGames 游戏聚合平台 - FastAPI 后端入口。

职责:
1. /api/games        游戏列表接口(实时扫描 games/ 目录)
2. /games/{id}/...   静态托管所有游戏文件
3. /                 生产模式下托管前端构建产物 frontend/dist(若存在)

开发模式下前端由 Vite 独立运行(端口 5173)并代理 /api 与 /games 到本服务。
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .games import scan_games

BASE_DIR = Path(__file__).resolve().parent.parent.parent
GAMES_DIR = BASE_DIR / "games"
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"

app = FastAPI(title="FunGames", version="1.0.0")

# 开发期允许 Vite dev server 跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/games")
def list_games() -> list[dict]:
    """游戏列表。每次请求实时扫描,新增游戏无需重启服务。"""
    return scan_games(GAMES_DIR)


@app.get("/api/games/{game_id}")
def get_game(game_id: str) -> dict:
    for game in scan_games(GAMES_DIR):
        if game["id"] == game_id:
            return game
    raise HTTPException(status_code=404, detail="game not found")


# 静态托管游戏文件(html=True 使 /games/xxx/ 自动返回 index.html)
app.mount("/games", StaticFiles(directory=GAMES_DIR, html=True), name="games")

# 生产模式:托管前端构建产物;SPA 路由回退到 index.html
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str) -> FileResponse:
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
