# FinPilot TradingView Analyzer v2.1

FinPilot artık ayrı site veya masaüstü uygulaması değildir. Chrome/Edge içinde, TradingView grafiğinin yanında açılan Manifest V3 yan panel eklentisidir.

## Ne yapar?

- TradingView'de açık sembolü ve borsayı otomatik algılar.
- 15 dakika, 1 saat, 4 saat ve günlük kapanmış mumları ayrı ayrı inceler.
- 1 gün ve 1 hafta için `YÜKSELİŞ`, `YATAY/BELİRSİZ` veya `DÜŞÜŞ` yönü verir.
- LONG ve SHORT yönlerini birbirinin tersi saymadan, ayrı kurulum ve risk kapılarıyla değerlendirir.
- `YATIR`, `YATIRILABİLİR — SEN BİLİRSİN`, `SHORT — DÜŞÜŞ İŞLEMİ`, `DÜŞÜŞ — UZAK DUR`, `BEKLE`, `YATIRMA` veya `VERİ YETERSİZ` kararı üretir.
- Her yön için doğru tarafta giriş aralığı, kovalama sınırı, stop, iki hedef, R/R ve örnek risk adedi hesaplar.
- Grafik sekmesi her açılışta sembolü yeniden okur; eksik içerik betiğini kendisi yükleyip tekrar dener.
- Algılanan sembolün kaynağını, güvenini ve ne zaman okunduğunu açıkça gösterir.
- TradingView izleme listesinden ve açık grafikten bağımsız **Otomatik Küresel Radar** içerir.
- Panel açılır açılmaz BIST, ABD, Binance spot kripto, forex, endeks ve emtia/vadeli piyasalarını birlikte tarar.
- KAP'taki güncel BIST şirket kodlarını, Binance spot evrenini ve ABD aktif fırsat listelerini otomatik keşfeder.
- Önce bütün keşfedilen evrene çift yönlü hızlı ön eleme uygular; güçlü LONG ve güçlü düşüş adaylarını dengeli biçimde derin analize alır.
- Piyasa düğmeleri yeni tarama başlatmaz; tamamlanan küresel sonuçları anında filtreler.
- Tarama sırasında sonuçları anlık ekler; en iyi LONG ile en iyi düşüş/SHORT adayını ayrıca seçer.
- Bir sonuca dokununca TradingView'deki doğru sembolü aynı sekmede açar ve Grafik analizini yeniden eşitler.
- Hiç `YATIR` yoksa sonucu uydurmaz; en yakın adayları ve eksik kapıları gösterir.
- LONG ve SHORT adaylarının hedef/stop sonuçlarını yalnız tarayıcıda izler; başarı aralıklarını yönlere göre ayrı gösterir.
- Stop olan aynı kurulumda bir saatlik soğuma uygular; farklı ve yeni kurulum oluşmadan tekrar sinyal kaydetmez.

Eklenti emir göndermez, Midas/İş Bankası/Binance hesabına bağlanmaz ve şifre istemez. TradingView doğru tahmine ödeme yapmaz; gerçek düşüş işlemi için açığa satış veya uygun türev ürün gerekir.

## Veri kaynakları

- `BINANCE:` kripto sembollerinde Binance'ın açık piyasa verisi kullanılır.
- BIST, ABD hisseleri, ETF, endeks, forex ve bazı vadeli/emtia sembollerinde genel piyasa grafiği verisi kullanılır.
- Kaynak başarısız, eski, gecikmiş veya sembol eşlemesi belirsizse sistem `VERİ YETERSİZ` verir.

TradingView veri veya indikatör değerlerini dışarı veren genel bir API sağlamaz. Bu nedenle eklenti TradingView'in özel WebSocket trafiğini taklit etmez ve sayfanın gizli iç durumuna bağlanmaz. Bu tercih güncellemelerde daha güvenli davranmak içindir.

## Tarama kapsamı

`Tüm Piyasalar`, dünyadaki milyonlarca ürüne ayrı ayrı yüzlerce mum isteği gönderdiğini iddia etmez. Bunun yerine piyasa çapında keşif → hızlı ön eleme → derin analiz hunisi kullanır:

- KAP tarafından yayımlanan güncel BIST şirket/sembol evreni
- ABD'deki en aktif, yükselen, düşen, büyüme, likidite ve yoğun açığa satış ekranlarından dinamik adaylar
- Binance'taki bütün işlem gören USDT spot çiftlerinin hacim sıralaması
- 38 majör, minör ve seçili gelişen ülke forex çifti
- Başlıca endeks, metal, enerji, tarım ve vadeli ürünler
- Küresel ülke, sektör, tahvil ve emtia ETF'leri

Keşfedilen sayı ile derin analiz edilen sayı ekranda ayrı gösterilir. Piyasa filtreleri taramayı yeniden başlatmaz. İlk BIST ön elemesi veri sağlayıcının hızına göre uzun sürebilir; günlük sıralama dört saat saklandığı için sonraki taramalar daha hızlıdır. Tarama Chrome açıkken 15 dakikada bir otomatik yenilenir.

Her taramada onaylı LONG veya SHORT çıkması matematiksel olarak garanti değildir. Sistem, eşiği düşürüp sahte sonuç üretmek yerine en güçlü doğrulanabilir adayları sıralar.

## Kurulum

`KURULUM.md` dosyasını izleyin. ZIP'i doğrudan mağazaya yüklemeyin; önce klasöre çıkarıp `chrome://extensions` sayfasından **Paketlenmemiş öğe yükle** seçeneğini kullanın.

## Kararların anlamı

| Karar | Anlamı |
|---|---|
| `YATIR` | Veri sağlıklı, çoklu zaman dilimi uyumlu, geçerli kurulum ve yeterli R/R var. |
| `YATIRILABİLİR — SEN BİLİRSİN` | Plan geçerli fakat güçlü karar için bir veya daha fazla yumuşak teyit eksik. |
| `SHORT — DÜŞÜŞ İŞLEMİ` | Ayrı düşüş modeli teyitli ve sembol türü çift yönlü plan üretmeye uygun; yine de aracı kurum/ürün kontrolü gerekir. |
| `SHORT ADAYI — SEN BİLİRSİN` | Düşüş planı geçerli fakat güçlü teyitlerin bir bölümü eksik. |
| `DÜŞÜŞ — UZAK DUR` | Düşüş modeli güçlü; ancak spot ürün veya açığa satış uygunluğu doğrulanmadığı için SHORT işlemi önerilmez. |
| `BEKLE` | Yön oluşabilir; giriş bölgesi gelmemiş, teyit eksik veya fiyat fazla uzamış. |
| `YATIRMA` | LONG ve SHORT için güvenli kurulum yok. |
| `VERİ YETERSİZ` | Kaynak, tazelik, geçmiş veya sembol eşlemesi yeterli değil. |

Paneldeki `Teknik Güç`, gerçek kazanma olasılığı değildir. Gerçek sonuçlar yalnız kapanmış aday sinyallerinden hesaplanır ve LONG/SHORT olarak ayrılır.

## Geliştirici kontrolü

```bash
npm run check
```

Proje harici JavaScript paketi veya uzaktan çalıştırılan kod kullanmaz.
