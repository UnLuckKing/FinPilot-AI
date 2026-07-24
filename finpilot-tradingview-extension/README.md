# FinPilot TradingView Analyzer v2.2 Free

FinPilot, Chrome/Edge içinde TradingView grafiğinin yanında açılan Manifest V3 karar destek eklentisidir. TradingView ücretli paketine, webhook'a, Pine alarmına veya aracı kurum bağlantısına ihtiyaç duymaz.

## v2.2 Free ne yapar?

- Açık TradingView sembolünü ve borsayı otomatik algılar; eksik içerik betiğini kendisi yeniden yükler.
- Aynı sembol için birbirinden bağımsız iki karar üretir:
  - `15 DK`: kapanmış 15 dakikalık mumla onaylanan, yaklaşık bir saatlik giriş/takip planı.
  - `1–5 GÜN`: günlük kapanışla hesaplanan ayrı swing planı.
- LONG ve SHORT modellerini birbirinin basit tersi olarak kullanmaz.
- Kararı açıkça `15 DK ONAYLI AL`, `15 DK AL ADAYI`, `1–5 GÜN AL`, `SHORT`, `DÜŞÜŞ — UZAK DUR`, `BEKLE`, `İŞLEM YOK` veya `VERİ YETERSİZ` olarak gösterir.
- Her vade için ayrı giriş bölgesi, kovalama sınırı, stop, Kâr 1, Kâr 2, R/R, geçerlilik ve risk adedi hesaplar.
- Piyasa rejimini `trend`, `yatay`, `yüksek oynaklık` veya `geçiş` olarak belirler.
- Trend devamı, geri çekilme, kırılım/yeniden test ve bant dönüşü modellerini **Strateji Turnuvası** içinde karşılaştırır.
- İşlem yaşam döngüsünü `İzle → Tetik → Giriş → Kâr 1 → Stop maliyete → Çıkış` olarak izler.
- Fiyat giriş bölgesine değmeden hedefe gitmişse bunu kazanılmış işlem saymaz.
- Aynı mumda giriş, stop ve hedef birlikte görünürse kullanıcı lehine sonuç şişirmemek için stopu önce kabul eder.
- Kâr 1 sonrası kâğıt takip stopunu giriş maliyetine taşır.
- Stop sonrası aynı sembol/vade/kurulum için soğuma uygular; ardışık kayıplarda örnek riski artırmak yerine düşürür.
- Yeterli ileriye dönük sonuçta negatif beklenti üreten modeli otomatik `KARANTİNA` durumuna alır.
- Yeni doğrulanan fırsatları yerel **Fırsat Kutusu** içinde saklar ve Chrome açıkken bildirim verir.

## Otomatik piyasa radarı

Eklenti açık grafikten bağımsız olarak aşağıdaki evrenleri keşif → hızlı ön eleme → derin analiz hunisiyle tarar:

- KAP'tan keşfedilen BIST şirket kodları
- ABD aktif, yükselen, düşen, büyüme ve likidite ekranlarından gelen adaylar
- Binance'taki likit USDT spot çiftleri
- Majör/minör forex çiftleri
- Başlıca endeks, emtia, vadeli ürün ve küresel ETF'ler

Tarama Chrome açıkken 15 dakikada bir yenilenir. Dünyadaki her finansal ürüne gerçek zamanlı veri sağlandığını iddia etmez; ücretsiz sağlayıcı kapsamı, gecikme veya kota nedeniyle doğrulanamayan sembolde `VERİ YETERSİZ` üretilir.

## İşlem yaşam döngüsü

1. Sinyal kapanmış mumla oluşur.
2. Aday sinyalde önce tetik seviyesi beklenir.
3. Fiyat giriş aralığına değerse otomatik kâğıt takip başlar.
4. Stop ve hedefler yalnız girişten sonraki mumlarda değerlendirilir.
5. Kâr 1 görülürse kâğıt stop maliyete taşınır.
6. Kâr 2, stop, maliyet koruması veya süreli çıkış sonucu kaydedilir.
7. Giriş gerçekleşmemiş planlar başarı hesabına katılmaz.

Bu takip kullanıcının gerçek aracı kurum pozisyonu değildir. Uzantı emir göndermez ve kullanıcının gerçekten işlem açıp açmadığını bilemez.

## Otomatik Plan B

- Aynı kurulum stop olduktan sonra 15 dakikalık modelde bir saat, swing modelde bir gün soğuma uygulanır.
- Bir ardışık kayıpta örnek risk `%0,35`, iki ardışık kayıpta `%0,25` olur; martingale yapılmaz.
- Aynı strateji en az 12 ileriye dönük işlemde negatif beklenti veya yüksek stop oranı üretirse yeni sinyal geçici olarak engellenir.
- Risk hesabı yalnız yerel kâğıt sonuçlara dayanır ve gerçek portföy bakiyesini bilmez.

## Veri ve güvenlik

- Binance kripto sembollerinde Binance açık piyasa verisi kullanılır.
- Diğer desteklenen piyasalarda genel Yahoo grafik verisi kullanılır.
- KAP yalnız BIST sembol evrenini keşfetmek için kullanılır; açıklama metinleri yapay zekâyla yorumlanmaz.
- Eklenti Midas, İş Bankası, Binance hesabı veya başka bir aracı kuruma bağlanmaz.
- Şifre/API anahtarı istemez, uzak JavaScript çalıştırmaz ve telemetri göndermez.
- Sonuçlar yalnız `chrome.storage.local` içinde saklanır.

## Kararların anlamı

| Etiket | Anlamı |
|---|---|
| `15 DK ONAYLI AL` | Kapanmış 15 dk mumda LONG kurulumu ve giriş koşulları onaylıdır; plan yaklaşık bir saatliktir. |
| `15 DK AL ADAYI` | Yön ve plan vardır fakat tetik için sonraki kapanış gerekir. |
| `1–5 GÜN AL` | Günlük yapı ve swing kurulumu onaylıdır; ayrı günlük stop/hedef kullanılır. |
| `SHORT` | Düşüş kurulumu vardır; gerçek işlem için SHORT destekleyen ürün ve aracı kurum gerekir. |
| `DÜŞÜŞ — UZAK DUR` | Düşüş modeli güçlüdür ancak spot/açığa satış uygunluğu doğrulanmamıştır. |
| `BEKLE` | Giriş bölgesi, teyit veya ödül/risk henüz uygun değildir. |
| `PLAN B` | Stop soğuması veya model karantinası yeni işlemi engellemiştir. |
| `VERİ YETERSİZ` | Kaynak, tazelik, geçmiş veya sembol eşlemesi yeterli değildir. |

`Teknik Güç` gerçek olasılık değildir. Hiçbir sinyal kâr garantisi vermez.

## Geliştirici kontrolü

```bash
npm run check
```

Proje harici JavaScript paketi veya uzaktan çalıştırılan kod kullanmaz.
