import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const numberFromEnv = (name, fallback) => {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const config = {
  env: process.env.NODE_ENV || 'production',
  host: process.env.HOST || '0.0.0.0',
  port: numberFromEnv('PORT', 3000),
  baseUrl: process.env.APP_BASE_URL || `http://localhost:${numberFromEnv('PORT', 3000)}`,
  appSecret: process.env.APP_SECRET || crypto.createHash('sha256').update('webnote-vps-dev-secret').digest('hex'),
  trustProxy: process.env.TRUST_PROXY || '',
  dataDir: path.resolve(projectRoot, process.env.DATA_DIR || 'data'),
  maxTextChars: numberFromEnv('MAX_TEXT_CHARS', 200000),
  maxFileSizeBytes: numberFromEnv('MAX_FILE_SIZE_MB', 50) * 1024 * 1024,
  maxFilesPerNote: numberFromEnv('MAX_FILES_PER_NOTE', 10),
  defaultExpiresIn: 86400,
  tokenTtlSeconds: 12 * 60 * 60
};

export const expiresOptions = [
  { value: 3600, label: '1 小时' },
  { value: 21600, label: '6 小时' },
  { value: 86400, label: '1 天' },
  { value: 259200, label: '3 天' },
  { value: 604800, label: '一周' },
  { value: 2592000, label: '一个月' },
  { value: 7776000, label: '三个月' },
  { value: 15552000, label: '六个月' },
  { value: 31536000, label: '一年' },
  { value: 63072000, label: '两年' },
  { value: 94608000, label: '三年' }
];

export const reservedNames = new Set([
  'api',
  'assets',
  'new',
  'p',
  'faqs.html',
  'api.html',
  'about.html',
  'privacy-policy.html',
  'terms-of-service.html',
  'favicon.ico'
]);
