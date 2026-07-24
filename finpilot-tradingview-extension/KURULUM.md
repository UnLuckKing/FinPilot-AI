# FinPilot eklenti kurulumu

## Chrome

1. ZIP dosyasına sağ tıklayıp **Tümünü ayıkla** seçin.
2. Adres çubuğuna `chrome://extensions` yazın.
3. Sağ üstten **Geliştirici modu**nu açın.
4. **Paketlenmemiş öğe yükle** seçeneğine basın.
5. İçinde `manifest.json` bulunan `FinPilot-TradingView-Extension` klasörünü seçin.
6. TradingView'i açın.
7. Uzantılar menüsünden FinPilot'u sabitleyin ve simgesine tıklayın.

## Microsoft Edge

Chrome adımlarının aynısını `edge://extensions` sayfasında uygulayın.

## Kullanım

- TradingView'de bir grafik açın. Örnek: `BIST:THYAO`, `NASDAQ:AAPL`, `BINANCE:BTCUSDT`.
- FinPilot simgesine bir kez tıklayın; sağ panel açılır.
- Sembol değiştiğinde analiz otomatik yenilenir.
- `Grafik` sekmesine her geçtiğinizde açık sembol yeniden doğrulanır; algılama satırında sembolün kaynağı görünür.
- Eklenti doğrudan **Piyasalar** bölümünde açılır ve küresel tarama otomatik başlar.
- `Tümü`, `BIST`, `ABD`, `Kripto`, `Forex` ve `Endeks/Emtia` düğmeleri mevcut sonuçları filtreler; yeniden tarama başlatmaz.
- `Keşfedilen`, ilk aşamada değerlendirilen geniş evreni; `Derin aday`, çoklu zaman analizine geçirilen kısa listeyi gösterir.
- Tarama sonucuna dokununca TradingView aynı sekmede doğru sembolü açar ve ayrıntılı plan Grafik bölümünde yeniden doğrulanır.
- `LONG`, `SHORT / Düşüş` düğmeleri tamamlanan sonuçları yönüne göre filtreler.
- En iyi LONG ve en iyi düşüş/SHORT adayı tarama özetinin altında ayrıca gösterilir.
- Turuncu `BEKLE`, fiyatı kovalamamanız gerektiği anlamına gelir.
- `YATIR` görünse bile giriş, stop ve hedefleri kendi aracı kurumunuzda siz girersiniz.
- `DÜŞÜŞ — UZAK DUR`, düşüş beklendiğini fakat o spot/hisse üründe uygulanabilir SHORT doğrulanmadığını belirtir.
- Gerçek SHORT için desteklenen aracı kurum, açığa satış/ödünç veya türev ürün gerekir; TradingView tek başına ödeme yapmaz.

## Sorun olursa

- Panel sembolü okuyamazsa uzantı algılama kodunu otomatik yeniden yükler. TradingView giriş ekranında değil gerçek grafik sayfasında olduğunuzu kontrol edin.
- Eski sürümden güncelliyorsanız `chrome://extensions` sayfasından eski klasörü kaldırıp yeni 2.1 klasörünü yükleyin.
- `VERİ YETERSİZ` kararı bir yazılım hatası olmak zorunda değildir; sembol veri sağlayıcıda bulunmamış veya seans içi veri gecikmiş olabilir.
- BIST sembol eşlemesi otomatik olarak `.IS` biçimine çevrilir.
- Opsiyonlar; kullanım fiyatı, vade ve oynaklık verisi olmadan analiz edilmez.
