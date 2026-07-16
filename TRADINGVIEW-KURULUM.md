# FinPilot Multi-Market v3.1 — Ultimate Kurulum

FinPilot geniş BIST ve Binance USDT spot evrenini kendi tarar; `YATIR`/`YATIRMA`, yön olasılıkları, alış limiti ve stop-limit araştırma planı üretir. Gerçek emir göndermez, İş Bankası/İş Yatırım veya Binance hesabına bağlanmaz ve kullanıcı adı, şifre ya da API anahtarı istemez.

## En kısa kurulum

1. ZIP dosyasını bir klasöre çıkar.
2. `TRADINGVIEW-KURULUMUNU-AC.bat` dosyasına çift tıkla.
3. Açılan `chrome://extensions` sayfasında sağ üstten **Geliştirici modu**nu aç.
4. **Paketlenmemiş öğe yükle** düğmesine bas ve paketteki `extension` klasörünü seç.
5. TradingView'i aç. Sağ alttaki **✦ AI** düğmesine veya Chrome araç çubuğundaki FinPilot simgesine bas.

İlk açılışta kayıt yoksa tarama kendiliğinden başlar. Chrome açıkken kapanmış dört saatlik mum sınırından yaklaşık beş dakika sonra yenilenir. Tek isteğe bağlı ayar **kâğıt sermaye** tutarıdır; adet ve azami TL kayıp bunun üzerinden hesaplanır. Tarama için **ŞİMDİ TÜM PİYASALARI ARAŞTIR** düğmesi dışında sembol, fiyat veya CSV girilmez.

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
2. Güçlü/zayıf trend, yatay, yüksek oynaklık, risk-off ve ani hareket rejimi
3. Dört model arasında rejim uyumlu champion/challenger seçimi
4. EMA trendi, RSI, MACD, ATR, kırılım ve hacim
5. Komisyon, fiyat kayması ve gap içeren geçmiş simülasyon
6. Sabit kurallı, yalnız önceki dönemden seçim yapan anchored walk-forward testi
7. PBO ve Deflated Sharpe yaklaşımıyla aşırı uyum denetimi
8. Zaman sırası korunmuş yerel lojistik model ve olasılık kalibrasyonu
9. Benzer geçmiş dönemlerden üç vadeli yön olasılığı ve beklenen aralık
10. Yakın dönem performansı ve 250 senaryolu stres testi
11. Piyasa özel temel/KAP olayları veya likidite/BTC kapıları
12. Destek, EMA ve ATR tabanlı üç emir planı
13. Açık kâğıt işlemlerle korelasyon, sektör ve piyasa yoğunluğu sınırı
14. OHLC, tekrar zaman, uç hareket ve zaman boşluğu için veri karantinası
15. BIST gün/hafta/ay veya kripto 4 saat/gün/hafta çoklu zaman teyidi
16. Piyasa medyanı ve kriptoda BTC karşısında göreli güç
17. Tahmin aralığı genişliğine göre güvenilirlik kapısı
18. Kriptoda anlık bid/ask spread ve fiyat adımı denetimi
19. Kâğıt sermayeden adet, pozisyon tutarı ve azami TL kayıp
20. Toplam stop riski ile BIST `-%10` / kripto `-%20` portföy şoku
21. Kâğıt sonuçlarda performans ve Brier kalibrasyon sürüklenmesi kilidi
22. Son taramadan beri karar değişimi ve tam sonraki koşul günlüğü

| Etiket | Anlamı |
| --- | --- |
| **YATIR** | O taramadaki tüm zorunlu kapılar geçti. Yine de kazanç garantisi değildir. |
| **YATIRMA** | En az bir kapı geçmedi veya doğrulanamadı. Kart “Ne değişmeli?” alanında gerçekleşen değerleri ve gerekli eşikleri gösterir. |
| **YATIR'a en yakın** | Olumlu skoru olan fakat en fazla üç zorunlu kapısı eksik sonuçtur. Emir planı etkinleşmez. |

Sistem olumlu sonuç sayısını artırmak için eşikleri gevşetmez. Hiç `YATIR` görünmemesi hata olmak zorunda değildir; sıkı kurallarda normal bir sonuçtur.

Aynı piyasa-strateji çiftinde en az 12 sonuç izlendikten sonra pozitif sonuç oranı `%40`ın veya ortalama sonuç `0R`ın altına inerse performans koruması o modelin yeni `YATIR` üretmesini durdurur. Bu kayıtlar otomatik kâğıt işlemdir; gerçek işlem geçmişi sayılmaz.

## Panel sekmeleri

- **Tümü:** BIST ve kripto sonuçlarını geçerli sinyal, yakın sonuç ve puana göre birleştirir.
- **BIST:** Yalnızca hisse kartlarını ve KAP/temel metriklerini gösterir.
- **Kripto:** Yalnızca spot kripto kartlarını, 24 saatlik hacmi ve hareketi gösterir.
- **Takip:** En fazla üç eksik kapısı kalan varlıkları otomatik izler; önceki taramaya göre kaç kapı yaklaştığını gösterir.
- **Geçmiş:** `YATIR` sinyalini önce `EMİR BEKLİYOR` olarak kaydeder. Limit sonraki yeni kapanmış mumda görülürse `AKTİF`; ilk hedefte yarım çıkıştan sonra `TAŞINAN STOP`; sonrasında `HEDEF 2`, `STOP`, `SÜRESİ DOLDU` veya `KURULUM BOZULDU` olarak izler.

Geçmiş sekmesi gerçek emir, gerçekleşme veya portföy kaydı değildir. Kapanmış mumun açık-yüksek-düşük-kapanış aralığını kullanır; bir mum içinde önce hedefe mi stopa mı dokunulduğu bilinmediğinde stopu önce kabul eder. Limit sinyal mumunda değil, yalnız sonraki yeni mumda dolabilir. Bu muhafazakâr varsayımlar yine de gerçek aracı kurum dolumunu kanıtlamaz.

## Emir planının sınırı

Sistem destek geri çekilmesi, EMA yeniden testi ve ATR dengeli planı ayrı ayrı sınar; geçerli olanlar içinden seçilen stratejiye uygun planı öne alır. Seviyeler gerçek emir değildir. Stop-limit tetiklendiğinde yalnızca limit emir oluşur; sert fiyat boşluğunda piyasa stop-limit fiyatının altına geçerse emir gerçekleşmeyebilir. Kripto 24/7 işlem gördüğü için bu risk hafta sonu da devam eder.

FinPilot portföy yoğunluğuna göre en fazla `%0,50` başlangıç risk bütçesi kullanır. Girilen kâğıt sermayeden aşağı yuvarlanmış adet, pozisyon tutarı ve stop gerçekleşirse yaklaşık azami TL kaybı gösterir; bunlar gerçek emir değildir. Gerçek para düşünmeden önce sinyalleri en az 30 seans/uygun sayıda 4 saatlik dönem boyunca kâğıt üzerinde izle.

## Veri ve hata davranışı

- BIST günlük ve gecikmeli/kapanmış veridir; gün içi otomatik al-sat için tasarlanmamıştır.
- Kriptoda devam eden 4 saatlik mum analiz dışıdır; yalnızca kapanan mumlar kullanılır.
- KAP güncel akışı eski veya erişilemezse olumlu BIST sinyali kilitlenir. Sistem gerekirse şirket sayfası aramasına geri döner.
- BIST veya Binance taraflarından biri tamamen hata verse bile diğer piyasa sonucu gösterilir.
- Bir havuzun `%70`inden azı okunursa o piyasanın olumlu sinyali kapanır.
- Uyarılar panelin altındaki **veri uyarısı** bölümünde sembol bazında görünür.

## TradingView Ultimate ile önerilen kurulum

Chrome paneli Pine koduna ihtiyaç duymaz. Ultimate üyeliği iki ayrı işte kullanılır:

| Araç | Dosya | İşlev |
| --- | --- | --- |
| Pine Screener radarı | `tradingview/FinPilot_Watchlist_Scanner_v1.pine` | İzleme listesindeki sembolleri çoklu zaman, göreli güç, veri sağlığı ve teknik puanla ön elemeden geçirir. |
| Kâğıt strateji | `tradingview/FinPilot_Adaptive_Agent_v1.pine` | Seçilen grafikte limit giriş, ATR stop, iki hedef, trailing stop, risk/adet ve koruma kurallarını backtest eder. |

### 1. Pine Screener radarı

1. Radar dosyasını düz metin olarak açıp tamamını TradingView **Pine Editor** alanına yapıştır.
2. **Save** ve **Add to chart** ile kaydet; kişisel Pine göstergelerin arasında görünür.
3. TradingView'de Pine Screener'ı aç, taranacak BIST veya Binance USDT izleme listesini seç ve gösterge olarak **FinPilot Ultimate Radar v3.1** kullan.
4. İlk filtreyi `On karar = 1` yap. Yardımcı sıralamada `Birleşik Puan`, `Çoklu Zaman Uyum`, `20 Bar Göreli Güç %`, `Veri Sağlığı`, `ATR %` ve `ADX` sütunlarını kullan.
5. Radar sonucu yalnız teknik **ön adaydır**. Chrome kartı KAP/temel, walk-forward, tahmin güveni, spread ve portföy stresini de geçmeden nihai `YATIR` yazmaz.

Radar özellikle Pine Screener'ın belgelenen sınırlarına göre hazırlanmıştır: tam 5 `request.*`, 10 `plot` ve 2 alarm koşulu kullanır. Screener tek göstergenin ilk 10 çıktısını ve son 500 barı işler; bu nedenle dosyaya rastgele ek plot/request ekleme.

### 2. Kâğıt strateji ve Deep Backtesting

1. Strateji dosyasını ayrı bir Pine betiği olarak kaydet ve standart mum grafiğine ekle. Heikin Ashi/Renko gibi standart dışı grafiklerde karar kapısı kapanır.
2. BIST için başlangıçta `1G`, kripto için `4s` grafik kullan. Betik üst zamanları otomatik olarak günlük/haftalık veya haftalık/aylık teyit eder.
3. **Strategy Tester → Deep Backtesting** ile farklı piyasa dönemlerini ayrı ayrı sınayarak sonuçların tek döneme bağlı olup olmadığını kontrol et.
4. `Use Bar Magnifier` kodda açıktır. Ultimate geçmiş bar kapsamı ve alt zaman verisi elverdiğinde limit/stop dolumlarını daha gerçekçi simüle eder.
5. Komisyon, kayma ve başlangıç sermayesini kendi gerçekçi koşullarına göre değiştir. Sonuç yalnız bu varsayımlar altında geçerlidir.
6. Strateji önce sıkı ex-ante koşullarla kâğıt işlem üretir; en az işlem sayısı oluşunca geçmiş kazanma, kâr faktörü ve beklenen değer kapısını ayrıca gösterir. Kâğıt veri oluşmadan “geçmiş kapısı”nı giriş şartı yapmak sıfır işlemli bir döngü yaratacağı için yapılmamıştır.

### 3. Ultimate alarmları

- Radar için `FinPilot YATIR ön adayı` ve `FinPilot aday bozuldu` koşullarını yalnız **bar kapanışında** çalışacak şekilde kur.
- Strateji alarmında `Order fills and alert() function calls` seçeneğini kullan. Giriş mesajı sembol, zaman dilimi, puan, çoklu zaman puanı, göreli güç, limit, stop ve kâğıt adetini JSON olarak taşır.
- Webhook kullanacaksan TradingView iki aşamalı doğrulama ister. Webhook gövdesine parola, banka/borsa anahtarı veya başka bir sır koyma.
- FinPilot bu webhookları aracı kuruma iletmez. Ultimate üyelik de tek başına otomatik emir yetkisi veya TradingView piyasa-veri API'si sağlamaz.

Ultimate planının yüksek alarm ve grafik limitleri daha fazla izleme listesi ve paralel teyit kurmaya yarar; kâr olasılığını garanti etmez. Pine KAP'ın güncel metnini, İş Yatırım temel tablosunu veya Chrome motorundaki bütün stres araştırmasını okuyamaz.

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
- [TradingView — Plan karşılaştırması ve Ultimate limitleri](https://www.tradingview.com/pricing/)
- [TradingView — Webhook alarm kurulumu](https://www.tradingview.com/support/solutions/43000529348-how-to-configure-webhook-alerts/)
- [TradingView — Bar Magnifier](https://www.tradingview.com/support/solutions/43000669285-what-is-bar-magnifier-backtesting-mode/)
