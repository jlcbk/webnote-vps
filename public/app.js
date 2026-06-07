const boot = JSON.parse(document.getElementById('boot')?.textContent || '{}');
const pageMode = document.body.dataset.mode || 'home';
const root = document.getElementById('page');

const $ = (selector, scope = document) => scope.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function encodeName(name) {
  return encodeURIComponent(name);
}

function appUrl(path) {
  return `${window.location.origin}${path}`;
}

function toast(message, type = 'info') {
  const item = document.createElement('div');
  item.className = `toast toast-${type}`;
  item.textContent = message;
  document.body.appendChild(item);
  requestAnimationFrame(() => item.classList.add('show'));
  setTimeout(() => {
    item.classList.remove('show');
    setTimeout(() => item.remove(), 250);
  }, 2600);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制');
  } catch {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    toast('已复制');
  }
}

function request(path, options = {}, allowedStatuses = []) {
  const headers = new Headers(options.headers || {});
  if (options.json) headers.set('Content-Type', 'application/json');
  if (noteState.token) headers.set('Authorization', `Bearer ${noteState.token}`);

  return fetch(path, {
    ...options,
    headers,
    body: options.json ? JSON.stringify(options.json) : options.body
  }).then(async (response) => {
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok && !allowedStatuses.includes(response.status)) {
      throw new Error(data?.error || '请求失败');
    }
    return { status: response.status, data };
  });
}

function header() {
  return `<header class="site-header">
    <a class="brand" href="/">云便签</a>
    <nav class="nav">
      <a href="/">首页</a>
      <a href="/faqs.html">常见问答</a>
      <a href="/api.html">API</a>
      <a href="/new/">快速创建</a>
    </nav>
  </header>`;
}

function footer() {
  return `<footer class="footer">
    <div>
      <strong>云便签</strong>
      <p>一个适合自部署的临时文本、链接和文件中转工具。</p>
    </div>
    <div>
      <a href="/about.html">关于</a>
      <a href="/privacy-policy.html">隐私政策</a>
      <a href="/terms-of-service.html">服务条款</a>
    </div>
  </footer>`;
}

function renderPage(content, className = '') {
  root.innerHTML = `${header()}<main class="${className}">${content}</main>${footer()}`;
}

function renderHome() {
  renderPage(`<section class="hero">
      <h1>云便签 网络剪贴板</h1>
      <p class="hero-subtitle">无需登录，即开即用。把文本和文件临时放到一个网址上，在另一台设备打开同一网址即可取回。</p>
      <form class="hero-form" id="open-note-form">
        <input id="note-name" maxlength="80" autocomplete="off" placeholder="便签名称，可留空自动生成随机名称">
        <button type="submit">查看云便签</button>
      </form>
      <div class="warning-box">严禁存储或传播违法违规内容。临时工具不适合作为永久网盘，重要数据请自行备份并及时删除。</div>
    </section>
    <section class="band">
      <div class="section-title">
        <span>产品介绍</span>
        <h2>什么是云便签，如何使用</h2>
      </div>
      <div class="intro-grid">
        <div class="panel">
          <h3>使用方法</h3>
          <ol class="steps">
            <li>输入一个便签名称，例如 <code>demo</code>。</li>
            <li>访问 <code>${escapeHtml(window.location.host)}/demo</code>。</li>
            <li>输入文本或上传文件，内容会保存到 VPS。</li>
            <li>其他设备打开同一链接即可复制、下载或继续编辑。</li>
          </ol>
        </div>
        <div class="url-card">
          <span>URL 结构</span>
          <strong>${escapeHtml(window.location.origin)}/您的名字</strong>
          <p>名称支持中英文、数字、下划线和短横线。名称相同即进入同一个便签空间。</p>
        </div>
      </div>
    </section>
    <section class="band white">
      <div class="section-title">
        <span>核心功能</span>
        <h2>为临时中转而设计</h2>
      </div>
      <div class="feature-grid">
        ${feature('跨设备同步', '无需注册账号，只要记住链接，手机、电脑、平板都能打开。')}
        ${feature('自动保存', '编辑文本后自动保存，也可以手动保存确认。')}
        ${feature('访问密码', '为便签设置密码，服务端只保存加盐哈希，不保存明文密码。')}
        ${feature('只读分享', '生成只读链接给别人查看，减少误改内容的风险。')}
        ${feature('文件附件', '支持临时上传文件，默认单文件最大 50 MB，可用环境变量调整。')}
        ${feature('自动过期', '便签在有效期内被访问会续期，超期后自动清理。')}
      </div>
    </section>`, 'home-page');

  $('#open-note-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('#note-name').value.trim();
    window.location.href = name ? `/${encodeName(name)}` : '/new/';
  });
}

function feature(title, text) {
  return `<article class="feature-card"><h3>${title}</h3><p>${text}</p></article>`;
}

function renderStaticPage(kind) {
  const content = {
    faq: `<section class="content-page"><h1>常见问答</h1>
      ${qa('云便签有什么用？', '用于临时保存文本、链接和小文件，适合跨设备复制粘贴、快速分享、学校打印、轻量协作等场景。')}
      ${qa('数据会保存多久？', '保存时间由有效期决定。便签在有效期内被访问或修改后会自动续期；超过有效期无人访问会被清理。')}
      ${qa('忘记密码怎么办？', '无法找回。服务端不保存明文密码，只保存密码哈希；忘记密码后只能重新创建新的便签。')}
      ${qa('适合作为网盘吗？', '不适合。它定位为临时中转工具，重要数据请保存到本地或专业存储服务。')}
      ${qa('如何自动输入密码？', '可以用 /便签名@密码 的形式打开，前端会尝试自动解锁，然后把地址栏中的密码移除。')}
      ${qa('如何举报违规内容？', '在便签侧栏点击举报。多次举报后会冻结或删除该便签。')}`,
    'api-docs': `<section class="content-page"><h1>开发者 API</h1>
      <p>当前程序内置 REST API，方便脚本读写自部署便签。</p>
      <div class="api-list">
        ${apiItem('GET', '/api/notes/:name', '读取便签。密码保护的便签需要 Bearer token，或使用只读 share 参数。')}
        ${apiItem('PUT', '/api/notes/:name', '创建或更新便签。JSON 字段：text、expiresIn、password、rotateShare。')}
        ${apiItem('POST', '/api/notes/:name/unlock', '提交 password，换取临时编辑 token。')}
        ${apiItem('POST', '/api/notes/:name/files', 'multipart/form-data 上传单个 file 字段。')}
        ${apiItem('DELETE', '/api/notes/:name', '删除便签及附件。密码保护便签需要 token。')}
        ${apiItem('GET', '/api/qrcode?text=', '生成 SVG 二维码。')}
      </div>
      <pre><code>curl -X PUT ${escapeHtml(window.location.origin)}/api/notes/demo \\
  -H 'Content-Type: application/json' \\
  -d '{"text":"hello","expiresIn":86400}'</code></pre></section>`,
    about: `<section class="content-page"><h1>关于云便签</h1><p>这是一个可自部署的轻量网络剪贴板程序。它不需要用户系统，适合部署在个人 VPS 上做临时数据中转。</p></section>`,
    privacy: `<section class="content-page"><h1>隐私政策</h1><p>程序默认把便签文本、附件和元数据保存在服务器本地 data 目录。请确保 VPS、反向代理和备份策略符合你的隐私要求。</p></section>`,
    terms: `<section class="content-page"><h1>服务条款</h1><p>本服务仅用于合法的临时数据中转。请勿上传违法、侵权、恶意软件或其他不合规内容。数据删除后不可恢复。</p></section>`
  }[kind];

  renderPage(content, 'static-page');
}

function qa(question, answer) {
  return `<article class="qa"><h2>${question}</h2><p>${answer}</p></article>`;
}

function apiItem(method, route, desc) {
  return `<div class="api-item"><b>${method}</b><code>${route}</code><span>${desc}</span></div>`;
}

const noteState = {
  name: boot.name || '',
  autoPassword: boot.autoPassword || '',
  shareId: boot.shareId || '',
  readonly: Boolean(boot.readonly),
  token: '',
  note: null,
  status: 'loading',
  saveTimer: null,
  sidebarOpen: false,
  linkMode: 'edit'
};

function tokenKey(name) {
  return `webnote-token:${name}`;
}

async function loadNote() {
  try {
    if (noteState.shareId) {
      const { data } = await request(`/api/shares/${encodeURIComponent(noteState.shareId)}`);
      noteState.note = data;
      noteState.name = data.name;
      noteState.readonly = true;
      noteState.status = 'saved';
      renderNote();
      return;
    }

    noteState.token = sessionStorage.getItem(tokenKey(noteState.name)) || '';
    if (noteState.autoPassword) {
      const ok = await unlockNote(noteState.autoPassword, false);
      if (ok) {
        history.replaceState(null, '', `/${encodeName(noteState.name)}`);
        noteState.autoPassword = '';
        renderNote();
        return;
      }
    }

    const { status, data } = await request(`/api/notes/${encodeName(noteState.name)}`, {}, [401]);
    noteState.note = status === 401 ? { ...data, name: noteState.name, text: '', locked: true } : normalizePublicNote(data);
    noteState.status = status === 401 ? 'locked' : 'saved';
    renderNote();
  } catch (error) {
    renderNoteError(error.message);
  }
}

function normalizePublicNote(note) {
  return {
    exists: false,
    text: '',
    files: [],
    expiresIn: boot.expiresOptions?.[2]?.value || 86400,
    stats: { chars: 0, lines: 1, files: 0 },
    ...note,
    name: note?.name || noteState.name
  };
}

async function unlockNote(password, showError = true) {
  try {
    const { data } = await request(`/api/notes/${encodeName(noteState.name)}/unlock`, {
      method: 'POST',
      json: { password }
    });
    noteState.token = data.token || '';
    if (noteState.token) sessionStorage.setItem(tokenKey(noteState.name), noteState.token);
    noteState.note = normalizePublicNote(data.note);
    noteState.status = 'saved';
    return true;
  } catch (error) {
    if (showError) toast(error.message, 'error');
    return false;
  }
}

function noteStats(text) {
  return {
    chars: text.length,
    lines: Math.max(1, text.split('\n').length)
  };
}

function renderNote() {
  const note = normalizePublicNote(noteState.note);
  if (note.locked && noteState.status === 'locked') {
    renderLockedNote();
    return;
  }

  root.innerHTML = `<div class="note-app">
    <header class="note-topbar">
      <a class="note-brand" href="/">云便签</a>
      <div class="topbar-settings">
        <label>保留
          <select id="expires-select" ${noteState.readonly ? 'disabled' : ''}>
            ${boot.expiresOptions.map((option) => `<option value="${option.value}" ${option.value === note.expiresIn ? 'selected' : ''}>${option.label}</option>`).join('')}
          </select>
        </label>
        <button id="password-btn" class="link-button" ${noteState.readonly ? 'disabled' : ''}>密码：${note.hasPassword ? '已设置' : '未设置'}</button>
      </div>
      <span class="status-pill ${noteState.status}">${statusText(note)}</span>
      <div class="topbar-actions">
        <button id="save-btn" class="primary" ${noteState.readonly ? 'disabled' : ''}>保存</button>
        <button id="sidebar-toggle" class="ghost">侧栏</button>
      </div>
    </header>
    <div class="note-workbench">
      <section class="editor-panel">
        <div class="tabbar">
          <div class="tab active">主便签</div>
          <a class="tab new-tab" href="/new/">新建</a>
        </div>
        <div class="editor-wrap">
          <textarea id="editor" ${noteState.readonly ? 'readonly' : ''} maxlength="${boot.maxTextChars}" placeholder="${editorPlaceholder()}">${escapeHtml(note.text)}</textarea>
          <button id="clear-btn" class="icon-action" title="清空当前便签" ${noteState.readonly ? 'disabled' : ''}>清空</button>
          <div id="editor-counter" class="counter">${counterText(note.text)}</div>
        </div>
      </section>
      <aside class="side-panel ${noteState.sidebarOpen ? 'open' : ''}">
        <div class="side-actions">
          <button id="copy-text">复制</button>
          <button id="download-text">下载 TXT</button>
        </div>
        <div class="stat-card">
          <h3>统计信息</h3>
          <div class="stats">
            <span><b>${note.files?.length || 0}</b>附件</span>
            <span><b>${noteStats(note.text).lines}</b>行数</span>
            <span><b>${note.text.length}</b>字符</span>
          </div>
        </div>
        <div class="side-card">
          <h3>文件附件</h3>
          <div id="file-list">${filesHtml(note)}</div>
          <label class="upload-button ${noteState.readonly ? 'disabled' : ''}">
            上传文件
            <input id="file-input" type="file" ${noteState.readonly ? 'disabled' : ''}>
          </label>
          <p class="hint">单文件最大 ${formatBytes(boot.maxFileSizeBytes)}。</p>
        </div>
        <div class="side-card">
          <div class="share-head">
            <h3>分享</h3>
            <div class="segment">
              <button data-mode="readonly" class="${noteState.linkMode === 'readonly' ? 'active' : ''}">只读</button>
              <button data-mode="edit" class="${noteState.linkMode === 'edit' ? 'active' : ''}">编辑</button>
            </div>
          </div>
          ${shareHtml(note)}
        </div>
        <div class="danger-zone">
          <button id="report-btn">举报冻结</button>
          <button id="delete-btn" ${noteState.readonly ? 'disabled' : ''}>删除便签</button>
        </div>
      </aside>
    </div>
  </div>`;

  bindNoteEvents();
}

function statusText(note) {
  if (noteState.readonly) return '只读查看';
  if (noteState.status === 'saving') return '保存中';
  if (noteState.status === 'dirty') return '有未保存修改';
  if (!note.exists) return '当前名称可用，输入内容即可使用';
  return '已保存';
}

function editorPlaceholder() {
  return `可以随便记录点什么，单次支持 ${boot.maxTextChars} 个字符...

便签在有效期内被查看或修改会自动续期。
传输完成后建议主动删除，避免数据长期暴露。
请勿上传或传播违法违规内容。`;
}

function counterText(text) {
  const stats = noteStats(text);
  return `${stats.lines} 行 ${stats.chars} 字符`;
}

function filesHtml(note) {
  if (!note.files?.length) return '<p class="empty">暂无附件</p>';
  return note.files.map((file) => {
    const query = downloadQuery(note);
    return `<div class="file-row">
      <span title="${escapeHtml(file.originalName)}">${escapeHtml(file.originalName)}</span>
      <small>${formatBytes(file.size)}</small>
      <a href="/api/notes/${encodeName(note.name)}/files/${file.id}/download${query}">下载</a>
      ${noteState.readonly ? '' : `<button data-delete-file="${file.id}">删除</button>`}
    </div>`;
  }).join('');
}

function downloadQuery(note) {
  if (noteState.shareId) return `?share=${encodeURIComponent(noteState.shareId)}`;
  if (note.hasPassword && noteState.token) return `?token=${encodeURIComponent(noteState.token)}`;
  return '';
}

function shareHtml(note) {
  if (!note.exists) return '<div class="empty share-empty">请先保存便签以获取链接。</div>';
  const editLink = appUrl(`/${encodeName(note.name)}`);
  const readLink = appUrl(`/p/${note.shareId}`);
  const link = noteState.linkMode === 'readonly' ? readLink : editLink;
  const label = noteState.linkMode === 'readonly' ? '他人只能查看内容：' : '他人可编辑内容：';
  return `<p class="hint">${label}</p>
    <div class="share-box">
      <input id="share-link" readonly value="${escapeHtml(link)}">
      <button id="copy-link">复制</button>
    </div>
    <div class="qr-box">
      <button id="show-qr">二维码</button>
      <div id="qr-result"></div>
    </div>`;
}

function bindNoteEvents() {
  const editor = $('#editor');
  const counter = $('#editor-counter');

  $('#sidebar-toggle')?.addEventListener('click', () => {
    noteState.sidebarOpen = !noteState.sidebarOpen;
    $('.side-panel')?.classList.toggle('open', noteState.sidebarOpen);
  });

  editor?.addEventListener('input', () => {
    counter.textContent = counterText(editor.value);
    noteState.note.text = editor.value;
    scheduleSave();
  });

  $('#expires-select')?.addEventListener('change', () => {
    noteState.note.expiresIn = Number.parseInt($('#expires-select').value, 10);
    scheduleSave(0);
  });

  $('#save-btn')?.addEventListener('click', () => saveNow());
  $('#password-btn')?.addEventListener('click', openPasswordDialog);
  $('#clear-btn')?.addEventListener('click', () => {
    if (!confirm('确定清空当前便签文本吗？')) return;
    editor.value = '';
    editor.dispatchEvent(new Event('input'));
  });

  $('#copy-text')?.addEventListener('click', () => copyText(editor?.value || ''));
  $('#download-text')?.addEventListener('click', () => downloadTextFile(noteState.note.name, editor?.value || ''));

  $('#file-input')?.addEventListener('change', uploadSelectedFile);
  document.querySelectorAll('[data-delete-file]').forEach((button) => {
    button.addEventListener('click', () => deleteFile(button.dataset.deleteFile));
  });

  document.querySelectorAll('.segment button').forEach((button) => {
    button.addEventListener('click', () => {
      noteState.linkMode = button.dataset.mode;
      renderNote();
    });
  });

  $('#copy-link')?.addEventListener('click', () => copyText($('#share-link').value));
  $('#show-qr')?.addEventListener('click', () => {
    const link = $('#share-link').value;
    $('#qr-result').innerHTML = `<img alt="分享二维码" src="/api/qrcode?text=${encodeURIComponent(link)}">`;
  });

  $('#delete-btn')?.addEventListener('click', deleteNote);
  $('#report-btn')?.addEventListener('click', reportCurrentNote);
}

function scheduleSave(delay = 900) {
  if (noteState.readonly) return;
  noteState.status = 'dirty';
  $('.status-pill').textContent = statusText(noteState.note);
  $('.status-pill').className = 'status-pill dirty';
  clearTimeout(noteState.saveTimer);
  noteState.saveTimer = setTimeout(() => saveNow(), delay);
}

async function saveNow(extra = {}) {
  if (noteState.readonly) return;
  const editor = $('#editor');
  const text = editor ? editor.value : noteState.note.text || '';
  if (text.length > boot.maxTextChars) {
    toast(`文本不能超过 ${boot.maxTextChars} 个字符`, 'error');
    return;
  }

  clearTimeout(noteState.saveTimer);
  noteState.status = 'saving';
  $('.status-pill') && ($('.status-pill').textContent = '保存中');

  try {
    const payload = {
      text,
      expiresIn: Number.parseInt($('#expires-select')?.value || noteState.note.expiresIn, 10),
      ...extra
    };
    const { data } = await request(`/api/notes/${encodeName(noteState.name)}`, {
      method: 'PUT',
      json: payload
    });
    noteState.note = normalizePublicNote(data);
    noteState.status = 'saved';
    renderNote();
    toast('已保存', 'success');
    return data;
  } catch (error) {
    noteState.status = 'dirty';
    toast(error.message, 'error');
    if (error.message.includes('密码')) {
      noteState.token = '';
      sessionStorage.removeItem(tokenKey(noteState.name));
      noteState.status = 'locked';
      noteState.note = { ...noteState.note, locked: true };
      renderLockedNote();
    }
  }
}

function openPasswordDialog() {
  const hasPassword = noteState.note?.hasPassword;
  openDialog(`访问密码`, `<form id="password-form" class="dialog-form">
    <label>新密码
      <input id="new-password" type="password" autocomplete="new-password" placeholder="${hasPassword ? '留空则清除密码' : '输入访问密码'}">
    </label>
    <p class="hint">${hasPassword ? '留空保存会移除当前访问密码。' : '设置后，编辑或查看需要先输入密码。'}</p>
    <div class="dialog-actions">
      <button type="button" data-dialog-close>取消</button>
      <button class="primary" type="submit">保存</button>
    </div>
  </form>`, () => {
    $('#password-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = $('#new-password').value;
      const data = await saveNow({ password });
      if (data && password) await unlockNote(password, false);
      if (data && !password) {
        noteState.token = '';
        sessionStorage.removeItem(tokenKey(noteState.name));
      }
      closeDialog();
      renderNote();
    });
  });
}

function openDialog(title, body, onReady) {
  closeDialog();
  const dialog = document.createElement('div');
  dialog.className = 'dialog-backdrop';
  dialog.innerHTML = `<div class="dialog"><h2>${escapeHtml(title)}</h2>${body}</div>`;
  document.body.appendChild(dialog);
  dialog.querySelectorAll('[data-dialog-close]').forEach((button) => button.addEventListener('click', closeDialog));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog();
  });
  onReady?.();
}

function closeDialog() {
  document.querySelector('.dialog-backdrop')?.remove();
}

async function uploadSelectedFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > boot.maxFileSizeBytes) {
    toast(`文件不能超过 ${formatBytes(boot.maxFileSizeBytes)}`, 'error');
    return;
  }

  const form = new FormData();
  form.append('file', file);
  try {
    await request(`/api/notes/${encodeName(noteState.name)}/files`, {
      method: 'POST',
      body: form
    });
    toast('文件已上传', 'success');
    await reloadCurrentNote();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function reloadCurrentNote() {
  const query = noteState.shareId ? `?share=${encodeURIComponent(noteState.shareId)}` : '';
  const { data } = await request(`/api/notes/${encodeName(noteState.name)}${query}`);
  noteState.note = normalizePublicNote(data);
  noteState.status = 'saved';
  renderNote();
}

async function deleteFile(fileId) {
  if (!confirm('确定删除该文件吗？')) return;
  try {
    await request(`/api/notes/${encodeName(noteState.name)}/files/${fileId}`, { method: 'DELETE' });
    toast('文件已删除', 'success');
    await reloadCurrentNote();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function deleteNote() {
  if (!confirm('确定删除整个便签和所有附件吗？删除后不可恢复。')) return;
  try {
    await request(`/api/notes/${encodeName(noteState.name)}`, { method: 'DELETE' });
    sessionStorage.removeItem(tokenKey(noteState.name));
    toast('便签已删除', 'success');
    setTimeout(() => window.location.href = '/', 600);
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function reportCurrentNote() {
  if (!confirm('确认举报该便签？举报会触发冻结规则。')) return;
  try {
    const { data } = await request(`/api/notes/${encodeName(noteState.name)}/report`, { method: 'POST' });
    toast(data.deleted ? '该便签已被删除' : '举报已提交，便签已冻结', 'success');
    setTimeout(() => window.location.reload(), 800);
  } catch (error) {
    toast(error.message, 'error');
  }
}

function downloadTextFile(name, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${name || 'note'}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function renderLockedNote() {
  root.innerHTML = `${header()}<main class="locked-page">
    <section class="locked-box">
      <h1>${escapeHtml(noteState.name)}</h1>
      <p>该便签已设置访问密码。</p>
      <form id="unlock-form">
        <input id="unlock-password" type="password" autofocus placeholder="请输入访问密码">
        <button class="primary" type="submit">解锁</button>
      </form>
      <a href="/">返回首页</a>
    </section>
  </main>${footer()}`;
  $('#unlock-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const ok = await unlockNote($('#unlock-password').value);
    if (ok) renderNote();
  });
}

function renderNoteError(message) {
  root.innerHTML = `${header()}<main class="locked-page">
    <section class="locked-box">
      <h1>无法打开便签</h1>
      <p>${escapeHtml(message)}</p>
      <a class="primary-link" href="/">返回首页</a>
    </section>
  </main>${footer()}`;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

if (pageMode === 'home') renderHome();
if (pageMode === 'note') loadNote();
if (['faq', 'api-docs', 'about', 'privacy', 'terms'].includes(pageMode)) renderStaticPage(pageMode);
