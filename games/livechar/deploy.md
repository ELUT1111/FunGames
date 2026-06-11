# 活字灵境 · Linux 服务器部署指南(Nginx)

本游戏是**纯静态站点**(HTML + CSS + JS + 本地 three.min.js),无后端、无数据库、无构建步骤,
部署本质就是:把文件传到服务器 → 用 Nginx 提供静态文件服务。

> 以下命令以 **Ubuntu / Debian** 为主,**CentOS / RockyLinux** 差异处会单独标注。
> 假设服务器 IP 为 `服务器IP`,域名为 `game.example.com`(没有域名也可以用 IP 直接访问)。

---

## 0. 需要部署的文件清单

```
livechar/
├── index.html
├── css/style.css
├── js/*.js          (core/world/player/combat/systems/ui/main 共 7 个)
└── lib/three.min.js
```

`README.md`、`deploy.md` 可传可不传;**不要遗漏 `lib/three.min.js`**,否则页面全黑。

---

## 1. 上传文件到服务器

### 方式 A:scp(Windows 10/11 自带,最简单)

在本机(Windows)PowerShell 或 Git Bash 中执行:

```bash
# 先在服务器上建好目录(root 换成你的用户名)
ssh root@服务器IP "mkdir -p /var/www/livechar"

# 整体上传项目目录内容
scp -r "C:/Users/n/Desktop/vibe/game/livechar/index.html" \
       "C:/Users/n/Desktop/vibe/game/livechar/css" \
       "C:/Users/n/Desktop/vibe/game/livechar/js" \
       "C:/Users/n/Desktop/vibe/game/livechar/lib" \
       root@服务器IP:/var/www/livechar/
```

### 方式 B:rsync(增量同步,改动后重新发布更快;Git Bash 或 WSL 中可用)

```bash
rsync -avz --delete \
  --exclude 'README.md' --exclude 'deploy.md' \
  "/c/Users/n/Desktop/vibe/game/livechar/" \
  root@服务器IP:/var/www/livechar/
```

> 以后每次更新游戏,重复执行这一条即可完成发布。

### 方式 C:打包上传(网络差时更稳)

```bash
# 本机打包
cd "C:/Users/n/Desktop/vibe/game/livechar" && tar czf livechar.tar.gz index.html css js lib
scp livechar.tar.gz root@服务器IP:/tmp/

# 服务器解包
ssh root@服务器IP
mkdir -p /var/www/livechar && tar xzf /tmp/livechar.tar.gz -C /var/www/livechar && rm /tmp/livechar.tar.gz
```

### 上传后设置权限

```bash
# 在服务器上执行
sudo chown -R www-data:www-data /var/www/livechar     # Ubuntu/Debian
# CentOS 为: sudo chown -R nginx:nginx /var/www/livechar
sudo find /var/www/livechar -type d -exec chmod 755 {} \;
sudo find /var/www/livechar -type f -exec chmod 644 {} \;
```

---

## 2. 安装 Nginx

```bash
# Ubuntu / Debian
sudo apt update && sudo apt install -y nginx

# CentOS / RockyLinux
sudo yum install -y nginx        # 或 dnf install -y nginx

# 启动并设为开机自启
sudo systemctl enable --now nginx

# 验证
systemctl status nginx           # 应显示 active (running)
curl -I http://127.0.0.1         # 应返回 200,Nginx 欢迎页
```

---

## 3. 配置 Nginx 站点

新建站点配置文件:

```bash
sudo nano /etc/nginx/conf.d/livechar.conf
```

写入以下内容(**重点:`charset utf-8`,游戏全部为中文文案,缺少它部分环境会乱码**):

```nginx
server {
    listen 80;
    # 有域名填域名;只用 IP 访问就填下划线 _
    server_name game.example.com;

    root  /var/www/livechar;
    index index.html;

    # 中文必需
    charset utf-8;

    # gzip 压缩:three.min.js 约 600KB,压缩后约 150KB,首屏明显加快
    gzip            on;
    gzip_comp_level 6;
    gzip_min_length 1k;
    gzip_types text/css application/javascript text/javascript application/json;
    gzip_vary       on;

    # 静态资源缓存:js/css 缓存 7 天,three.min.js 基本不变可缓存 30 天
    location /lib/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
    location ~* \.(js|css)$ {
        expires 7d;
        add_header Cache-Control "public";
    }

    # 入口页不缓存,保证发版后玩家拿到最新版本
    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    location / {
        try_files $uri $uri/ =404;
    }

    # 基础安全头
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;

    access_log /var/log/nginx/livechar.access.log;
    error_log  /var/log/nginx/livechar.error.log;
}
```

> **注意**:若 `/etc/nginx/sites-enabled/default`(Ubuntu)或 nginx.conf 中默认 server 也监听 80
> 且你用 IP 访问,可能命中默认站点。两种解决方式任选:
> - 删除默认站点:`sudo rm /etc/nginx/sites-enabled/default`
> - 或把本配置中的 `listen 80;` 改为 `listen 80 default_server;`

检验并加载配置:

```bash
sudo nginx -t            # 必须显示 syntax is ok / test is successful
sudo systemctl reload nginx
```

---

## 4. 开放防火墙端口

```bash
# Ubuntu (ufw)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp   # 之后上 HTTPS 用

# CentOS (firewalld)
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

**云服务器(阿里云/腾讯云/AWS 等)还需在控制台的「安全组」中放行 80/443 端口**,这是最常见的"本机 curl 通、外网打不开"的原因。

CentOS 若开启 SELinux 且页面 403:

```bash
sudo chcon -R -t httpd_sys_content_t /var/www/livechar
```

---

## 5. 验证部署

```bash
# 服务器上
curl -I http://127.0.0.1/                 # 200, Content-Type: text/html
curl -I http://127.0.0.1/lib/three.min.js # 200, 约 600KB
curl -I http://127.0.0.1/js/main.js       # 200

# 你的电脑浏览器访问
http://服务器IP/            # 或 http://game.example.com/
```

打开后应看到黑底的「活字灵境」标题界面,点击「落笔启世」即可游玩。

**快速自检**:访问 `http://服务器IP/#test` 并按 F12 打开控制台,
若能看到一系列 `[TEST]` 日志并以 `TEST_DONE` 结束、无红色报错,说明部署完整。

---

## 6. (强烈推荐)配置 HTTPS — Let's Encrypt 免费证书

需要一个解析到服务器 IP 的域名。HTTPS 除了安全外,对本游戏还有实际意义:
浏览器对**指针锁定(鼠标视角)与音频**在安全上下文中的策略最宽松,体验最稳定。

```bash
# Ubuntu / Debian
sudo apt install -y certbot python3-certbot-nginx

# CentOS
sudo yum install -y certbot python3-certbot-nginx

# 自动签发证书并改写 Nginx 配置(按提示选择重定向 HTTP→HTTPS)
sudo certbot --nginx -d game.example.com

# 证书 90 天有效,验证自动续期定时任务正常
sudo certbot renew --dry-run
```

完成后访问 `https://game.example.com/` 即可。

---

## 7. 日常更新发布流程

```bash
# 本机改完代码后,一条命令增量发布(方式 B 的 rsync)
rsync -avz --delete --exclude 'README.md' --exclude 'deploy.md' \
  "/c/Users/n/Desktop/vibe/game/livechar/" root@服务器IP:/var/www/livechar/
```

- `index.html` 配置了 `no-cache`,玩家刷新即得最新版;
- 若大改了 js 仍被旧缓存困扰,最简单的强刷手段是给引用加版本号:
  `<script src="js/main.js?v=2"></script>`。

---

## 8. 常见问题排查

| 现象 | 原因与解决 |
|---|---|
| 外网打不开,服务器内 curl 正常 | 云控制台安全组没放行 80/443;或 ufw/firewalld 未放行 |
| 页面 403 | 文件属主/权限不对(见第 1 节);CentOS 检查 SELinux(见第 4 节) |
| 页面全黑、控制台报 `THREE is not defined` | `lib/three.min.js` 没上传或路径大小写不对(Linux 路径**区分大小写**) |
| 中文乱码 | Nginx 配置缺 `charset utf-8;` |
| 命中了 Nginx 默认欢迎页 | 删除默认站点或加 `default_server`(见第 3 节注意) |
| 鼠标视角无法锁定 | 个别浏览器策略所致,改用 HTTPS 访问(见第 6 节) |
| 没有声音 | 浏览器自动播放策略,属正常 —— 点击「落笔启世」后即有声音 |
| 改了代码刷新无变化 | 浏览器缓存,Ctrl+F5 强刷,或给 js 引用加 `?v=N` |

---

## 附:最小化一键部署脚本(可选)

在服务器上保存为 `deploy.sh` 并 `chmod +x deploy.sh`,以后在**本机**执行
`ssh root@服务器IP 'bash -s' < deploy.sh` 之前,先用第 1 节方式 C 把压缩包传到 `/tmp`:

```bash
#!/usr/bin/env bash
set -euo pipefail
WEB_ROOT=/var/www/livechar

mkdir -p "$WEB_ROOT"
tar xzf /tmp/livechar.tar.gz -C "$WEB_ROOT"
chown -R www-data:www-data "$WEB_ROOT" 2>/dev/null || chown -R nginx:nginx "$WEB_ROOT"
find "$WEB_ROOT" -type d -exec chmod 755 {} \;
find "$WEB_ROOT" -type f -exec chmod 644 {} \;
nginx -t && systemctl reload nginx
echo "部署完成: $(date)"
```
