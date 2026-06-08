# WebNote VPS

一个可部署到 VPS 的轻量网络剪贴板程序。它复刻了 `webnote.cc` 的核心产品形态：无需登录、自定义 URL、文本自动保存、有效期、访问密码、只读分享、文件附件、二维码、举报冻结和基础 API。

## 技术栈

- Node.js 20+
- Express 5
- 文件系统持久化，默认数据目录为 `./data`
- 无前端构建步骤，静态 CSS/JS 由 Express 直接服务

## 本地运行

```bash
npm install
cp .env.example .env
npm start
```

默认访问：

```text
http://localhost:3000
```

## VPS 部署

下面以 Ubuntu 22.04/24.04 为例。部署前先完成两件事：

- 域名 DNS 的 `A` 记录指向 VPS 公网 IP。
- VPS 防火墙放行 `80` 和 `443` 端口。

如果使用 UFW，可以执行：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

推荐使用 Docker Compose，升级和迁移更简单。也可以用 Node.js + PM2 直接运行。

### 方式 A：Docker Compose 推荐

1. 安装基础组件：

```bash
sudo apt update
sudo apt install -y git docker.io docker-compose-plugin nginx certbot python3-certbot-nginx
sudo systemctl enable --now docker nginx
```

2. 拉取项目：

```bash
sudo mkdir -p /opt/webnote-vps
sudo chown "$USER":"$USER" /opt/webnote-vps
git clone https://github.com/jlcbk/webnote-vps.git /opt/webnote-vps
cd /opt/webnote-vps
```

3. 配置环境变量：

```bash
cp .env.example .env
openssl rand -hex 32
```

编辑 `.env`，至少修改这些值：

```bash
APP_BASE_URL=https://your-domain.example
APP_SECRET=把上一步生成的随机字符串填到这里
HOST=0.0.0.0
PORT=3000
TRUST_PROXY=loopback
DATA_DIR=/app/data
MAX_FILE_SIZE_MB=50
```

4. 启动应用：

```bash
mkdir -p data
sudo chown -R 1000:1000 data
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3000/api/health
```

Docker Compose 会把数据挂载到宿主机的 `/opt/webnote-vps/data`，并且只把应用端口绑定到 `127.0.0.1:3000`，由 Nginx 对公网提供访问。迁移或备份时重点保留这个目录和 `.env`。

### 方式 B：Node.js + PM2

1. 安装 Node.js 22、Git、Nginx、Certbot：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt update
sudo apt install -y nodejs git nginx certbot python3-certbot-nginx
sudo npm install -g pm2
```

2. 拉取并配置项目：

```bash
sudo mkdir -p /opt/webnote-vps
sudo chown "$USER":"$USER" /opt/webnote-vps
git clone https://github.com/jlcbk/webnote-vps.git /opt/webnote-vps
cd /opt/webnote-vps
cp .env.example .env
openssl rand -hex 32
```

编辑 `.env`：

```bash
APP_BASE_URL=https://your-domain.example
APP_SECRET=把随机字符串填到这里
HOST=127.0.0.1
PORT=3000
TRUST_PROXY=loopback
DATA_DIR=./data
```

3. 安装依赖并用 PM2 托管：

```bash
npm ci --omit=dev
pm2 start src/server.js --name webnote-vps
pm2 save
pm2 startup
curl http://127.0.0.1:3000/api/health
```

应用启动时会自动读取项目目录下的 `.env`。执行 `pm2 startup` 后，按命令输出里的提示再执行一次生成的 `sudo env ... pm2 startup ...` 命令，才能让服务在 VPS 重启后自动恢复。

### 配置 Nginx 反向代理

把下面内容保存为 `/etc/nginx/sites-available/webnote-vps`，把域名替换成你自己的域名：

```nginx
server {
    listen 80;
    server_name your-domain.example;

    client_max_body_size 60m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用配置并检查：

```bash
sudo ln -s /etc/nginx/sites-available/webnote-vps /etc/nginx/sites-enabled/webnote-vps
sudo nginx -t
sudo systemctl reload nginx
```

### 配置 HTTPS

```bash
sudo certbot --nginx -d your-domain.example
```

证书签发成功后，访问 `https://your-domain.example/api/health`，返回 `{"ok":true,...}` 即表示部署成功。

### 升级

Docker Compose：

```bash
cd /opt/webnote-vps
git pull
docker compose up -d --build
```

Node.js + PM2：

```bash
cd /opt/webnote-vps
git pull
npm ci --omit=dev
pm2 restart webnote-vps
```

### 备份和恢复

数据主要在 `data/`，配置在 `.env`。备份示例：

```bash
cd /opt/webnote-vps
tar -czf "webnote-backup-$(date +%F).tar.gz" .env data
```

恢复时把 `.env` 和 `data/` 放回项目目录，再重启服务。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `APP_BASE_URL` | `http://localhost:3000` | 生成分享链接时的站点地址 |
| `APP_SECRET` | 开发默认值 | 签发临时编辑 token，用于生产时必须修改 |
| `TRUST_PROXY` | 空 | 使用 Nginx/Caddy 反代时建议设为 `loopback` |
| `DATA_DIR` | `./data` | 便签和附件存储目录 |
| `MAX_TEXT_CHARS` | `200000` | 单便签最大字符数 |
| `MAX_FILE_SIZE_MB` | `50` | 单文件最大体积 |
| `MAX_FILES_PER_NOTE` | `10` | 单便签最大附件数 |

## 安全加固

当前版本默认启用 Helmet 安全响应头和严格 CSP，只允许加载本站脚本、样式、图片和 API。API、解锁、上传、举报接口都带有内存限流。便签数据写入采用临时文件加 `rename` 的原子替换方式，降低写入中断造成 JSON 损坏的风险。

## API 示例

创建或更新便签：

```bash
curl -X PUT http://localhost:3000/api/notes/demo \
  -H 'Content-Type: application/json' \
  -d '{"text":"hello","expiresIn":86400}'
```

读取便签：

```bash
curl http://localhost:3000/api/notes/demo
```

设置密码：

```bash
curl -X PUT http://localhost:3000/api/notes/demo \
  -H 'Content-Type: application/json' \
  -d '{"text":"hello","password":"secret"}'
```

解锁：

```bash
curl -X POST http://localhost:3000/api/notes/demo/unlock \
  -H 'Content-Type: application/json' \
  -d '{"password":"secret"}'
```

## 数据说明

数据保存在 `data/notes/` 下，便签名会先哈希为目录名，避免中文或特殊字符直接进入文件路径。删除便签会物理删除对应目录和附件。

这是临时中转工具，不适合作为长期网盘或敏感信息仓库。部署到公网时请务必启用 HTTPS、限制上传大小，并定期备份或清理 `data/`。
