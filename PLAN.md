# Mealie entegrasyonu

## Kapsam ve güvence

- Mevcut Türkçe 62 tarif, besin tablosu, porsiyon dengeleme ve market hesabı korunur.
- Mealie ayrı Docker Compose projesinde, yalnızca 127.0.0.1:9925 üzerinde çalışır.
- Mealie token'ı sunucuda kalır. Sunucu kataloğu Worker'a ayrı entegrasyon anahtarıyla gönderir; dışarıdan sunucuya port/tünel açılmaz.
- Katalog D1'de ayrı tabloda tutulur; mevcut state ve geçmiş haftalar aktarım sırasında değiştirilmez.
- Arayüz kataloğu mevcut ortak PIN ile okur. Mealie durursa mevcut plan kullanılmaya devam eder.
- Yeni tarifler kaynak dilindedir; Türkçe ad/adımlar editörde yazılabilir. Otomatik çeviri veya tahmini besin verisi üretilmez.
- İçe aktarmada her malzeme uygulamanın besin tablosuna ve birimine bağlanır. Eksik/belirsiz satır varken kayıt kapalıdır. Kaynak besin değerleri referanstır; hesap mevcut tablodan yapılır.
- Mealie tarifinin uygulamaya alınan kopyası sabittir; Mealie düzenlemeleri plan geçmişini değiştirmez. Kullanılmış özel tarif düzenlemesi yeni kimlikle kaydedilir.

## Aşamalar

1. Kaynak kod yedeği ve mevcut hesap sonuçlarının regresyon örnekleri.
2. Sabit sürümlü Mealie kurulumu, varsayılan şifrenin değiştirilmesi ve API token'ı.
3. Tekrar çalıştırılabilir aktarım: hazır tarifler → Mealie; iki kişinin miktarları ve besin tablosu imzaları extras içinde.
4. Katalog gönderici ve Worker okuma uçları; PIN, yetkisiz erişim, boyut sınırı ve hizmet kesintisi testleri.
5. Arayüzde arama, seçme, kontrollü eşleme ve kaynak bilgisi.
6. Kalıcı çevrimdışı işlem günlüğü, yeniden deneme ve geçmişi koruyan tarif düzenleme.
7. Node regresyon testleri, gerçek Mealie API testleri ve Chrome ile kullanıcı akışları.
8. Başarılı kontrollerden sonra yayın; canlı okuma ve diğer servislerin sağlık kontrolü.

## Geri dönüş

Kaynak yedeği `/home/samet/backups/beslenme/` altında. Önceki Git sürümünün arayüzü ve Worker'ı tekrar yayınlanabilir. Yeni katalog tablosu eskisini etkilemez. Mealie `docker compose stop` ile durdurulabilir; veri volume'ü silinmez. Mevcut `state` aktarım için yazılmaz.

## Kabul ölçütleri

- Önceki sürümle aynı plan için aynı malzeme, besin ve market sonuçları.
- 62 tarifin Mealie aktarımında kişi miktarları ve besin imzaları birebir eşleşir.
- Token'lar HTML, Git ve API cevaplarında yer almaz.
- Mealie kapalıyken plan açılır; katalog eskiliği kullanıcıya gösterilir.
- Yenileme ve iki cihaz sürüm çakışmasında bekleyen işlemler korunur.
- Bilinmeyen malzeme, yanlış birim ve onaysız satırlar kaydedilemez.

## Uygulanan ve doğrulanan

- Mealie v3.29.0 sabit image digest ile kuruldu; varsayılan şifre değiştirildi. Yönetim Tailscale 9443 üzerinden doğrulandı.
- Hazır 62 Türkçe tarif aktarıldı. Tekrar aktarım 0 yeni kayıt üretiyor. Her iki kişinin miktarları ve görünür Mealie besin değerleri gerçek API'den karşılaştırıldı.
- Katalog gönderici ayrı, salt okunur container olarak çalışıyor. İlk canlı gönderimde mevcut planın D1 yedeği oluşturuldu (`backupCreated: 1`); sonraki gönderimler yeni plan yedeği üretmiyor.
- Mealie tam yedeği ZIP olarak indirildi ve ZIP bütünlüğü kontrol edildi; önceki canlı Worker kodu da saklandı.
- Yedi Node testi geçti. 100 haftalık eski/yeni hesap özeti birebir aynı.
- Chrome mobil akışları geçti: İngilizce tarifin Türkçe adlandırılması, her malzemenin onayı, besin eşitliği, kullanılmış tarifin kopyalanması, çevrimdışı işlem → sayfa yenileme → iki cihaz çakışması, zamanlayıcıyla yeniden gönderim ve gerçek service worker ile çevrimdışı açılış.
- Mealie arayüzü için ek Tailscale yönlendirmesi kullanıcı tarafından çalıştırıldı; mevcut 443 ve 8443 yönlendirmeleri korundu.
