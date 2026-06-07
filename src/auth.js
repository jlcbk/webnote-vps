import crypto from 'node:crypto';
import { config } from './config.js';

const iterations = 120000;
const keyLength = 32;
const digest = 'sha256';

const encode = (value) => Buffer.from(value).toString('base64url');
const decode = (value) => Buffer.from(value, 'base64url').toString();

export function randomId(bytes = 10) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest).toString('hex');
  return { salt, hash, iterations, digest };
}

export function verifyPassword(password, passwordHash) {
  if (!passwordHash?.salt || !passwordHash?.hash) return false;
  const expected = crypto.pbkdf2Sync(
    password,
    passwordHash.salt,
    passwordHash.iterations || iterations,
    keyLength,
    passwordHash.digest || digest
  );
  const actual = Buffer.from(passwordHash.hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function signToken(payload, ttlSeconds = config.tokenTtlSeconds) {
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };
  const encodedBody = encode(JSON.stringify(body));
  const signature = crypto.createHmac('sha256', config.appSecret).update(encodedBody).digest('base64url');
  return `${encodedBody}.${signature}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [encodedBody, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', config.appSecret).update(encodedBody).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const payload = JSON.parse(decode(encodedBody));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function passwordFingerprint(passwordHash) {
  if (!passwordHash?.hash) return null;
  return crypto.createHash('sha256').update(`${passwordHash.salt}:${passwordHash.hash}`).digest('hex');
}
