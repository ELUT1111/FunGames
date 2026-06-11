@echo off
rem 棱镜光鱼 PRISM LUMEN - 一键启动
rem ES 模块不能从 file:// 加载，需要本地 HTTP 服务器
cd /d "%~dp0"
start "PrismLumen Server" cmd /c "npx -y http-server -p 8642 -s"
timeout /t 2 >nul
start "" http://127.0.0.1:8642
echo 游戏已在浏览器打开（http://127.0.0.1:8642）
echo 关闭弹出的服务器窗口即可停止。
