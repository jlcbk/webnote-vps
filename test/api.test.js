import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

let app;
let tempDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webnote-vps-'));
  process.env.DATA_DIR = tempDir;
  process.env.APP_SECRET = 'test-secret';
  const module = await import(`../src/app.js?cache=${Date.now()}-${Math.random()}`);
  app = module.createApp();
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('creates and reads a public note', async () => {
  await request(app)
    .put('/api/notes/demo')
    .send({ text: 'hello', expiresIn: 86400 })
    .expect(200);

  const response = await request(app).get('/api/notes/demo').expect(200);
  assert.equal(response.body.exists, true);
  assert.equal(response.body.text, 'hello');
  assert.equal(response.body.stats.chars, 5);
});

test('serves pages with strict content security policy', async () => {
  const response = await request(app).get('/').expect(200);
  assert.match(response.headers['content-security-policy'], /script-src 'self'/);
  assert.match(response.text, /data-boot=/);
  assert.doesNotMatch(response.text, /id="boot"/);
});

test('preserves initial expiration when creating a random note', async () => {
  const response = await request(app).get('/new/?expiresIn=604800').expect(302);
  assert.match(response.headers.location, /\?expiresIn=604800$/);
});

test('protects note text behind password and unlocks with token', async () => {
  await request(app)
    .put('/api/notes/secret-note')
    .send({ text: 'hidden', password: 'pass123' })
    .expect(200);

  const locked = await request(app).get('/api/notes/secret-note').expect(401);
  assert.equal(locked.body.text, '');
  assert.equal(locked.body.locked, true);

  const unlock = await request(app)
    .post('/api/notes/secret-note/unlock')
    .send({ password: 'pass123' })
    .expect(200);

  const readable = await request(app)
    .get('/api/notes/secret-note')
    .set('Authorization', `Bearer ${unlock.body.token}`)
    .expect(200);

  assert.equal(readable.body.text, 'hidden');
});

test('supports readonly share lookup', async () => {
  const created = await request(app)
    .put('/api/notes/share-note')
    .send({ text: 'shared' })
    .expect(200);

  const shared = await request(app).get(`/api/shares/${created.body.shareId}`).expect(200);
  assert.equal(shared.body.readonly, true);
  assert.equal(shared.body.text, 'shared');
});

test('uploads and downloads an attachment', async () => {
  await request(app)
    .post('/api/notes/file-note/files')
    .attach('file', Buffer.from('file content'), 'hello.txt')
    .expect(201);

  const note = await request(app).get('/api/notes/file-note').expect(200);
  assert.equal(note.body.files.length, 1);
  assert.equal(note.body.files[0].originalName, 'hello.txt');

  const downloaded = await request(app)
    .get(`/api/notes/file-note/files/${note.body.files[0].id}/download`)
    .expect(200);

  assert.equal(downloaded.text, 'file content');
});

test('rejects oversized text', async () => {
  const large = 'x'.repeat(200001);
  const response = await request(app)
    .put('/api/notes/large')
    .send({ text: large })
    .expect(413);

  assert.match(response.body.error, /文本不能超过/);
});
