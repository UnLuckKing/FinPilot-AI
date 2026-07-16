# FinPilot Multi-Market v2.0 — Kurulum

FinPilot geniş BIST ve Binance USDT spot evrenini kendi tarar; `YATIR`/`YATIRMA`, yön olasılıkları, alış limiti ve stop-limit araştırma planı üretir. Gerçek emir göndermez, İş Bankası/İş Yatırım veya Binance hesabına bağlanmaz ve kullanıcı adı, şifre ya da API anahtarı istemez.

## En kısa kurulum

1. ZIP dosyasını bir klasöre çıkar.
2. `TRADINGVIEW-KURULUMUNU-AC.bat` dosyasına çift tıkla.
3. Açılan `chrome://extensions` sayfasında sağ üstten **Geliştirici modu**nu aç.
4. **Paketlenmemiş öğe yükle** düğmesine bas ve paketteki `extension` klasörünü seç.
5. TradingView'i aç. Sağ alttaki **✦ AI** düğmesine veya Chrome araç çubuğundaki FinPilot simgesine bas.

İlk açılışta kayıt yoksa tarama kendiliğinden başlar. Chrome açıkken yaklaşık 4 saatte bir yenilenir. Tek manuel kontrol **ŞİMDİ TÜM PİYASALARI ARAŞTIR** düğmesidir.

Uzantıyı güncellediğinde `chrome://extensions` sayfasında FinPilot kartındaki yenile simgesine bir kez bas.

## Hangi varlıkları tarar?

| Piyasa | Evren | Veri | Yön vadeleri | Özel güvenlik kapısı |
| --- | --- | --- | --- | --- |
| BIST | İş Yatırım tablosundan fiili dolaşım piyasa değerine göre en fazla 120 likit hisse | Günlük kapanış, hacim ve temel oranlar | 1, 5, 20 işlem günü | Temel değerleme, KAP, BIST piyasa genişliği |
| Kripto | Binance'te hacim ve işlem sayısı eşiğini geçen en fazla 140 USDT spot çifti | Yalnızca kapanmış 4 saatlik mumlar | 4 saat, 1 gün, 7 gün | Likidite, aşırı hareket/pump ve BTC/piyasa rejimi |

Kripto havuzu stablecoin tabanlarını ve `UP`, `DOWN`, `BULL`, `BEAR` kaldıraçlı tokenları dışlar. Futures, kaldıraç ve short yoktur. Bu sınırlar hem işlem riskini hem de ücretsiz veri kaynağına aynı anda gönderilen istekleri kontrol etmek içindir; borsadaki her listelenmiş varlığın körlemesine gösterildiği anlamına gelmez.

## Karar nasıl oluşur?

Her varlıkta şu kontroller birlikte çalışır:

1. Veri tazeliği ve tarama kapsamı
2. EMA trendi, RSI, MACD, ATR, kırılım ve hacim
3. Komisyon ve fiyat kayması içeren geçmiş simülasyon
4. Küçük örneklem için yumuşatılmış kazanma oranı ve `%95` aralık
5. Zaman sırası korunmuş eğitim/test ayrımlı yerel lojistik model
6. Benzer geçmiş dönemlerden üç vadeli yön olasılığı ve beklenen aralık
7. Yakın dönem performansı ve 250 senaryolu stres testi
8. Piyasa özel temel/KAP veya likidite/BTC kapıları
9. Fiyat adımına uygun limit, stop tetik, stop-limit ve hedef sıralaması

| Etiket | Anlamı |
| --- | --- |
| **YATIR** | O taramadaki tüm zorunlu kapılar geçti. Yine de kazanç garantisi değildir. |
| **YATIRMA** | En az bir kapı geçmedi veya doğrulanamadı. Kart “Neden YATIRMA?” alanında eksikleri gösterir. |
| **YATIR'a en yakın** | Olumlu skoru olan fakat en fazla üç zorunlu kapısı eksik sonuçtur. Emir planı etkinleşmez. |

Sistem olumlu sonuç sayısını artırmak için eşikleri gevşetmez. Hiç `YATIR` görünmemesi hata olmak zorunda değildir; sıkı kurallarda normal bir sonuçtur.

## Panel sekmeleri

- **Tümü:** BIST ve kripto sonuçlarını geçerli sinyal, yakın sonuç ve puana göre birleştirir.
- **BIST:** Yalnızca hisse kartlarını ve KAP/temel metriklerini gösterir.
- **Kripto:** Yalnızca spot kripto kartlarını, 24 saatlik hacmi ve hareketi gösterir.
- **Geçmiş:** Üretilen `YATIR` sinyallerini sonraki taramalardaki kapanmış fiyatlarla `AÇIK`, `HEDEF 1`, `HEDEF 2`, `STOP` veya `SÜRESİ DOLDU` olarak izler.

Geçmiş sekmesi gerçek emir, gerçekleşme veya portföy kaydı değildir. Bir mum içinde önce hedefe mi stopa mı dokunulduğunu bilmez; yalnızca tarama anındaki kapanmış fiyatı görür. Bu nedenle gösterdiği hedef oranı gerçek strateji performansıyla aynı kabul edilmemelidir.

## Emir planının sınırı

Seviyeler gerçek emir değildir. Stop-limit tetiklendiğinde yalnızca limit emir oluşur; sert fiyat boşluğunda piyasa stop-limit fiyatının altına geçerse emir gerçekleşmeyebilir. Kripto 24/7 işlem gördüğü için bu risk hafta sonu da devam eder.

FinPilot pozisyon büyüklüğünü veya sermayenin ne kadarını kullanacağını söylemez. Gerçek para düşünmeden önce sinyalleri en az 30 seans/uygun sayıda 4 saatlik dönem boyunca kâğıt üzerinde izle.

## Veri ve hata davranışı

- BIST günlük ve gecikmeli/kapanmış veridir; gün içi otomatik al-sat için tasarlanmamıştır.
- Kriptoda devam eden 4 saatlik mum analiz dışıdır; yalnızca kapanan mumlar kullanılır.
- KAP güncel akışı eski veya erişilemezse olumlu BIST sinyali kilitlenir. Sistem gerekirse şirket sayfası aramasına geri döner.
- BIST veya Binance taraflarından biri tamamen hata verse bile diğer piyasa sonucu gösterilir.
- Bir havuzun `%70`inden azı okunursa o piyasanın olumlu sinyali kapanır.
- Uyarılar panelin altındaki **veri uyarısı** bölümünde sembol bazında görünür.

## TradingView Pine araçları — isteğe bağlı

Chrome paneli için Pine kodu kurmak zorunda değilsin. Grafik üzerinde ayrıca teknik teyit istersen:

- `tradingview/FinPilot_Watchlist_Scanner_v1.pine`: Pine Screener sıralama göstergesi
- `tradingview/FinPilot_Adaptive_Agent_v1.pine`: seçilen grafikte geçmiş strateji testi

Pine kodunu Not Defteri ile aç, TradingView'deki **Pine Editor** alanına yapıştır, **Save** ve **Add to chart** düğmelerine bas. Pine KAP'ı, İş Yatırım temel tablosunu ve Chrome motorundaki bütün stres araştırmasını okuyamadığı için Pine'daki ön aday nihai `YATIR` değildir.

## Önemli gerçek

Geçmiş test, yerel model veya yüksek puan gelecekte kârı garanti etmez. `%90` veya `%100` kesin kazanma oranı güvenilir biçimde vaat edilemez. Piyasalar mantık ve araştırmayla daha disiplinli yönetilebilir; yine de gelecekteki haber, likidite, fiyat boşluğu ve rejim değişimi önceden kesin bilinemez.

Uzantı İş Yatırım, Borsa İstanbul, KAP, Binance veya TradingView tarafından yayımlanmış resmî bir ürün değildir. Kaynak veriyi ticari veri yayını olarak yeniden dağıtma; sağlayıcıların kullanım koşulları geçerlidir.

## Kaynak sayfaları

- [İş Yatırım — Tarihsel Fiyat Bilgileri](https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Tarihsel-Fiyat-Bilgileri.aspx)
- [İş Yatırım — Temel Hisse Değerleri ve Oranları](https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx)
- [Borsa İstanbul — BIST Pay Endeksleri](https://www.borsaistanbul.com/endeksler/bist-pay)
- [KAP — BIST Şirketleri](https://kap.org.tr/tr/bist-sirketler)
- [KAP — Bildirim Sorgu](https://kap.org.tr/tr/bildirim-sorgu)
- [Binance Developers — Public Market Data](https://developers.binance.com/en/docs/products/spot/faqs/market_data_only)
- [Binance Developers — Spot REST API](https://developers.binance.com/en/docs/binance-spot-api-docs/rest-api)
- [TradingView — Fiyat/indikatör verisi için halka açık API bulunmaması](https://www.tradingview.com/support/solutions/43000474413-i-need-access-to-your-api-in-order-to-get-data-or-indicator-values/)
- [TradingView — Pine Screener gereksinimleri](https://www.tradingview.com/support/solutions/43000742436-tradingview-pine-screener-key-features-and-requirements/)
