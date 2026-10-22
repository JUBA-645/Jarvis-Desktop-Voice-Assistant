# AI Asistan Platformu — Base44 Geliştirme Ortamı

## Yapı

- `app/` — Asıl ürün: **Electron masaüstü uygulaması** (Windows öncelikli, web uygulaması değil).
  - `app/electron/main.cjs` — Ana süreç: pencere, OS güvenli deposunda API anahtarları (`safeStorage`), ana süreç üzerinden AI çağrı proxy'si, dosya kaydetme (İndirilenler klasörü).
  - `app/electron/preload.cjs` — Güvenli köprü (`contextBridge`), `window.desktop`.
  - `app/renderer/` — Renderer arayüzü (Vite + vanilla JS): 10 uzman asistan, yönetici yönlendirme, sesli komut (Web Speech API), PDF/DOCX/XLSX üretimi.
  - `app/renderer/src/assistants.js` — Asistan tanımları + komut yönlendirme anahtar kelimeleri.
- Repo kökündeki `Jarvis/` klasörü orijinal ithal proje; değiştirilmedi.

## Önizleme (bu ortam)

`docker-compose.base44.yml` renderer'ı Vite ile 5173 portunda çalıştırır ve 3000'e eşler.
Bu yalnızca **geliştirme önizlemesidir**; gerçek ürün Electron penceresidir.

- Konteynerde `ELECTRON_SKIP_BINARY_DOWNLOAD=1` gerekli (Electron çalıştırılabilir dosyası önizlemede kullanılmıyor, indirme ~100MB).
- Tarayıcı önizlemesinde API anahtarları geliştirme amaçlı `localStorage`'a düşer ve arayüzde uyarıyla bildirilir; Electron'da `safeStorage` ile şifreli tutulur.

## Windows paketi (kullanıcının makinesinde)

```bash
cd app
npm install
npm run dist:win      # release/ altında NSIS kurulum üretir
npm run electron:dev  # geliştirme (vite + electron birlikte)
```

## Doğrulama

- `docker compose -f docker-compose.base44.yml up -d --build` → `docker compose ps` sağlık kontrolü
- Önizlemede: 10 asistan listelenir, komut verilince yönetici yönlendirir; sağlayıcı yoksa ayar uyarısı çıkar.

## Sır yönetimi

Uygulama açılışında zorunlu sır yoktur. AI sağlayıcı anahtarları kullanıcı tarafından uygulama içi Ayarlar'dan girilir (dış servis anahtarı; repo'ya asla yazılmaz).
