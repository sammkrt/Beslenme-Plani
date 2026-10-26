# Beslenme Planı

Samet & Raşe için haftalık beslenme planı: aynı yemek, kişiye göre porsiyon, günlük besin tablosu ve market listesi.

Tek dosyalık statik uygulama (`index.html`), GitHub Pages'te yayında: https://sammkrt.github.io/Beslenme-Plani/

Tarif eklemek için `index.html` içindeki `B` (kahvaltı), `S` (ara öğün), `D` (2 günlük akşam) ve `Z` (Pazar) dizilerine yeni kayıt ekleyin; malzemeler `F` besin tablosundaki anahtarları kullanır.

- **Tahıl rotasyonu:** Pilavı ayrı servis edilen (`servis=1`) akşamlarda bulgur, basmati ve karabuğday haftalık döner (`GR`, plan alanı `g`); tarif adı, malzeme ve pişirme adımı buna göre değişir.
- **Kendi tarifleriniz:** Tercihler › Tariflerimiz › *Tarif ekle*. Form; malzeme listesini yapıştırınca tabloyla eşleştirir (“300 g kıyma”, “1 su bardağı bulgur”) ya da *Talimatı kopyala* ile claude.ai’ye verilen tarifin JSON cevabını forma döker. Tarifler `custom` listesinde durur; silinmez, arşivlenir (geçmiş haftalar onlara bağlı).
- **Tercihler:** Her tarifin altındaki 👍 / 👎 ikinizin ortak tercihidir (sunucuda `prefs`). Sevilenler daha sık seçilir, sevilmeyenler yeni haftalara konmaz; sayfanın altındaki "Tercihleriniz" kartından geri alınır.

## Veri saklama

Geçmiş haftalar `server/` klasöründeki Cloudflare Worker üzerinden ücretsiz bir D1 (SQLite) veritabanında tutulur; böylece her cihaz aynı planı görür. Tarayıcıdaki `localStorage` yalnızca çevrimdışı önbellektir: sunucuya ulaşılamazsa son kopya gösterilir, bağlantı gelince eşitlenir.

- Okumak ve yazmak için ortak PIN gerekir. Her cihazda bir kez **PIN gir** düğmesiyle girilir. Aynı IP'den 15 dakikada 10 hatalı deneme olursa o IP 15 dakika kilitlenir (`pin_fail` tablosu).
- PIN depoda değil, yalnızca Cloudflare'de gizli değişken (`PIN`) olarak durur.
- Her değişiklik bir işlem olarak tutulur. İki cihaz aynı anda değişiklik yaparsa (sürüm kontrolü 409 döner) bekleyen işlemler sunucudaki güncel sürümün üzerine yeniden uygulanır; kimsenin değişikliği kaybolmaz.
- `sw.js` (service worker) sayfayı önbelleğe alır: bağlantı yoksa ya da 4 sn içinde gelmezse son kopya açılır.
- Haftalar takvime bağlıdır (her hafta bir pazartesi başlar, `start` alanı). Geçmiş haftalar salt okunurdur; yalnızca bu hafta ve gelecek hafta yeniden oluşturulabilir ya da silinebilir.
- Her kayıttan önce bir önceki durum `state_backup` tablosuna kopyalanır (son 200 sürüm). Geri yüklemek için:

```bash
cd server
npx wrangler d1 execute beslenme --remote --command "SELECT hid, v, saved FROM state_backup ORDER BY hid DESC LIMIT 20"
# istenen hid için (ör. 42); sonra uygulamayı yenileyin:
npx wrangler d1 execute beslenme --remote --command "UPDATE state SET data = (SELECT data FROM state_backup WHERE hid = 42), v = v + 1 WHERE id = 1"
```

### Kurulum / yeniden yayın

Cloudflare, `main`'e her push'ta `server/` klasöründeki Worker'ı kendiliğinden yayınlar; bu yüzden sunucu kodu, veritabanında elle bir adım beklemeden çalışmalıdır. Elle yayın için:

```bash
cd server
npm install
npx wrangler login                  # Cloudflare hesabıyla giriş
npx wrangler d1 create beslenme     # çıkan database_id'yi wrangler.toml'a yazın
npm run db:remote                   # tabloları oluşturur (pin_fail'ı Worker gerekirse kendisi de oluşturur)
npx wrangler secret put PIN         # ortak PIN'i girin
npm run deploy
```

Yerel deneme: `server/.dev.vars` dosyasına `PIN=...` yazın, `npm run db:local && npm run dev`, ardından depo kökünde `python3 -m http.server 8000` ile sayfayı açın (localhost'ta sayfa otomatik olarak `localhost:8787`'deki API'yi kullanır).

## Mealie

Mealie ayrı Docker Compose projesinde çalışır: `deploy/mealie/compose.yaml`.
Arayüz: https://kurtfamilyserver.dorper-boa.ts.net:9443 (Tailscale gerekir).
Sunucuda yalnızca `127.0.0.1:9925` dinlenir; diğer servislerin portları değiştirilmez.
Giriş e-postası ve rastgele oluşturulmuş parola `deploy/mealie/credentials.json` dosyasındadır (600 izinli, Git dışında). Varsayılan parola değiştirilmiştir. Bu dosyayı veya token'ları Git'e eklemeyin.
Kullanıcı adı `samet`; yalnızca adres, kullanıcı ve şifreyi içeren giriş kartı `deploy/mealie/giris.local.json` dosyasındadır (600 izinli, Git dışında).

**Kullanım:** Mealie'de tarif ekleyin veya bir tarifin internet bağlantısını içe aktarın. Katalog yaklaşık dakikada bir uygulamaya gönderilir. Beslenme Planı › Tercihler › Mealie tarifleri › Tarifleri getir / yenile yolundan bulun. Mevcut 62 Türkçe tarif zaten plan havuzundadır; tekrar eklenmez. Yeni tarifte “Kontrol ederek ekle” ile malzemeleri, birimleri ve iki kişinin miktarlarını onaylayıp kaydedin.

- Kaynak dil korunur; İngilizce tarifin adı ve adımları kayıt öncesinde Türkçeleştirilebilir. Otomatik çeviri servisi kullanılmaz.
- Kaynağın kalori/makro değerleri kişisel hesabın yerine geçirilmez. Hesap mevcut `F` besin tablosu ve porsiyon dengelemesiyle yapılır. Çiğ/pişmiş durumu, belirsiz ölçü, bilinmeyen malzeme veya eksik porsiyon otomatik tahmin edilmez.
- Hazır tariflerin Samet ve Raşe miktarları, besin imzaları ve Türkçe adımları Mealie `extras.beslenme_v1` alanında korunur. Mealie'de düzenlenmiş bir tarife ait eski imza tekrar kullanılmaz.
- İçe aktarılan tarif bağımsız kopyadır. Kullanılmış bir özel tarif düzenlenirse yeni kimlikle kaydedilir; geçmiş haftalar eski tarifte kalır.
- Mealie token'ı yalnızca sunucuda kalır. `connector` Mealie'den okur ve Worker'a `MEALIE_SYNC_KEY` ile katalog gönderir. Uygulama kataloğu ortak PIN ile okur. Cloudflare'den sunucuya bağlantı açılması gerekmez.
- Katalog `mealie_catalog` tablosundadır; mevcut `state` değiştirilmez. İlk katalog gönderiminden önce mevcut plan `state_backup` tablosuna aynı işlemde kopyalanır.
- Katalog 300 tarif / 1,5 MB ile sınırlıdır; sınır aşılırsa son sağlam kopya korunur ve connector hata kaydeder. Son katalog zamanı arayüzde gösterilir.

### İşletim

```bash
cd deploy/mealie
docker compose --profile sync up -d
docker compose logs --tail=30 connector
docker compose ps
```

`credentials.json`: `url`, `email`, `password`, `token`, `worker` (Worker HTTPS adresi), `syncKey` alanlarını içerir. Worker'da aynı `MEALIE_SYNC_KEY` gizli değişken olarak tanımlıdır; mevcut `PIN` değiştirilmez. Tailscale yönlendirmesi için (ilk kurulumda):

```bash
sudo tailscale serve --bg --https=9443 http://127.0.0.1:9925
```

İlk hazır tarif aktarımı ve gerçek Mealie'den besin doğrulaması (depo kökünde):

```bash
node scripts/mealie-sync.mjs --seed --verify
```

Aktarım tekrar çalıştırılabilir; mevcut Mealie tariflerini silmez veya üzerine yazmaz. Mealie yönetim ekranından ayrıca düzenli tam yedek alın. İlk kurulumdaki kaynak kod ve önceki canlı Worker kopyası `/home/samet/backups/beslenme/` altındadır. Mealie verisi ayrı `mealie_mealie-data` Docker volume'ünde tutulur; geri dönüşte volume silinmemelidir.

### Doğrulama

```bash
npm ci
npm test
```

`tests/baseline.json`, entegrasyon öncesi sürümün sabit rastgelelik ile üretilmiş 100 haftalık planının; tüm porsiyon, besin ve market sonuçlarının özetidir. Testler bu sonucu, malzeme eşlemeyi, değişmiş imzaları, PIN korumasını, çakışmayı, katalog sınırlarını ve plan tablosunun değişmediğini kontrol eder. Testler Node 22 gerektirir.

`npm run test:browser`, yalnızca yerel Wrangler (`localhost:8787`) ve statik sunucu (`localhost:8000`) kullanır. Yerel test verisini sıfırlar; canlı API'ye yazmaz. `TEST_CONFIG` JSON dosyasında yerel PIN bulunmalıdır; `CHROME_PATH` ile Chrome yolu seçilebilir. Test; Türkçe adlandırma, tam besin eşitliği, satır onayı, geçmişte tarif kopyalama, çevrimdışı işlem günlüğü, iki cihaz çakışması, otomatik tekrar deneme ve service worker ile gerçek çevrimdışı açılışı denetler.
