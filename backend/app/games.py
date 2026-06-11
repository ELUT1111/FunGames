"""游戏目录扫描器。

约定:games/ 下每个包含 index.html 的子目录即为一个游戏。
可选地在游戏目录放置 game.json 来自定义元数据:

{
  "name": "游戏名称",
  "description": "一句话介绍",
  "tags": ["3D", "解谜"],
  "icon": "🎮",
  "theme": "#7fb6e8",
  "cover": "cover.png",   // 相对游戏目录的封面图路径(可选)
  "order": 1              // 排序权重,越小越靠前(可选)
}

没有 game.json 时,会自动从 index.html 的 <title> 提取名称。
新增游戏只需把文件夹丢进 games/ 即可,无需改任何代码。
"""

import json
import re
from pathlib import Path
from typing import Any

_TITLE_RE = re.compile(r"<title>(.*?)</title>", re.IGNORECASE | re.DOTALL)


def _read_title(index_html: Path) -> str | None:
    try:
        text = index_html.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None
    match = _TITLE_RE.search(text)
    return match.group(1).strip() if match else None


def scan_games(games_dir: Path) -> list[dict[str, Any]]:
    """扫描 games_dir,返回游戏元数据列表(按 order、名称排序)。"""
    games: list[dict[str, Any]] = []
    if not games_dir.is_dir():
        return games

    for entry in sorted(games_dir.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        index_html = entry / "index.html"
        if not index_html.is_file():
            continue

        meta: dict[str, Any] = {}
        manifest = entry / "game.json"
        if manifest.is_file():
            try:
                meta = json.loads(manifest.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                meta = {}

        game_id = entry.name
        cover = meta.get("cover")
        games.append(
            {
                "id": game_id,
                "name": meta.get("name") or _read_title(index_html) or game_id,
                "description": meta.get("description", ""),
                "tags": meta.get("tags", []),
                "icon": meta.get("icon", "🎮"),
                "theme": meta.get("theme", "#7fb6e8"),
                "cover": f"/games/{game_id}/{cover}" if cover else None,
                "url": f"/games/{game_id}/",
                "order": meta.get("order", 1000),
            }
        )

    games.sort(key=lambda g: (g["order"], g["name"]))
    return games
