# TradingView kurulumu

## 1. Pine Screener radarı

1. TradingView'de herhangi bir grafik açın.
2. Alt bölümden Pine Editor'ü açın.
3. `tradingview/FinPilot_Universal_Radar.pine` dosyasını yapıştırıp kaydedin.
4. Göstergenin yıldızına basarak favorilere ekleyin.
5. Ürünler → Screeners → Pine yoluna gidin.
6. İzleme listesini seçin.
7. Gösterge olarak FinPilot Universal Radar v2'yi seçin.
8. Zaman dilimini `15 dakika` yapın.
9. Tarama bitince `Karar` sütununu azalan sıralayın.

Karar kodları:

- `3`: YATIR
- `2`: YATIRILABİLİR — SEN BİLİRSİN
- `1`: BEKLE
- `0`: YATIRMA
- `-1`: VERİ YETERSİZ

## 2. Ayrıntılı grafik analizi

`tradingview/FinPilot_Deep_Analyzer.pine` dosyasını ikinci gösterge olarak grafiğe ekleyin. Grafiği 15 dakika yapın ve yalnız `Analizde kullanılacak sermaye` değerini girin.

Gösterge şunları çizer:

- Plan A giriş bölgesi
- Fiyat kaçarsa kovalama sınırı
- Stop
- Hedef 1 ve hedef 2
- Plan B geri çekilme bölgesi
- 15 dakika, 1 gün ve 1 hafta yönü
- Eksik koşul ve ana risk

## 3. Watchlist düzeni

Tek dev liste yerine piyasa davranışına göre ayrı listeler önerilir:

- `FinPilot — BIST`
- `FinPilot — Global Hisse ETF`
- `FinPilot — Kripto Spot`
- `FinPilot — Forex`
- `FinPilot — Vadeli Endeks Emtia`

Bu ayrım aynı anda farklı veri aboneliklerinin ve seansların karışmasını önler. Radar yine sembol türünü otomatik algılar.

## 4. Bildirim

Sadece TradingView bildirimi istiyorsanız `FinPilot YATIR` ve `FinPilot YATIRILABİLİR` koşullarına watchlist alarmı kurun. Mümkünse frekansı mum kapanışında bir kez olarak ayarlayın.

## 5. Panel webhooku

Paneli kullanacaksanız:

1. `.env` ve Pine içindeki `Webhook anahtarı` aynı, rastgele ve en az 32 karakter olmalıdır.
2. Alarm türü `Any alert() function call` olmalıdır.
3. Webhook adresi `https://SUNUCUNUZ/api/webhooks/tradingview` olmalıdır.
4. Sunucu yalnız 443/HTTPS üzerinden erişilebilir olmalıdır.
5. Alarm günlüğünde webhook teslim durumunu kontrol edin.

TradingView bazen webhook teslimini kaçırabilir. Panel bir sinyal gelmediğinde bunu piyasa kararı olarak yorumlamaz; yalnız aldığı sinyalleri gösterir.

## 6. Gerçek zamanlı veri kontrolü

TradingView grafik başlığında gecikme işareti olmamalıdır. Hacim kullanan piyasada hacim sütunu görünmüyorsa `YATIR` sonucuna güvenmeyin. FinPilot bu durumda veri sağlığını düşürür.
