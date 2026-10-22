import { isDesktop, hasKey } from './storage.js';

// AI çağrısı: masaüstünde ana süreç proxy'siyle (anahtar renderer'a sızmaz),
// tarayıcı önizlemesinde doğrudan (yalnızca geliştirme amaçlı, arayüzde uyarıyla bildirilir).
export async function chat(providerName, messages) {
  if (isDesktop) {
    const res = await window.desktop.aiChat(providerName, messages);
    if (!res.ok) throw new Error(res.error);
    return res.content;
  }

  const meta = getProviderMeta(providerName);
  const key = localStorage.getItem('aap.key.' + providerName);
  if (!key) throw new Error('API anahtarı tanımlı değil. Ayarlardan sağlayıcıyı yapılandırın.');
  if (!meta?.baseUrl) throw new Error('Sağlayıcı yapılandırması bulunamadı.');

  const url = meta.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: meta.model, messages }),
    });
  } catch (err) {
    throw new Error('Sağlayıcıya ulaşılamadı: ' + String(err?.message || err));
  }
  if (!res.ok) throw new Error(`Sağlayıcı hatası: HTTP ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Sağlayıcı boş yanıt döndürdü');
  return content;
}

export async function ensureProviderReady(providerName) {
  return hasKey(providerName);
}
