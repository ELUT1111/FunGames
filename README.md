# FunGames · 游戏聚合平台

FastAPI + React + Vite 构建的游戏聚合平台:游戏卡片一览,点击即玩。
新增游戏只需把文件夹放进 `games/`,**无需改任何代码、无需重启服务**。

## 项目结构

```
FunGame/
├── backend/              # FastAPI 后端
│   ├── app/
│   │   ├── main.py       # 入口:API + 静态托管
│   │   └── games.py      # games/ 目录扫描器
│   └── requirements.txt
├── frontend/             # React + Vite 前端
│   └── src/
│       ├── pages/        # Home(卡片网格)/ Play(iframe 播放页)
│       └── components/   # GameCard
├── games/                # 游戏目录(每个子文件夹一个游戏)
│   ├── light/            # 棱镜光鱼
│   ├── livechar/         # 活字灵境
│   └── sand/             # 沙漏行者
├── nginx.conf.template   # nginx 配置模板
└── deploy.md             # Linux 部署指南
```

## 本地开发

```bash
# 1. 后端(终端一)
python -m venv .venv
.venv/Scripts/pip install -r backend/requirements.txt     # Windows
# .venv/bin/pip install -r backend/requirements.txt       # Linux/macOS
.venv/Scripts/python -m uvicorn backend.app.main:app --port 8000 --reload

# 2. 前端(终端二)
cd frontend
npm install
npm run dev        # http://localhost:5173(/api 与 /games 自动代理到 8000)
```

## 生产模式(单进程)

```bash
cd frontend && npm run build && cd ..
.venv/Scripts/python -m uvicorn backend.app.main:app --port 8000
# 打开 http://127.0.0.1:8000 —— FastAPI 同时托管前端产物、游戏与 API
```

正式服务器部署(nginx + systemd)见 [deploy.md](deploy.md)。

## 添加新游戏

1. 把游戏文件夹(根部含 `index.html`)放入 `games/`;
2. (可选)在游戏文件夹内添加 `game.json` 自定义卡片信息:

```json
{
  "name": "游戏名称",
  "description": "一句话介绍",
  "tags": ["3D", "解谜"],
  "icon": "🎮",
  "theme": "#5b9dff",
  "cover": "cover.png",
  "order": 4
}
```

所有字段均可省略:名称会自动取 `index.html` 的 `<title>`。
后端每次请求实时扫描目录,刷新页面即可看到新游戏。

## API

| 接口 | 说明 |
| --- | --- |
| `GET /api/games` | 游戏列表 |
| `GET /api/games/{id}` | 单个游戏详情 |
| `GET /api/health` | 健康检查 |
| `GET /games/{id}/` | 游戏静态文件入口 |
