import { ASSISTANTS, assistantById, routeCommand, requestedFormats } from './assistants.js';
import { isDesktop, loadProviders, saveProviders, loadAssignments, saveAssignments, loadSettings, saveSettings, storeKey, hasKey, deleteKey } from './storage.js';
import { chat } from './ai.js';
import { speechSupported, isListening, startListening, stopListening, ttsSupported, speak, stopSpeaking } from './voice.js';
import { buildDocument, isBuildable, saveOutput } from './files.js';

const state = {
  providers: loadProviders(),
  assignments: loadAssignments(),
  settings: loadSettings(),
  activeAssistant: 'yonetici',
  tasks: [],
  outputs: [],
  listening: false,
};

let seq = 0;
const nextId = () => ++seq;

const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- Ana çatı ----------
function buildLayout() {
  const root = document.getElementById('app');
  root.innerHTML = `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">◆</div>
        <div>
          <div class="brand-name">AI Asistan Platformu</div>
          <div class="brand-sub">${isDesktop ? 'Masaüstü sürümü' : 'Önizleme (geliştirme)'}</div>
        </div>
      </div>
      <nav class="assistant-list" id="assistant-list"></nav>
      <button class="btn btn-ghost sidebar-settings" id="open-settings">⚙ API &amp; Model Ayarları</button>
    </aside>
    <main class="main">
      <header class="topbar">
        <div id="assistant-header"></div>
        <button class="btn btn-ghost" id="toggle-speak"></button>
      </header>
      <section class="stage">
        <div class="voice-center" id="voice-center"></div>
        <div class="feed" id="feed"></div>
      </section>
      <form class="command-bar" id="command-bar">
        <input id="command-input" placeholder="Sesli ya da yazılı komut verin…" autocomplete="off" />
        <button type="submit" class="btn btn-primary">Gönder</button>
      </form>
    </main>
    <aside class="rightbar">
      <div class="rightbar-title">📥 Çıktılar</div>
      <div id="outputs"></div>
    </aside>
  `;
  document.body.appendChild(document.createElement('div')).id = 'modal-root';
}

// ---------- Kenar çubuğu ----------
function renderSidebar() {
  const list = document.getElementById('assistant-list');
  list.innerHTML = '';
  for (const a of ASSISTANTS) {
    const active = state.activeAssistant === a.id;
    const item = el(`
      <button class="assistant-item ${active ? 'active' : ''}" data-id="${a.id}" title="${esc(a.role)}">
        <span class="assistant-emoji" style="background:${a.color}22;color:${a.color}">${a.emoji}</span>
        <span class="assistant-name">${a.name}<small>${a.codename}</small></span>
      </button>`);
    item.addEventListener('click', () => {
      state.activeAssistant = a.id;
      renderSidebar();
      renderHeader();
    });
    list.appendChild(item);
  }
}

function renderHeader() {
  const a = assistantById(state.activeAssistant);
  const providerName = state.assignments[a.id] ?? '';
  const header = document.getElementById('assistant-header');
  header.innerHTML = `
    <div class="header-emoji" style="background:${a.color}22;color:${a.color}">${a.emoji}</div>
    <div class="header-text">
      <div class="header-name">${a.name} · ${a.codename}</div>
      <div class="header-role">${esc(a.role)}</div>
    </div>
    <label class="header-provider">Model
      <select id="header-provider-select">
        <option value="">— seçiniz —</option>
        ${state.providers.map((p) => `<option value="${esc(p.name)}" ${p.name === providerName ? 'selected' : ''}>${esc(p.name)} (${esc(p.model)})</option>`).join('')}
      </select>
    </label>
  `;
  header.querySelector('#header-provider-select').addEventListener('change', (e) => {
    state.assignments[a.id] = e.target.value || undefined;
    saveAssignments(state.assignments);
  });

  const btn = document.getElementById('toggle-speak');
  btn.textContent = state.settings.autoSpeak ? '🔊 Sesli yanıt: açık' : '🔇 Sesli yanıt: kapalı';
  btn.onclick = () => {
    state.settings.autoSpeak = !state.settings.autoSpeak;
    saveSettings(state.settings);
    renderHeader();
    if (!state.settings.autoSpeak) stopSpeaking();
  };
}

// ---------- Ses merkezi ----------
function renderVoiceCenter() {
  const center = document.getElementById('voice-center');
  const supported = speechSupported();
  center.innerHTML = `
    <button class="orb ${state.listening ? 'listening' : ''}" id="orb" ${supported ? '' : 'disabled'}>
      ${state.listening ? '🎙️ Dinliyorum…' : '🎤 Sesli Komut'}
    </button>
    <div class="voice-hint">${supported ? 'Mikrofona basın ve konuşun' : 'Bu ortamda mikrofon desteği yok; komutu yazarak verebilirsiniz'}</div>
    <div class="examples">
      ${['Borsada bugün neler oluyor?', 'Şu metni düzenle: …', 'Bu ay için bütçe raporu hazırla (pdf)', 'Python ile dosya okuyan kod yaz'].map((t) => `<button class="chip" data-text="${esc(t)}">${esc(t)}</button>`).join('')}
    </div>
  `;
  const orb = center.querySelector('#orb');
  orb.addEventListener('click', () => {
    if (state.listening) {
      stopListening();
      state.listening = false;
      renderVoiceCenter();
      return;
    }
    const started = startListening({
      onResult: (text) => {
        state.listening = false;
        renderVoiceCenter();
        runCommand(text);
      },
      onEnd: () => {
        state.listening = false;
        renderVoiceCenter();
      },
      onError: () => {
        state.listening = false;
        renderVoiceCenter();
      },
    });
    state.listening = started;
    if (started) renderVoiceCenter();
  });
  center.querySelectorAll('.chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      document.getElementById('command-input').value = chip.dataset.text;
      document.getElementById('command-input').focus();
    })
  );
}

// ---------- Görev akışı ----------
function renderFeed() {
  const feed = document.getElementById('feed');
  if (!state.tasks.length) {
    feed.innerHTML = `
      <div class="empty">
        <div class="empty-glyph">◆</div>
        <div class="empty-title">Komutunuzu bekliyorum</div>
        <div class="empty-sub">Yönetici asistan isteğinizi analiz eder ve uygun uzmanlara dağıtır.</div>
      </div>`;
    return;
  }
  feed.innerHTML = '';
  for (const task of state.tasks) {
    const a = assistantById(task.assistantId);
    const card = el(`
      <article class="task" data-id="${task.id}">
        <div class="task-head">
          <span class="assistant-emoji" style="background:${a.color}22;color:${a.color}">${a.emoji}</span>
          <div class="task-title">${a.name} · ${a.codename}</div>
          <span class="task-status ${task.status}">${statusLabel(task.status)}</span>
        </div>
        <div class="task-command">${esc(task.command)}</div>
        <div class="task-reply">${task.reply ? esc(task.reply) : task.error ? `<span class="task-error">${esc(task.error)}</span> <button class="btn btn-ghost btn-sm open-settings-inline">API ayarlarını aç</button>` : '<span class="task-loading">çalışıyor…</span>'}</div>
        <div class="task-files"></div>
      </article>`);
    card.querySelector('.open-settings-inline')?.addEventListener('click', openSettings);
    const files = card.querySelector('.task-files');
    if (task.reply) {
      files.appendChild(buildFileButtons(task));
    }
    feed.appendChild(card);
    feed.scrollTop = feed.scrollHeight;
  }
}

function statusLabel(status) {
  return { queued: '⏳ kuyrukta', running: '⚙️ çalışıyor', done: '✅ tamam', failed: '⚠️ hata' }[status];
}

function buildFileButtons(task) {
  const wrap = el('<div class="file-row"></div>');
  for (const ext of ['pdf', 'docx', 'xlsx']) {
    if (!isBuildable(ext)) continue;
    const b = el(`<button class="btn btn-ghost btn-sm">⬇ ${ext.toUpperCase()}</button>`);
    b.addEventListener('click', () => exportTask(task, ext));
    wrap.appendChild(b);
  }
  return wrap;
}

async function exportTask(task, ext) {
  const a = assistantById(task.assistantId);
  try {
    const blob = await buildDocument(ext, `${a.name} — ${task.command}`, task.reply);
    const result = await saveOutput(`${task.id}-${a.codename}`, ext, blob);
    const entry = {
      id: nextId(),
      name: `${task.id}-${a.codename}.${ext}`,
      at: new Date().toLocaleTimeString('tr-TR'),
      detail: result.kind === 'file' ? result.path : 'İndirildi',
    };
    state.outputs.unshift(entry);
    renderOutputs();
  } catch (err) {
    alert('Dosya oluşturulamadı: ' + (err?.message || err));
  }
}

function renderOutputs() {
  const box = document.getElementById('outputs');
  if (!state.outputs.length) {
    box.innerHTML = '<div class="outputs-empty">Henüz dosya üretilmedi. Rapor görevlerinden PDF / Word / Excel oluşturabilirsiniz.</div>';
    return;
  }
  box.innerHTML = '';
  for (const o of state.outputs) {
    box.appendChild(el(`<div class="output-item"><div class="output-name">${esc(o.name)}</div><div class="output-meta">${esc(o.at)} · ${esc(o.detail)}</div></div>`));
  }
}

// ---------- Komut çalıştırma ----------
async function runCommand(text) {
  const command = text.trim();
  if (!command) return;
  document.getElementById('command-input').value = '';

  // Doğrudan görev modu: kenar çubuğundan uzman seçildiyse komut ona gider,
  // Yönetici seçiliyse komut anahtar kelimelerle dağıtılır.
  const direct = state.activeAssistant !== 'yonetici';
  const targets = direct ? [assistantById(state.activeAssistant)] : routeCommand(command);
  const formats = requestedFormats(command);

  const tasks = (targets.length ? targets : [assistantById('yonetici')]).map((a) => {
    const task = { id: nextId(), command, assistantId: a.id, status: 'queued', reply: null, error: null };
    state.tasks.push(task);
    return task;
  });
  renderFeed();
  renderVoiceCenter();

  for (const task of tasks) {
    task.status = 'running';
    renderFeed();
    try {
      const providerName = state.assignments[task.assistantId] ?? state.providers[0]?.name;
      if (!providerName) throw new Error('Model atanmadı. Ayarlardan API sağlayıcısı ekleyin.');
      if (!(await hasKey(providerName))) {
        throw new Error('API anahtarı tanımlı değil. Ayarlardan sağlayıcıyı yapılandırın.');
      }
      const assistant = assistantById(task.assistantId);
      const reply = await chat(providerName, [
        { role: 'system', content: assistant.system },
        { role: 'user', content: command },
      ]);
      task.reply = assistant.id === 'finans' ? reply + '\n\n⚠️ Bilgilendirme amaçlıdır, yatırım tavsiyesi değildir.' : reply;
      task.status = 'done';
      if (assistant.id === 'rapor') {
        for (const ext of formats.length ? formats : ['pdf']) {
          await exportTaskSilent(task, ext);
        }
      }
    } catch (err) {
      task.status = 'failed';
      task.error = String(err?.message || err);
    }
    renderFeed();
    renderOutputs();
  }

  summarize(tasks);
}

async function exportTaskSilent(task, ext) {
  try {
    const a = assistantById(task.assistantId);
    const blob = await buildDocument(ext, `${a.name} — ${task.command}`, task.reply);
    const result = await saveOutput(`${task.id}-${a.codename}`, ext, blob);
    state.outputs.unshift({
      id: nextId(),
      name: `${task.id}-${a.codename}.${ext}`,
      at: new Date().toLocaleTimeString('tr-TR'),
      detail: result.kind === 'file' ? result.path : 'İndirildi',
    });
  } catch (err) {
    console.error('Belge üretilemedi', err);
  }
}

function summarize(tasks) {
  const done = tasks.filter((t) => t.status === 'done');
  const failed = tasks.filter((t) => t.status === 'failed');
  let summary;
  if (!done.length && !failed.length) return;
  if (!done.length) {
    summary = 'Görevleri tamamlamaya çalıştım ama sağlayıcı bağlantısı olmadı. Ayarları kontrol eder misiniz?';
  } else {
    const names = [...new Set(done.map((t) => assistantById(t.assistantId).name))].join(', ');
    const first = done[0].reply || '';
    summary = `Görev tamamlandı. ${names} çalıştı. İlk sonucu özetliyorum: ${first.slice(0, 240)}`;
  }
  if (state.settings.autoSpeak) speak(summary);
}

// ---------- Ayarlar modalı ----------
function openSettings() {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const modal = el(`
    <div class="modal-backdrop">
      <div class="modal">
        <div class="modal-head">
          <div class="modal-title">⚙ API &amp; Model Ayarları</div>
          <button class="btn btn-ghost btn-sm" id="close-settings">✕</button>
        </div>
        ${isDesktop ? '' : '<div class="modal-warning">Tarayıcı önizlemesinde anahtarlar yalnızca bu geliştirme ortamında (localStorage) tutulur. Windows uygulamasında anahtarlar işletim sisteminin güvenli deposunda şifrelenir.</div>'}
        <div class="provider-list" id="provider-list"></div>
        <form class="provider-form" id="provider-form">
          <div class="form-title">Yeni sağlayıcı (OpenAI uyumlu)</div>
          <input id="pf-name" placeholder="Ad (örn. OpenAI)" required />
          <input id="pf-base" placeholder="Base URL (örn. https://api.openai.com/v1)" required />
          <input id="pf-model" placeholder="Model (örn. gpt-4o-mini)" required />
          <input id="pf-key" type="password" placeholder="API anahtarı" required />
          <button type="submit" class="btn btn-primary">Sağlayıcıyı Ekle</button>
        </form>
      </div>
    </div>`);
  root.appendChild(modal);

  const renderList = () => {
    const list = modal.querySelector('#provider-list');
    list.innerHTML = state.providers.length ? '' : '<div class="outputs-empty">Henüz sağlayıcı eklenmedi.</div>';
    for (const p of state.providers) {
      const row = el(`
        <div class="provider-row">
          <div><b>${esc(p.name)}</b><small>${esc(p.baseUrl)} · ${esc(p.model)}</small></div>
          <button class="btn btn-ghost btn-sm provider-delete" data-name="${esc(p.name)}">Sil</button>
        </div>`);
      row.querySelector('.provider-delete').addEventListener('click', async () => {
        await deleteKey(p.name);
        state.providers = state.providers.filter((x) => x.name !== p.name);
        saveProviders(state.providers);
        renderList();
        renderHeader();
      });
      list.appendChild(row);
    }
  };
  renderList();

  modal.querySelector('#close-settings').addEventListener('click', () => {
    root.innerHTML = '';
  });
  modal.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) root.innerHTML = '';
  });

  modal.querySelector('#provider-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = modal.querySelector('#pf-name').value.trim();
    const baseUrl = modal.querySelector('#pf-base').value.trim();
    const model = modal.querySelector('#pf-model').value.trim();
    const key = modal.querySelector('#pf-key').value;
    if (!name || !baseUrl || !model || !key) return;
    try {
      await storeKey({ name, baseUrl, model }, key);
      const existing = state.providers.find((p) => p.name === name);
      if (existing) Object.assign(existing, { baseUrl, model });
      else state.providers.push({ name, baseUrl, model });
      saveProviders(state.providers);
      modal.querySelector('#pf-key').value = '';
      renderList();
      renderHeader();
    } catch (err) {
      alert('Anahtar kaydedilemedi: ' + (err?.message || err));
    }
  });
}

// ---------- Başlat ----------
buildLayout();
renderSidebar();
renderHeader();
renderVoiceCenter();
renderFeed();
renderOutputs();

document.getElementById('open-settings').addEventListener('click', openSettings);
document.getElementById('command-bar').addEventListener('submit', (e) => {
  e.preventDefault();
  runCommand(document.getElementById('command-input').value);
});
window.ttsSupported = ttsSupported;
