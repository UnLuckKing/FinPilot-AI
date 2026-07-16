# FinPilot BIST Araştırma Paneli v1.2 — Kurulum

FinPilot gerçek emir göndermez; BIST hisselerini kendi tarar ve `YATIR`/`YATIRMA` araştırma sonucunu gerekçeleriyle getirir. CSV, sembol, fiyat, sermaye veya işlem girişi istemez.

## En kısa kurulum

1. ZIP dosyasını bir klasöre çıkar.
2. `TRADINGVIEW-KURULUMUNU-AC.bat` dosyasına çift tıkla.
3. Açılan `chrome://extensions` sayfasında sağ üstten **Geliştirici modu**nu aç.
4. **Paketlenmemiş öğe yükle** düğmesine bas ve paketteki `extension` klasörünü seç.
5. TradingView'i aç. Sağ alttaki **✦ AI** düğmesine veya Chrome araç çubuğundaki FinPilot simgesine bas.

Panel ilk açılışta kayıtlı sonuç yoksa taramayı kendiliğinden başlatır. Sonraki sonuçlar Chrome açıkken yaklaşık 12 saatte bir yenilenir. İstersen tek manuel kontrol olan **ŞİMDİ OTOMATİK ARAŞTIR** düğmesiyle anında yenileyebilirsin.

İş Bankası/İş Yatırım hesabı, kullanıcı adı, şifre, API anahtarı veya ücretli veri paketi gerekmez; çünkü uzantı emir göndermez ve hesabına bağlanmaz.

## Panel ne yapar?

- Resmî İş Yatırım tarihsel fiyat sayfasındaki günlük fiyat ve hacim verisini alır.
- İş Yatırım'ın resmî temel değerler tablosundan şirketin sektörünü, F/K, FD/FAVÖK, FD/Satışlar ve PD/DD oranlarını alır; mutlak bir eşik yerine aynı sektördeki şirketlerle karşılaştırarak değerleme puanı üretir.
- Borsa İstanbul'un resmî endeks dosyası erişilebilirse BIST 30 kapsamını kullanır; dosya geçici olarak erişilemiyorsa likit 30 hisselik yedek havuza geçer.
- Her hisse için EMA trendi, RSI, MACD, kırılım, ATR, oynaklık ve hacim teyidi hesaplar.
- Komisyon ve fiyat kayması eklenmiş geçmiş işlem simülasyonu yapar.
- Geçmiş başarıyı küçük örneklem yanılgısına karşı yumuşatır ve `%95` güven aralığı gösterir.
- Veriyi zaman sırasını bozmadan eğitim/test olarak ayıran yerel lojistik modelle ikinci kontrol yapar.
- Geçmişteki benzer piyasa dönemlerini ölçerek 1, 5 ve 20 işlem günü için yükseliş/düşüş/yatay olasılığı ve beklenen fiyat aralığı üretir.
- Yakın dönem performansının bozulmadığını ve 250 senaryolu stres testinin yeterli olduğunu doğrular.
- En güçlü ön adayların KAP bildirimlerini araştırır. KAP erişilemezse veya tanımlı yakın risk işareti varsa güvenlik gereği `YATIRMA` verir.
- Yalnızca en az 20 geçmiş işlem, en az `1,25` kâr faktörü, pozitif beklenen değer, temel veri, kronolojik model, yön, yakın dönem, stres, emir planı, veri tazeliği, KAP ve piyasa kapıları birlikte geçtiğinde `YATIR` verir.
- Likit havuzda yükseliş trendi `%35` altındaysa piyasa risk kapısını kapatır.
- Havuzun `%70`inden azında sağlıklı veri alınırsa eksik sonuçtan öneri üretmez ve `YATIRMA · tarama verisi yetersiz` der.

## Sonuçların anlamı

| Etiket | Anlamı |
| --- | --- |
| **YATIR** | Bütün yerel veri, geçmiş test, yön, stres, KAP, tazelik ve piyasa kapıları o taramada geçti. Bir kazanç garantisi değildir. |
| **YATIRMA** | En az bir zorunlu kapı geçmedi veya doğrulanamadı. Sistem eksik veride olumlu karar üretmez. |

Her kartta şunlar görünür:

- Alış limiti
- Stop tetik ve stop-limit seviyesi
- İki kademeli hedef
- 1, 5 ve 20 günlük yön olasılıkları ile beklenen aralık
- Geçmiş kazanma olasılığı ve güven aralığı
- Kâr faktörü, yakın dönem beklentisi ve stres testi
- Sektör içi temel değerleme puanı ve oranların rapor dönemi
- KAP kontrolü ve bütün güvenlik kapıları
- TradingView grafiği, İş Yatırım şirket kartı ve KAP bağlantıları

Seviyeler gerçek emir değildir. Stop-limit tetiklendiğinde yalnızca limit emir oluşur; sert fiyat boşluğunda fiyat limitin altına geçerse emir hiç gerçekleşmeyebilir. Bu nedenle stop-limit “kesin zarar sınırı” değildir.

## Veri zamanı ve sınırlar

FinPilot kısa vadeli/al-sat robotu değildir. İş Yatırım tarihsel verisiyle günlük analiz yapar; panelde veri tarihi ayrıca yazılır. Resmî sayfadaki piyasa verileri en az 15 dakika gecikmeli olabilir ve tarihsel seri çoğunlukla kapanmış seansları temsil eder. Bu nedenle gün içi anlık emir için kullanılmamalıdır.

Bir hissede veri alınamazsa diğer hisselerin taraması devam eder ve hata ayrıntısı panelin altında gösterilir. Resmî Borsa İstanbul kapsam dosyası bakımda olursa sistem taramayı durdurmak yerine yedek likit havuzu açıkça etiketler.

## TradingView Pine araçları — isteğe bağlı

Otomatik Chrome paneli için Pine kodu kurmak zorunda değilsin. TradingView içinde ayrıca kontrol yapmak istersen iki dosya hazırdır:

- `tradingview/FinPilot_Watchlist_Scanner_v1.pine`: Pine Screener için sıralama göstergesi
- `tradingview/FinPilot_Adaptive_Agent_v1.pine`: Seçilen grafikte geçmiş strateji testi

Kurulum:

1. Dosyayı Not Defteri ile aç ve tamamını kopyala.
2. TradingView grafiğinin altındaki **Pine Editor** alanına yapıştır.
3. **Save** ve **Add to chart** düğmelerine bas.

Pine Screener kullanacaksan göstergeyi favorilere ekleyip **Products → Screeners → Pine** bölümünde seç. `Ön karar = 1` yalnızca teknik ön adayı gösterir. Pine KAP bildirimlerini ve Chrome motorundaki stres araştırmasını okuyamadığı için nihai `YATIR` kararı sayılmaz. TradingView, Pine Screener'da tek göstergeyi ve son 500 barı işler; taranan kodda en fazla beş ayrı `request.*()` çağrısına izin verir. Hazır gösterge bu sınır için kontrol edilmiştir.

## Önemli gerçek

Geçmiş test, yerel model veya yüksek puan gelecekte kârı garanti etmez. `%90` ya da `%100` kesin kazanma oranı güvenilir biçimde vaat edilemez. FinPilot bu yüzden zayıf piyasada zorla hisse önermez; `YATIRMA` sistemin normal ve gerekli çıktısıdır. Gerçek para düşünmeden önce en az 30 seans kâğıt üzerinde izleme önerilir.

Uzantı banka veya aracı kurum şifresi istemez, gerçek para işlemi yapmaz ve İş Yatırım/TradingView tarafından yayımlanmış resmî bir ürün değildir. Gösterilen sonuçlar kişisel araştırma ve karar desteğidir.

Veri yalnızca kendi tarayıcında analiz edilir. Kaynak veriyi veya panel çıktısını ticari veri yayını olarak yeniden dağıtma; ilgili sağlayıcıların kullanım ve telif koşulları geçerlidir.

## Resmî kaynak sayfaları

- [İş Yatırım — Tarihsel Fiyat Bilgileri](https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Tarihsel-Fiyat-Bilgileri.aspx)
- [İş Yatırım — Temel Hisse Değerleri ve Oranları](https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx)
- [Borsa İstanbul — BIST Pay Endeksleri](https://www.borsaistanbul.com/endeksler/bist-pay)
- [KAP — BIST Şirketleri](https://kap.org.tr/tr/bist-sirketler)
- [KAP — Bildirim Sorgu](https://kap.org.tr/tr/bildirim-sorgu)
- [TradingView — Pine Screener gereksinimleri](https://www.tradingview.com/support/solutions/43000742436-tradingview-pine-screener-key-features-and-requirements/)
- [TradingView — Stop-limit emirlerinin çalışma şekli](https://www.tradingview.com/support/solutions/43000754945-understanding-stop-limit-orders/)
