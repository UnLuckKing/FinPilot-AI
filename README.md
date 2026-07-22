# FinPilot Universal Analyzer v2

FinPilot, TradingView içindeki piyasa verilerini kullanarak **manuel işlem kararı** üreten çoklu piyasa analiz sistemidir. Hisse, ETF, kripto, forex, vadeli, endeks ve emtia için ayrı eşikler uygular; otomatik emir göndermez ve aracı kurum hesabına bağlanmaz.

## Verdiği kararlar

| Karar | Anlamı |
|---|---|
| `YATIR` | Kapanmış mum, sağlıklı veri, üst zaman teyidi, geçerli kurulum ve yeterli ödül/risk birlikte sağlandı. |
| `YATIRILABİLİR — SEN BİLİRSİN` | İşlem planı geçerli fakat güçlü karar için bir veya daha fazla yumuşak teyit eksik. |
| `BEKLE` | Yön olumlu olabilir; giriş bölgesi gelmedi, fiyat kaçtı veya kurulum henüz tamamlanmadı. |
| `YATIRMA` | Yön/risk yapısı uygun değil veya sert engel var. |
| `VERİ YETERSİZ` | Eksik, eski ya da doğrulanmamış veri nedeniyle karar üretilmedi. |

Bu ifadeler yazılımın teknik sınıflandırmalarıdır; kâr garantisi veya kişisel yatırım danışmanlığı değildir.

## Çalışan özellikler

- TradingView **Pine Screener** için tüm sembol türlerini otomatik tanıyan `Universal Radar`
- Açık grafikte giriş bölgesi, kovalama sınırı, stop, iki hedef ve alternatif geri çekilme planı veren `Deep Analyzer`
- BIST hisseleri, global hisseler/ETF, kripto spot, forex, vadeli, endeks, emtia ve tahvil için ayrı veri/hacim/oynaklık profilleri
- Trend geri çekilmesi, hacimli kırılım, kırılım yeniden testi ve göreli güçlü lider kurulumu
- Kapanmış 1 saat, 4 saat, günlük ve haftalık yön teyidi
- `YATIR`, `YATIRILABİLİR`, `BEKLE`, `YATIRMA` ve `VERİ YETERSİZ` kararları
- Eksik hacim, eski fiyat, yetersiz geçmiş ve kapanmamış mum için fail-closed veri kapısı
- Giriş aralığı, stop, hedef 1, hedef 2, kovalama sınırı, geçerlilik ve güncel risk/kazanç
- TradingView webhooklarını doğrulayan bağımlılıksız Node.js sunucusu
- Tekrar koruması, zaman aşımı, gövde sınırı, hız sınırı, isteğe bağlı IP izin listesi ve güvenlik başlıkları
- JSONL kalıcı kanıt günlüğü, hedef/stop sonuçları, gözlenen başarı ve Wilson `%95` aralığı
- Türkçe, responsive canlı radar paneli
- Docker, Windows başlatıcı, otomatik testler ve Pine statik güvenlik kontrolü

## “Bütün piyasalar” nasıl çalışır?

TradingView herkese açık bir piyasa veri API'si sunmadığı için FinPilot fiyatları dışarıdan kazımaz. Tarama, TradingView'in resmî Pine Screener ve watchlist alarm altyapısında yapılır.

1. TradingView'de BIST, global hisse/ETF, kripto, forex ve diğer piyasa listeleri oluşturulur.
2. `FinPilot_Universal_Radar.pine` Pine Screener'da seçilir.
3. Her liste aynı göstergeyle taranır; sembolün türüne göre profil otomatik değişir.
4. Ultimate hesabındaki watchlist alarmları güçlü kararları arka planda izleyebilir.
5. Webhook kullanılırsa kararlar bu panelde tek yerde toplanır.

Ultimate'ta izleme listesi başına 1.000 sembol sınırı bulunduğundan daha geniş evrenler `scripts/split-watchlist.mjs` ile güvenli parçalara ayrılabilir. Aynı anda bütün dünyadaki milyonlarca sembolü tek Pine çalışmasında taramak TradingView sınırları nedeniyle mümkün değildir; sistem hesabında bulunan listeleri eksiksiz tarar.

## Hızlı başlangıç

Gereken: Node.js 20.9 veya üzeri.

```bash
cp .env.example .env
# .env içinde en az 32 karakterlik rastgele FINPILOT_WEBHOOK_SECRET oluştur
npm start
```

Windows:

```bat
copy .env.example .env
FinPilot-Baslat.bat
```

Panel: `http://127.0.0.1:4310`

Webhook: `https://SUNUCUNUZ/api/webhooks/tradingview`

Yerel `127.0.0.1` adresine TradingView internetten ulaşamaz. Webhook kullanacaksanız HTTPS alan adı/tünel ve kimlik doğrulama gerekir. Webhook istemiyorsanız Pine Screener ve TradingView bildirimleri tek başına çalışır.

## TradingView kurulumu

1. `tradingview/FinPilot_Universal_Radar.pine` içeriğini Pine Editor'e yapıştırın, kaydedin ve favorilere ekleyin.
2. TradingView ürün menüsünden **Pine Screener** açın.
3. İzleme listenizi, `FinPilot Universal Radar v2` göstergesini ve **15 dakika** zaman dilimini seçin.
4. `Karar` sütununu büyükten küçüğe sıralayın: `3=YATIR`, `2=YATIRILABİLİR`, `1=BEKLE`, `0=YATIRMA`, `-1=VERİ YETERSİZ`.
5. Ayrıntılı inceleme için `FinPilot_Deep_Analyzer.pine` dosyasını grafiğe ekleyin.
6. Webhook kullanacaksanız Pine ayarındaki anahtarı `.env` ile aynı yapın ve alarm türünde `Any alert() function call` seçin.

Ayrıntılı ve kontrollü kurulum: [TRADINGVIEW-KURULUM.md](TRADINGVIEW-KURULUM.md).

## Veri gereksinimi

- Kripto borsalarının TradingView verisi genellikle gerçek zamanlıdır.
- Birçok hisse ve vadeli borsa verisi, TradingView planından ayrı veri aboneliği gerektirir.
- `BIST MIXED` gerçek zamanlı fiyat sağlar fakat hacim sağlamaz. Hacimsiz BIST analizi güçlü `YATIR` seviyesine yükselmez.
- Opsiyonlar listede görülebilir ancak kullanım fiyatı, vade ve ima edilen oynaklık olmadan güçlü karar üretilmez.
- Pine, TradingView arayüzündeki “gecikmeli veri” rozetini doğrudan okuyamaz. FinPilot mum zamanını ve veri mevcudiyetini kontrol eder; borsa aboneliğini kullanıcı TradingView hesap ekranından doğrulamalıdır.

## Kanıt ve doğruluk

`Teknik puan` gerçek olasılık değildir. Panel yalnız sonuçlanan sinyallerden gözlenen başarı hesaplar. Örnek sayısı 30'un altındaysa kanıt `YETERSİZ`, 30–59 `ERKEN`, 60–149 `GELİŞİYOR`, 150 ve üzeri `GÜÇLÜ` olarak işaretlenir. Başarı oranının yanında belirsizliği göstermek için Wilson `%95` aralığı gösterilir.

## Kontroller

```bash
npm run check
```

Bu komut:

- analiz motoru karar senaryolarını,
- veri eksikliği ve hacim kapılarını,
- webhook kimlik doğrulamasını,
- tekrar korumasını,
- kalıcı günlüğü,
- HTTP entegrasyonunu,
- Pine güvenlik kurallarını

kontrol eder. Pine kaynaklarının kesin derlemesi yalnız TradingView Pine Editor içinde doğrulanabilir.

## KAP sınırı

KAP'ın resmî yüksek yoğunluklu REST servisi Borsa İstanbul veri dağıtım sözleşmesi ve API anahtarı gerektirir. Bu nedenle ücretsiz sürüm KAP sitesini kazımaz ve “KAP yapay zekâsı çalışıyor” izlenimi vermez. Lisanslı servis alınırsa ayrı bir sağlayıcı adaptörü eklenebilir.

## Güvenlik

Canlı internete açmadan önce [SECURITY.md](SECURITY.md) dosyasını okuyun. Webhook anahtarını Pine dışında paylaşmayın; broker, banka, TradingView veya e-posta şifresi kesinlikle kullanmayın.
