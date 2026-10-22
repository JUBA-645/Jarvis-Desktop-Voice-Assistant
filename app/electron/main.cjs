const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

let win = null;

const providersFile = () => path.join(app.getPath('userData'), 'providers.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function encrypt(value) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('İşletim sisteminin güvenli kimlik bilgisi deposu kullanılamıyor.');
  }
  return safeStorage.encryptString(value).toString('base64');
}

function decrypt(cipher) {
  return safeStorage.decryptString(Buffer.from(cipher, 'base64'));
}

function registerIpc() {
  // API anahtarı yalnızca ana süreçte, OS güvenli deposuyla şifrelenmiş tutulur;
  // renderer'a asla geri dönmez.
  ipcMain.handle('keys:set', (_e, { name, baseUrl, model, value }) => {
    try {
      const providers = readJson(providersFile(), []);
      const entry = { name, baseUrl, model, cipher: encrypt(value) };
      const idx = providers.findIndex((p) => p.name === name);
      if (idx >= 0) providers[idx] = entry;
      else providers.push(entry);
      writeJson(providersFile(), providers);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle('keys:has', (_e, { name }) => {
    const hasKey = readJson(providersFile(), []).some((p) => p.name === name);
    return { ok: true, hasKey };
  });

  ipcMain.handle('keys:delete', (_e, { name }) => {
    writeJson(providersFile(), readJson(providersFile(), []).filter((p) => p.name !== name));
    return { ok: true };
  });

  // AI çağrıları ana süreç üzerinden yapılır; anahtar istemci tarafına sızmaz.
  ipcMain.handle('ai:chat', async (_e, { providerName, messages }) => {
    try {
      const provider = readJson(providersFile(), []).find((p) => p.name === providerName);
      if (!provider) return { ok: false, error: 'Sağlayıcı bulunamadı' };
      const apiKey = decrypt(provider.cipher);
      const url = provider.baseUrl.replace(/\/+$/, '') + '/chat/completions';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: provider.model, messages }),
      });
      if (!res.ok) return { ok: false, error: `Sağlayıcı hatası: HTTP ${res.status}` };
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) return { ok: false, error: 'Sağlayıcı boş yanıt döndürdü' };
      return { ok: true, content };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  // Üretilen belgeler kullanıcının İndirilenler klasörüne kaydedilir.
  ipcMain.handle('files:save', (_e, { name, base64 }) => {
    try {
      const dir = path.join(app.getPath('downloads'), 'AI Asistan Ciktilari');
      fs.mkdirSync(dir, { recursive: true });
      const safe = name.replace(/[\\/:*?"<>|]/g, '_');
      const file = path.join(dir, safe);
      fs.writeFileSync(file, Buffer.from(base64, 'base64'));
      return { ok: true, path: file };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#0a0e1a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
