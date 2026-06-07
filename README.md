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

1. 安装 Node.js 20 或更高版本。
2. 上传本目录到服务器，例如 `/opt/webnote-vps`。
3. 配置 `.env`，至少修改：

```bash
APP_BASE_URL=https://你的域名
APP_SECRET=一段足够长的随机字符串
PORT=3000
HOST=127.0.0.1
```

4. 安装依赖并启动：

```bash
npm install --omit=dev
npm start
```

推荐用 `pm2` 托管：

```bash
npm install -g pm2
pm2 start src/server.js --name webnote-vps
pm2 save
```

5. 用 Nginx 反向代理到本服务：

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

生产环境建议再用 Certbot 配置 HTTPS。

## Docker 部署

也可以直接用 Docker Compose：

```bash
cp .env.example .env
docker compose up -d --build
```

默认会把数据挂载到宿主机的 `./data` 目录。

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
