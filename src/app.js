import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import multer from 'multer';
import QRCode from 'qrcode';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, expiresOptions } from './config.js';
import {
  HttpError,
  addFile,
  assertNotFrozen,
  cleanupExpiredNotes,
  findNoteByShareId,
  getFilePath,
  loadNote,
  normalizeName,
  randomNoteName,
  removeFile,
  removeNote,
  reportNote,
  splitNameAndPassword,
  tempUploadDir,
  toPublicNote,
  upsertNote
} from './storage.js';
import { passwordFingerprint, signToken, verifyPassword, verifyToken } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');

const upload = multer({
  dest: tempUploadDir(),
  limits: { fileSize: config.maxFileSizeBytes }
});

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getBearerToken(req) {
  const header = req.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7);
  return req.query.token || '';
}

function hasEditToken(req, note) {
  if (!note?.passwordHash) return true;
  const payload = verifyToken(getBearerToken(req));
  return payload?.name === note.name && payload?.purpose === 'edit' && payload?.fingerprint === passwordFingerprint(note.passwordHash);
}

function hasReadAccess(req, note) {
  if (!note?.passwordHash) return true;
  if (req.query.share && req.query.share === note.shareId) return true;
  return hasEditToken(req, note);
}

function requireEdit(req, note) {
  if (!hasEditToken(req, note)) throw new HttpError(401, '需要输入访问密码');
  assertNotFrozen(note);
}

function parseNoteBody(req) {
  return {
    text: String(req.body?.text ?? ''),
    expiresIn: Number.parseInt(req.body?.expiresIn, 10),
    password: req.body?.password,
    rotateShare: Boolean(req.body?.rotateShare)
  };
}

function pageShell({ title, description, boot = {}, appMode = 'note' }) {
  const bootJson = JSON.stringify({
    baseUrl: config.baseUrl,
    maxTextChars: config.maxTextChars,
    maxFileSizeBytes: config.maxFileSizeBytes,
    expiresOptions,
    ...boot
  }).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body data-mode="${escapeHtml(appMode)}">
  <div id="page"></div>
  <script type="application/json" id="boot">${bootJson}</script>
  <script src="/app.js" defer></script>
</body>
</html>`;
}

export function createApp() {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(publicDir, { maxAge: '1h' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: 'webnote-vps', time: new Date().toISOString() });
  });

  app.get('/api/notes/:name', async (req, res, next) => {
    try {
      const { name } = splitNameAndPassword(req.params.name);
      const note = await loadNote(name, { touch: true });
      if (!note) return res.json(toPublicNote(null, { includeText: true }));
      assertNotFrozen(note);
      if (!hasReadAccess(req, note)) {
        return res.status(401).json(toPublicNote(note, { includeText: false }));
      }
      res.json(toPublicNote(note, { includeText: true, readonly: Boolean(req.query.share) }));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/shares/:shareId', async (req, res, next) => {
    try {
      const note = await findNoteByShareId(req.params.shareId);
      if (!note) throw new HttpError(404, '分享链接不存在或已过期');
      assertNotFrozen(note);
      res.json(toPublicNote(note, { includeText: true, readonly: true }));
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/notes/:name', async (req, res, next) => {
    try {
      const { name } = splitNameAndPassword(req.params.name);
      const existing = await loadNote(name);
      if (existing) requireEdit(req, existing);
      const note = await upsertNote(name, parseNoteBody(req));
      res.json(toPublicNote(note));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/notes/:name/unlock', async (req, res, next) => {
    try {
      const { name } = splitNameAndPassword(req.params.name);
      const note = await loadNote(name, { touch: true });
      if (!note) throw new HttpError(404, '便签不存在');
      assertNotFrozen(note);
      if (!note.passwordHash) return res.json({ token: '', note: toPublicNote(note) });
      if (!verifyPassword(String(req.body?.password || ''), note.passwordHash)) {
        throw new HttpError(401, '密码不正确');
      }
      const token = signToken({
        name: note.name,
        purpose: 'edit',
        fingerprint: passwordFingerprint(note.passwordHash)
      });
      res.json({ token, note: toPublicNote(note) });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/notes/:name', async (req, res, next) => {
    try {
      const { name } = splitNameAndPassword(req.params.name);
      const note = await loadNote(name);
      if (note) requireEdit(req, note);
      await removeNote(name);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/notes/:name/files', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) throw new HttpError(400, '请选择要上传的文件');
      const { name } = splitNameAndPassword(req.params.name);
      const existing = await loadNote(name);
      if (existing) requireEdit(req, existing);
      const file = await addFile(name, req.file);
      res.status(201).json({ file });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/notes/:name/files/:fileId/download', async (req, res, next) => {
    try {
      const { name } = splitNameAndPassword(req.params.name);
      const { note, file, fullPath } = await getFilePath(name, req.params.fileId);
      assertNotFrozen(note);
      if (!hasReadAccess(req, note)) throw new HttpError(401, '需要输入访问密码');
      res.download(fullPath, file.originalName);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/notes/:name/files/:fileId', async (req, res, next) => {
    try {
      const { name } = splitNameAndPassword(req.params.name);
      const note = await loadNote(name);
      if (!note) throw new HttpError(404, '便签不存在');
      requireEdit(req, note);
      await removeFile(name, req.params.fileId);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/notes/:name/report', async (req, res, next) => {
    try {
      const { name } = splitNameAndPassword(req.params.name);
      res.json(await reportNote(name));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/qrcode', async (req, res, next) => {
    try {
      const text = String(req.query.text || '');
      if (!text || text.length > 500) throw new HttpError(400, '二维码内容无效');
      const svg = await QRCode.toString(text, { type: 'svg', margin: 1, width: 220 });
      res.type('image/svg+xml').send(svg);
    } catch (error) {
      next(error);
    }
  });

  app.get(['/new', '/new/'], (_req, res) => {
    res.redirect(`/${randomNoteName()}`);
  });

  app.get('/p/:shareId', (req, res) => {
    res.send(pageShell({
      title: '只读分享 - 云便签',
      description: '只读查看临时分享的云便签内容。',
      boot: { shareId: req.params.shareId, readonly: true },
      appMode: 'note'
    }));
  });

  app.get('/faqs.html', (_req, res) => {
    res.send(pageShell({
      title: '常见问答 - 云便签',
      description: '云便签的使用说明、有效期、密码和数据删除规则。',
      appMode: 'faq'
    }));
  });

  app.get('/api.html', (_req, res) => {
    res.send(pageShell({
      title: '开发者 API - 云便签',
      description: '云便签提供文本读写、文件上传、密码解锁和二维码生成接口。',
      appMode: 'api-docs'
    }));
  });

  app.get('/about.html', (_req, res) => {
    res.send(pageShell({
      title: '关于云便签',
      description: '云便签是一个无需登录的临时文本和文件中转工具。',
      appMode: 'about'
    }));
  });

  app.get('/privacy-policy.html', (_req, res) => {
    res.send(pageShell({
      title: '隐私政策 - 云便签',
      description: '云便签隐私与数据处理说明。',
      appMode: 'privacy'
    }));
  });

  app.get('/terms-of-service.html', (_req, res) => {
    res.send(pageShell({
      title: '服务条款 - 云便签',
      description: '云便签服务条款和合规使用说明。',
      appMode: 'terms'
    }));
  });

  app.get('/', (_req, res) => {
    res.send(pageShell({
      title: '云便签 - 网络剪贴板',
      description: '无需登录的在线剪贴板，用于临时文本保存、跨设备同步和文件中转。',
      appMode: 'home'
    }));
  });

  app.get('/:rawName', (req, res, next) => {
    try {
      const { name, autoPassword } = splitNameAndPassword(req.params.rawName);
      normalizeName(name);
      res.send(pageShell({
        title: `${name} - 云便签`,
        description: '在线云便签详情页。',
        boot: { name, autoPassword },
        appMode: 'note'
      }));
    } catch (error) {
      next(error);
    }
  });

  app.use((req, _res, next) => {
    next(new HttpError(404, `未找到路径：${req.path}`));
  });

  app.use((error, _req, res, _next) => {
    const status = error.status || (error instanceof multer.MulterError ? 400 : 500);
    const message = status >= 500 ? '服务器内部错误' : error.message;
    res.status(status).json({ error: message });
  });

  cleanupExpiredNotes().catch((error) => {
    console.error('cleanup failed', error);
  });
  setInterval(() => cleanupExpiredNotes().catch((error) => console.error('cleanup failed', error)), 60 * 60 * 1000).unref();

  return app;
}
