# Beslenme Planı

Samet & Raşe için haftalık beslenme planı: aynı yemek, kişiye göre porsiyon, günlük besin tablosu ve market listesi.

Tek dosyalık statik uygulama (`index.html`), GitHub Pages'te yayında: https://sammkrt.github.io/Beslenme-Plani/

Tarif eklemek için `index.html` içindeki `B` (kahvaltı), `S` (ara öğün), `D` (2 günlük akşam) ve `Z` (Pazar) dizilerine yeni kayıt ekleyin; malzemeler `F` besin tablosundaki anahtarları kullanır.

- **Tahıl rotasyonu:** Pilavı ayrı servis edilen (`servis=1`) akşamlarda bulgur, basmati ve karabuğday haftalık döner (`GR`, plan alanı `g`); tarif adı, malzeme ve pişirme adımı buna göre değişir.
- **Tercihler:** Her tarifin altındaki 👍 / 👎 ikinizin ortak tercihidir (sunucuda `prefs`). Sevilenler daha sık seçilir, sevilmeyenler yeni haftalara konmaz; sayfanın altındaki "Tercihleriniz" kartından geri alınır.

## Veri saklama

Geçmiş haftalar `server/` klasöründeki Cloudflare Worker üzerinden ücretsiz bir D1 (SQLite) veritabanında tutulur; böylece her cihaz aynı planı görür. Tarayıcıdaki `localStorage` yalnızca çevrimdışı önbellektir: sunucuya ulaşılamazsa son kopya gösterilir, bağlantı gelince eşitlenir.

- Okuma herkese açıktır; yazmak için ortak PIN gerekir. Her cihazda bir kez **PIN gir** düğmesiyle girilir.
- PIN depoda değil, yalnızca Cloudflare'de gizli değişken (`PIN`) olarak durur.
- İki cihaz aynı anda değişiklik yaparsa sunucudaki sürüm geçerli olur (sürüm kontrolü ile).
- Haftalar takvime bağlıdır (her hafta bir pazartesi başlar, `start` alanı). Geçmiş haftalar salt okunurdur; yalnızca bu hafta ve gelecek hafta yeniden oluşturulabilir ya da silinebilir.
- Her kayıttan önce bir önceki durum `state_backup` tablosuna kopyalanır (son 200 sürüm). Geri yüklemek için:

```bash
cd server
npx wrangler d1 execute beslenme --remote --command "SELECT hid, v, saved FROM state_backup ORDER BY hid DESC LIMIT 20"
# istenen hid için (ör. 42); sonra uygulamayı yenileyin:
npx wrangler d1 execute beslenme --remote --command "UPDATE state SET data = (SELECT data FROM state_backup WHERE hid = 42), v = v + 1 WHERE id = 1"
```

### Kurulum / yeniden yayın

```bash
cd server
npm install
npx wrangler login                  # Cloudflare hesabıyla giriş
npx wrangler d1 create beslenme     # çıkan database_id'yi wrangler.toml'a yazın
npm run db:remote                   # tabloyu oluşturur
npx wrangler secret put PIN         # ortak PIN'i girin
npm run deploy
```

Yerel deneme: `server/.dev.vars` dosyasına `PIN=...` yazın, `npm run db:local && npm run dev`, ardından depo kökünde `python3 -m http.server 8000` ile sayfayı açın (localhost'ta sayfa otomatik olarak `localhost:8787`'deki API'yi kullanır).
