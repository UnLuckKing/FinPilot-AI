# Sorun giderme

## Panel açılmıyor

`npm run check` çalıştırın. Ardından `npm start` çıktısında `http://127.0.0.1:4310` satırını arayın. Port doluysa `.env` içindeki `PORT` değerini değiştirin.

## Migration veya Prisma hatası

```bash
npm run db:generate
npm run db:migrate
```

`data` klasörünün yazılabilir olduğundan emin olun. Veritabanını silmek geçmiş emir ve mutabakat kaydı kaybına neden olur; yedek almadan silmeyin.

## TradingView alarmı 401 dönüyor

Pine ayarındaki gizli webhook anahtarı ile `.env` içindeki `TV_WEBHOOK_SECRET` aynı değildir. Anahtarı düzelttikten sonra TradingView alarmını silip yeniden oluşturun; mevcut alarm eski ayarların kopyasını kullanır.

## Alarm 400 dönüyor

Grafik 15 dakika olmayabilir, gösterge eski sürüm olabilir veya alarm gövdesi elle değiştirilmiş olabilir. `Any alert() function call` seçeneğini kullanın.

## Sinyal reddediliyor

Panelde son sinyalin gerekçesine bakın. Yaygın nedenler: eski alarm, sembol izin listesinde değil, kısıt verisi süresi dolmuş, yeni giriş saati geçmiş, açık pozisyon/emir var, mutabakat tamamlanmadı, günlük kayıp/işlem kilidi veya masraf sonrası ödül/risk yetersiz.

## Kısıt verisi süresi doldu

Resmî borsa/aracı kurum kısıtlarını kontrol edip `config/restrictions.json` dosyasını güncelleyin. Sistem eski kısıt verisiyle olumlu işlem tahmin etmez.

## Emir kabul edildi ama pozisyon yok

Bu beklenen davranıştır. `ACCEPTED`, aracı kurumun isteği aldığını söyler; `FILLED` değildir. Gerçek gerçekleşme gelmezse limit emir süresi dolabilir.

## Canlı mod açılmıyor

Adaptör `FULL` mutabakat sağlamıyor olabilir. Osmanlı'nın yalnız tek yönlü webhook akışı bu sürümde `LIMITED` görünür ve canlı mod bilinçli olarak bloklanır. Resmî çift yönlü arayüz gerekir.

## Pine derleme hatası

Dosyanın ilk satırının `//@version=6` olduğundan ve tüm dosyanın eksiksiz kopyalandığından emin olun. `npm run check:pine` yalnız statik kontrol yapar; kesin derleme TradingView Pine Editor'dedir.
