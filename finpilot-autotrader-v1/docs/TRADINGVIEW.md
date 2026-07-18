# TradingView kurulumu

## Neden iki Pine dosyası var?

`FinPilot_Live_Indicator.pine` açık mumda değişebilen `ÖN` sinyal gösterebilir; fakat webhook üreten `ONAYLI AL/SAT` yalnız 15 dakikalık mum kapandığında oluşur. `FinPilot_Backtest_Strategy.pine` ise tick hesabı içermez ve yalnız kapanmış mumlarla geriye dönük test yapar. Canlı davranışı backteste karıştırmak yeniden hesaplamada yanıltıcı sonuç üretirdi.

## Canlı gösterge

1. TradingView → Pine Editor → yeni gösterge.
2. `tradingview/FinPilot_Live_Indicator.pine` içeriğini yapıştırın.
3. Kaydedin ve grafiğe ekleyin.
4. Grafik zaman dilimini `15 dakika` yapın.
5. `Kullanılacak sermaye` değerini girin.
6. Sunucudaki `.env` dosyasındaki `TV_WEBHOOK_SECRET` ile aynı, en az 32 karakterlik değeri `Webhook anahtarı` alanına girin.

Gösterge şu koşulları açıkça gösterir: 1/4 saat kapanmış trendi, VWAP, EMA dizilimi, VWAP uzaklığı, göreli hacim, RSI, ADX, ATR rejimi, ortalama işlem hacmi ve BIST 100 yönü. Puan bir olasılık değildir; geçen ağırlıklı kuralların `0–100` uyum skorudur.

## Alarm

- Condition: `FinPilot AutoTrader v1 — 15D Canlı`
- Seçenek: `Any alert() function call`
- Webhook URL: `https://SUNUCUNUZ/api/webhooks/tradingview`
- Sıklık: Pine çağrısı zaten `once_per_bar_close` kullanır.
- Mesaj alanına ayrı JSON yapıştırmayın; gösterge dinamik ve doğrulanan gövdeyi üretir.

Her sembol için ayrı alarm oluşturun. Alarmı kurduktan sonra göstergenin sermaye veya anahtar ayarını değiştirirseniz eski alarm bu değişikliği almaz; alarmı silip yeniden oluşturun.

## Kapanmış üst zaman verisi

1 ve 4 saat verileri `request.security(..., expression[1], lookahead_on)` düzeniyle yalnız son kapanmış üst-zaman mumundan alınır. Bu, devam eden üst-zaman mumunun geçmişte sabit görünmesi sorununu engeller.

## Backtest

`FinPilot_Backtest_Strategy.pine` dosyasını ayrı bir Pine stratejisi olarak ekleyin. Grafiğin 15 dakika olduğundan emin olun. Komisyon ve kayma `strategy()` içinde tanımlıdır; Bar Magnifier açıktır. Eğitim ve dönem dışı tarih aralıklarını örtüştürmeyin.

Backtestte iyi görünen ayarı doğrudan canlıya taşımayın. Farklı piyasa rejimlerini, dönem dışı örnekleri ve en az birkaç yüz ileriye dönük kâğıt sinyali inceleyin.

## Sınırlar

- Pine, KAP veya haber metni okuyamaz.
- Pine, aracı kurum hesabındaki gerçek gerçekleşmeyi kendi başına bilemez.
- TradingView alarm teslimi, internet ve sunucu erişilebilirliğine bağlıdır.
- Stop-limit sert fiyat boşluğunda gerçekleşmeyebilir.
- TradingView içindeki sonuçlar gerçek aracı kurum komisyonu, vergi, kuyruk önceliği ve bütün piyasa mikro yapısını tam modelleyemez.
