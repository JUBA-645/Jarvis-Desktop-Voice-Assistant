// Yapılandırma saklama katmanı.
// Masaüstünde (Electron): API anahtarları ana süreçte OS güvenli deposunda şifreli tutulur,
// renderer'da asla saklanmaz. Tarayıcı önizlemesinde: geliştirme amaçlı localStorage,
// arayüzde açık uyarıyla bildirilir.
const LS_PROVIDERS = 'aap.providers';
const LS_ASSIGN = 'aap.assignments';
const LS_SETTINGS = 'aap.settings';

export const isDesktop = typeof window !== 'undefined' && !!window.desktop;

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function loadProviders() {
  return readJson(LS_PROVIDERS, []);
}

export function saveProviders(list) {
  localStorage.setItem(LS_PROVIDERS, JSON.stringify(list));
}

export function loadAssignments() {
  return readJson(LS_ASSIGN, {});
}

export function saveAssignments(map) {
  localStorage.setItem(LS_ASSIGN, JSON.stringify(map));
}

export function loadSettings() {
  return readJson(LS_SETTINGS, { autoSpeak: true });
}

export function saveSettings(s) {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
}

export async function storeKey(provider, value) {
  if (isDesktop) {
    const res = await window.desktop.setKey(provider.name, provider.baseUrl, provider.model, value);
    if (!res.ok) throw new Error(res.error);
    return;
  }
  localStorage.setItem('aap.key.' + provider.name, value);
}

export async function hasKey(name) {
  if (isDesktop) {
    const res = await window.desktop.hasKey(name);
    return res.ok ? res.hasKey : false;
  }
  return !!localStorage.getItem('aap.key.' + name);
}

export async function deleteKey(name) {
  if (isDesktop) {
    await window.desktop.deleteKey(name);
    return;
  }
  localStorage.removeItem('aap.key.' + name);
}
