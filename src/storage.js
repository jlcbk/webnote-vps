import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, expiresOptions, reservedNames } from './config.js';
import { hashPassword, passwordFingerprint, randomId } from './auth.js';

const notesDir = path.join(config.dataDir, 'notes');
const tmpDir = path.join(config.dataDir, 'tmp');

const now = () => new Date().toISOString();
const nowMs = () => Date.now();

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function normalizeName(name) {
  const value = String(name || '').trim();
  if (!value) throw new HttpError(400, '便签名称不能为空');
  if (value.length > 80) throw new HttpError(400, '便签名称不能超过 80 个字符');
  if (value.includes('/') || value.includes('\\')) throw new HttpError(400, '便签名称不能包含斜杠');
  if (value.startsWith('.') || reservedNames.has(value.toLowerCase())) throw new HttpError(400, '该便签名称不可用');
  return value;
}

export function splitNameAndPassword(rawName) {
  const value = String(rawName || '');
  const at = value.indexOf('@');
  if (at === -1) return { name: normalizeName(value), autoPassword: '' };
  return {
    name: normalizeName(value.slice(0, at)),
    autoPassword: value.slice(at + 1)
  };
}

export function randomNoteName() {
  return randomId(12).replaceAll('_', '').replaceAll('-', '').slice(0, 12);
}

function noteHash(name) {
  return crypto.createHash('sha256').update(name).digest('hex');
}

function noteDir(name) {
  return path.join(notesDir, noteHash(name));
}

function noteFile(name) {
  return path.join(noteDir(name), 'note.json');
}

function safeFileName(name) {
  const fallback = 'file';
  const cleaned = path.basename(String(name || fallback)).replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(0, 120);
  return cleaned || fallback;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirs() {
  await fs.mkdir(notesDir, { recursive: true });
  await fs.mkdir(tmpDir, { recursive: true });
}

function expiresAtFrom(expiresIn, from = nowMs()) {
  const allowed = expiresOptions.some((option) => option.value === expiresIn) ? expiresIn : config.defaultExpiresIn;
  return new Date(from + allowed * 1000).toISOString();
}

function isExpired(note) {
  return note?.expiresAt && new Date(note.expiresAt).getTime() <= nowMs();
}

function isFrozen(note) {
  return note?.frozenUntil && new Date(note.frozenUntil).getTime() > nowMs();
}

function createEmptyNote(name) {
  const createdAt = now();
  return {
    name,
    text: '',
    passwordHash: null,
    expiresIn: config.defaultExpiresIn,
    expiresAt: expiresAtFrom(config.defaultExpiresIn),
    shareId: randomId(12),
    files: [],
    reports: 0,
    frozenUntil: null,
    createdAt,
    updatedAt: createdAt,
    lastAccessedAt: createdAt
  };
}

async function saveNote(note) {
  await ensureDirs();
  const dir = noteDir(note.name);
  const target = noteFile(note.name);
  const temp = path.join(dir, `.note-${process.pid}-${Date.now()}-${randomId(4)}.tmp`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(temp, `${JSON.stringify(note, null, 2)}\n`, 'utf8');
  await fs.rename(temp, target);
  return note;
}

async function deleteNoteDir(name) {
  await fs.rm(noteDir(name), { recursive: true, force: true });
}

async function readNoteFromDisk(name) {
  const filePath = noteFile(name);
  if (!(await exists(filePath))) return null;
  try {
    const note = JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (note.name !== name) return null;
    return note;
  } catch {
    throw new HttpError(500, '便签数据损坏，无法读取');
  }
}

export async function loadNote(name, { touch = false, allowExpired = false } = {}) {
  const normalized = normalizeName(name);
  const note = await readNoteFromDisk(normalized);
  if (!note) return null;

  if (!allowExpired && isExpired(note)) {
    await deleteNoteDir(normalized);
    return null;
  }

  if (touch) {
    note.lastAccessedAt = now();
    note.expiresAt = expiresAtFrom(note.expiresIn);
    await saveNote(note);
  }

  return note;
}

export async function getOrCreateNote(name) {
  const normalized = normalizeName(name);
  return (await loadNote(normalized)) || createEmptyNote(normalized);
}

export async function upsertNote(name, input = {}) {
  const note = await getOrCreateNote(name);
  const text = String(input.text ?? '');
  if (text.length > config.maxTextChars) throw new HttpError(413, `文本不能超过 ${config.maxTextChars} 个字符`);

  note.text = text;
  if (Number.isFinite(input.expiresIn)) note.expiresIn = input.expiresIn;
  if (input.password !== undefined) {
    const password = String(input.password || '');
    note.passwordHash = password ? hashPassword(password) : null;
  }
  if (input.rotateShare) note.shareId = randomId(12);

  note.updatedAt = now();
  note.lastAccessedAt = note.updatedAt;
  note.expiresAt = expiresAtFrom(note.expiresIn);
  return saveNote(note);
}

export async function removeNote(name) {
  const normalized = normalizeName(name);
  await deleteNoteDir(normalized);
}

export async function addFile(name, uploadedFile) {
  const note = await getOrCreateNote(name);
  if (note.files.length >= config.maxFilesPerNote) {
    await fs.rm(uploadedFile.path, { force: true });
    throw new HttpError(400, `每个便签最多上传 ${config.maxFilesPerNote} 个文件`);
  }

  const id = randomId(12);
  const originalName = safeFileName(uploadedFile.originalname);
  const storedName = `${id}-${originalName}`;
  const target = path.join(noteDir(note.name), storedName);

  await fs.mkdir(noteDir(note.name), { recursive: true });
  await fs.rename(uploadedFile.path, target);

  note.files.push({
    id,
    originalName,
    storedName,
    size: uploadedFile.size,
    type: uploadedFile.mimetype || 'application/octet-stream',
    uploadedAt: now()
  });
  note.updatedAt = now();
  note.lastAccessedAt = note.updatedAt;
  note.expiresAt = expiresAtFrom(note.expiresIn);
  await saveNote(note);
  return note.files.at(-1);
}

export async function removeFile(name, fileId) {
  const note = await loadNote(name);
  if (!note) throw new HttpError(404, '便签不存在');
  const file = note.files.find((item) => item.id === fileId);
  if (!file) throw new HttpError(404, '文件不存在');
  await fs.rm(path.join(noteDir(note.name), file.storedName), { force: true });
  note.files = note.files.filter((item) => item.id !== fileId);
  note.updatedAt = now();
  await saveNote(note);
}

export async function getFilePath(name, fileId) {
  const note = await loadNote(name, { touch: true });
  if (!note) throw new HttpError(404, '便签不存在');
  const file = note.files.find((item) => item.id === fileId);
  if (!file) throw new HttpError(404, '文件不存在');
  const fullPath = path.join(noteDir(note.name), file.storedName);
  if (!fssync.existsSync(fullPath)) throw new HttpError(404, '文件不存在');
  return { note, file, fullPath };
}

export async function reportNote(name) {
  const note = await loadNote(name);
  if (!note) throw new HttpError(404, '便签不存在');
  note.reports = (note.reports || 0) + 1;

  if (note.reports >= 4) {
    await removeNote(name);
    return { deleted: true, reports: note.reports };
  }

  const freezeDurations = [30 * 60, 6 * 60 * 60, 24 * 60 * 60];
  note.frozenUntil = new Date(nowMs() + freezeDurations[note.reports - 1] * 1000).toISOString();
  await saveNote(note);
  return { deleted: false, reports: note.reports, frozenUntil: note.frozenUntil };
}

export async function cleanupExpiredNotes() {
  await ensureDirs();
  const dirs = await fs.readdir(notesDir, { withFileTypes: true });
  let removed = 0;
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const filePath = path.join(notesDir, dir.name, 'note.json');
    try {
      const note = JSON.parse(await fs.readFile(filePath, 'utf8'));
      if (isExpired(note)) {
        await fs.rm(path.join(notesDir, dir.name), { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      continue;
    }
  }
  return removed;
}

export async function findNoteByShareId(shareId) {
  if (!shareId || typeof shareId !== 'string' || shareId.length > 80) return null;
  await ensureDirs();
  const dirs = await fs.readdir(notesDir, { withFileTypes: true });
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const filePath = path.join(notesDir, dir.name, 'note.json');
    try {
      const note = JSON.parse(await fs.readFile(filePath, 'utf8'));
      if (isExpired(note)) {
        await fs.rm(path.join(notesDir, dir.name), { recursive: true, force: true });
        continue;
      }
      if (note.shareId === shareId) {
        note.lastAccessedAt = now();
        note.expiresAt = expiresAtFrom(note.expiresIn);
        await saveNote(note);
        return note;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function toPublicNote(note, { includeText = true, readonly = false } = {}) {
  const locked = Boolean(note?.passwordHash);
  return {
    exists: Boolean(note),
    name: note?.name,
    text: includeText ? note?.text || '' : '',
    locked,
    readonly,
    frozen: Boolean(isFrozen(note)),
    frozenUntil: note?.frozenUntil || null,
    hasPassword: locked,
    expiresIn: note?.expiresIn || config.defaultExpiresIn,
    expiresAt: note?.expiresAt || null,
    shareId: note?.shareId || null,
    files: note?.files || [],
    reports: note?.reports || 0,
    updatedAt: note?.updatedAt || null,
    stats: {
      chars: includeText ? (note?.text || '').length : 0,
      lines: includeText ? Math.max(1, String(note?.text || '').split('\n').length) : 0,
      files: note?.files?.length || 0
    },
    passwordFingerprint: passwordFingerprint(note?.passwordHash)
  };
}

export function assertNotFrozen(note) {
  if (isFrozen(note)) throw new HttpError(423, '该便签已被举报冻结，暂时无法访问');
}

export function tempUploadDir() {
  return tmpDir;
}

await ensureDirs();
