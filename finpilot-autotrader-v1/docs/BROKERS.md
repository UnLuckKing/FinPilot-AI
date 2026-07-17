# Aracı kurum adaptörleri

## PaperBroker — çalışır

Varsayılan adaptördür. Limit, piyasa, stop ve stop-limit emirlerini; kısmi gerçekleşme, komisyon, kayma, ret, iptal, süre dolması, bağlantı gecikmesi ve stop fiyat boşluğu senaryolarını simüle eder. Gerçek para iletmez.

## OsmanliWebhookAdapter — sınırlı

Yalnız aracı kurumun resmî TradingView komut sihirbazından dışa aktarılan şablonla çalışır. FinPilot şablondaki desteklenen değişkenlere `side`, `symbol`, `quantity`, `limitPrice`, `stopPrice`, `target1`, `target2`, `validity` ve `clientOrderId` değerlerini yerleştirir.

FinPilot özel uç noktayı çözmeye çalışmaz ve dokümante edilmemiş alan uydurmaz. Şablonun `BUY/SELL`, limit, stop veya hedef alanlarından hangilerini desteklediğini resmî sihirbaz belirler.

Webhook HTTP `2xx` cevabı yalnız `ACCEPTED` sayılır; gerçek gerçekleşme değildir. Resmî akış hesap, açık emir, pozisyon ve gerçekleşme sorgusu sunmuyorsa adaptör `LIMITED` mutabakat döndürür. FinPilot v1 bu durumda canlı modu güvenlik gereği açmaz.

Ortam değişkenleri:

```env
BROKER_ADAPTER=OSMANLI
OSMANLI_WEBHOOK_URL=https://RESMI-ADRES
OSMANLI_WEBHOOK_TEMPLATE_PATH=/guvenli/konum/resmi-sablon.json
OSMANLI_API_TOKEN=yalniz-gerekiyorsa
```

Şablonu veya anahtarı GitHub'a göndermeyin.

## MatriksIQAdapter ve IdealAdapter — bekliyor

Paket ve arayüz hazırdır; fakat resmî SDK, dokümante API, yerel köprü veya terminal entegrasyonu sağlanmadan işlevsel işaretlenmez. `BROKER_ADAPTER=MATRIKS` veya `IDEAL` seçildiğinde bağlantı bilinçli olarak kapalı döner.

## Yeni adaptörün canlı kabul şartları

- Resmî ve kullanımına izin verilen arayüz
- Hesap bakiyesi ve kullanılabilir nakit
- Açık emir ve pozisyon sorgusu
- Emir gönderme, iptal ve değiştirme
- Gerçekleşme akışı veya güvenilir sorgu
- İstemci emir kimliğiyle idempotency
- Koruyucu emrin broker tarafında kalması veya güvenilir servis gözetimi
- Yeniden başlatmada tam mutabakat
- Test hesabında bütün yaşam döngüsünün doğrulanması

Bu şartlar sağlanmadan `reconciliation: FULL` verilmemelidir.
