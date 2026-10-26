# İnternetten otomatik haftalık tarif seçimi

## Kullanım

“Yeni hafta getir” internet taraması ister ve hazır tarif kataloğunu alır. İlk sürüm Türkçe **akşam yemeklerine** odaklanır. Haftaya en fazla iki yeni tarif eklenir; kahvaltılar ve ara öğünler mevcut/onaylanmış havuzdan seçilir. Balık tarifleri tek günlük Pazar grubunda kalır.

Yemek.com'un tarif sitemap'leri keşif kaynağıdır. Yeni ve arşivde bulunmayan sayfalar okunur; JSON-LD tarif verisi çözümlenir ve uygun tarif Mealie'nin URL içe aktarıcısıyla saklanır. Aynı kaynak iki kez alınmaz. İnternet ve Mealie token'ları tarayıcıya gönderilmez.

## Besin hesabı ve seçim

- Bilinmeyen kalorili malzeme, belirsiz porsiyon, tanınmayan birim veya çiğ/pişmiş uyuşmazlığı otomatik kabul edilmez.
- Sadece kayıtlı besinler kullanılır. Sıvı yağ → zeytinyağı, yoğurt → yağsız yoğurt, kıyma → yağsız dana kıyma uyarlamaları açıkça belirtilir.
- Gramlar doğrudan; adet, kaşık ve bardak ölçüleri yalnızca uygulamadaki tanımlı mutfak gramajları ile hesaplanır. Bunlar standart ölçü varsayımlarıdır; kişisel tabloda yazan gramlar tartılarak kullanılmalıdır. Yeni yoğunluk veya bilinmeyen malzeme değeri tahmin edilmez.
- Gerekiyorsa hesaplanan bulgur/yoğurt yanına eklenir; ad, hazırlanış ve uyarlama notlarında görünür.
- Kaynağın kalori değeri hedef hesabının yerine geçmez. Öğün başına uyarlamadan sonra kahvaltı + ara öğün + akşamın **son dengelenmiş toplamı** hesaplanır: Samet 1700–1900 kcal / en az 130 g protein, Raşe 1400–1500 kcal / en az 95 g protein. Dört gün grubunun tamamı hedefleri tutmalıdır.
- Önceki haftanın akşamları ve beğenilmeyen tarifler elenir. Aynı hafta kahvaltı/ara öğün tekrarı önlenir; farklı protein türleri tercih edilir. Son 26 haftada kullanılan internet kaynakları yeniden “yeni tarif” sayılmaz.
- Tarif içeriği ve besin tablosu imzası tekrar doğrulanır. Mealie'de düzenlenen eski otomatik onay geçersiz olur.

## Kayıt ve hata davranışı

Yeni hafta ile seçilen tariflerin bağımsız kopyaları **tek işlem günlüğü kaydında** saklanır. Çevrimdışı yeniden açılış veya 409 çakışmasında tarifler de haftayla birlikte yeniden uygulanır. Mealie'deki değişiklikler geçmiş haftayı değiştirmez.

Kaynağa ulaşılamazsa veya uygun yeni tarif yoksa, mevcut tariflerden hedefleri tutan hafta hazırlanır ve sonuç mesajında belirtilir. Hedeflere uyan tam hafta bulunamazsa yeni kayıt yapılmaz; mevcut plan korunur. Mevcut özel tarif sınırı 60'tır; yer kalmadığında yeni internet tarifi eklenmez ve mevcut arşiv kullanılır.

## İşletim

Connector beş saniyede bir D1'deki tarama isteğini kontrol eder. Arka planda günde bir tarama da yapılır. Bir taramada en fazla 32 sayfa incelenir ve 5 uygun tarif Mealie'ye alınır. Sitemap listesi bir gün saklanır. Arayüz en fazla 35 saniye tarama sonucunu bekler; tarama uzarsa son hazır katalogla ilerler, sunucu taramayı tamamlar.

Kaynak HTTPS host/path listesiyle sınırlıdır; yönlendirmeler de kontrol edilir. `robots.txt` disallow kuralları uygulanır. İstekler aralıklıdır, gövde boyutu ve süre sınırı vardır. Ücretli API, AI çeviri veya AI ile uydurulmuş besin değerleri kullanılmaz.

- İş durumu: ayrı `mealie_discovery` tablosu; plan tablosuna yazılmaz.
- Hazır otomatik tarifler: katalogda `extras.beslenme_auto_v1`; yalnızca son 80 otomatik aday gönderilir. Önceden seçilenlerin kopyaları zaten plan arşivinde saklıdır.
- Tarama imleci, sitemap ve görülen kaynaklar: `deploy/mealie/runtime/discovery.json` (Git dışında).
- Mealie orijinalleri ve mevcut planlar otomatik silinmez. Hazır adayın seçilmesi uygunluğa bağlıdır; her taramada yeni yemek bulunacağı garanti edilmez.

```bash
docker compose -f deploy/mealie/compose.yaml --profile sync logs --tail=20 connector
npm test
npm run test:auto-browser
```

Tarayıcı testleri yalnızca `localhost:8000` ve yerel Wrangler'ı kullanır. Wrangler için ayrı `--persist-to /tmp/beslenme-auto-worker` alanı kullanılır. Otomatik hafta testinde gerçek internetten alınan hazır adaylar, hedefler, eski haftanın korunması, çevrimdışı/çakışmalı yeniden kayıt ve kaynak kesintisindeki geri dönüş doğrulanır.

Geri dönüş sürümü: `3d8b336`. Bu özellik için kaynak ve Mealie yedeği `/home/samet/backups/beslenme/*-auto/` altındadır. Yeni iş/katalog tabloları önceki sürümü etkilemez.
