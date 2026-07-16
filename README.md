# FinPilot AI v2.1

FinPilot AI; portföy takibi, yatırım bütçesi, varlık dağılımı, risk görünümü, hedefler ve açıklanabilir finansal analiz sunan Türkçe bir karar destek uygulamasıdır.

> FinPilot yatırım danışmanlığı sunmaz, kâr garantisi vermez ve gerçek para işlemi yapmaz. Yerleşik fiyatlar demo veridir.

## Kurulumsuz, doğrudan açılan sürüm

ZIP dosyasını çıkardıktan sonra **`FinPilot-AI.html`** dosyasına çift tıklayın. Windows'ta isterseniz **`FinPilot-AI-Baslat.bat`** dosyasını da kullanabilirsiniz.

Bu sürüm:

- İnternet, API anahtarı veya Node.js istemez.
- Tarayıcıda doğrudan arayüz olarak açılır.
- Portföy, bütçe, dağılım ve kayıp sonrası toparlanma planını hesaplar.
- Verileri yalnızca kullanılan tarayıcıda saklar.
- JSON yedek indirme ve geri yükleme sunar.

Yüzde 90 veya yüzde 100 kesin kazanç garanti edilemez. Kayıp planı; zararı büyüten martingale yaklaşımı yerine yeni riski azaltır, güvenli aylık katkıyı hesaplar ve tahmini toparlanma süresini gösterir.

## Hızlı başlangıç

Gerekenler: Node.js 20.9 veya üzeri.

```bash
npm install
npm run dev
```

Ardından `http://localhost:3000` adresini açın ve **Demoyu aç** düğmesini kullanın. Demo için e-posta, banka hesabı veya API anahtarı gerekmez.

Üretim derlemesi:

```bash
npm run test
npm run typecheck
npm run build
npm start
```

## Çalışan özellikler

- Koyu temalı, mobil uyumlu Türkçe finans paneli
- Yerel demo hesap, kayıt/giriş/onboarding akışları
- Alış/satış işlemlerinden ortalama maliyet, gerçekleşen ve gerçekleşmemiş kâr/zarar
- İşlem ekleme, düzenleme, silme; CSV içe ve dışa aktarma
- Gelir, gider, borç, acil fon, yaklaşan harcama ve güvenlik payına dayalı yatırım bütçesi
- Risk profiline göre 100% toplamlı dağılım planı ve aylık katkı senaryosu
- Piyasa araması, varlık detayı, takip listeleri ve uygulama içi uyarılar
- Kullanıcının gerçek uygulama verisini kullanan ücretsiz kural tabanlı FinPilot Asistan
- Haftalık/aylık/risk/sağlık raporu görünümleri, CSV ve yazdır/PDF akışı
- Finansal hedef ekleme, düzenleme, silme ve gereken aylık katkı hesabı
- PWA manifesti ve üretim ortamında service worker kaydı
- Supabase/PostgreSQL şeması, kontroller ve kullanıcı bazlı RLS politikaları

## TradingView üzerinde çoklu piyasa araştırma paneli

`extension` klasörü, TradingView yanında çalışan ücretsiz Chrome yan panelidir. Geniş bir BIST havuzunu ve Binance'teki likit USDT spot çiftlerini kendi tarar. Sembol, fiyat, CSV veya emir girişi istemez; aracı kuruma ya da borsa hesabına bağlanmaz ve gerçek emir göndermez.

- İş Yatırım temel tablosundan fiili dolaşım piyasa değerine göre en fazla 120 likit BIST hissesi seçer; veri kaynağı bozulursa 30 hisselik yedek havuza geçer.
- Binance'in anahtarsız herkese açık piyasa verisinden en fazla 140 likit USDT spot çifti seçer; stablecoin ve `UP/DOWN/BULL/BEAR` kaldıraçlı tokenları dışlar.
- BIST için 1, 5 ve 20 işlem günü; kripto için 4 saat, 1 gün ve 7 gün yükseliş/düşüş/yatay olasılığı ile beklenen aralık gösterir.
- Trend devamı, geri çekilme, kırılım teyidi ve yatay piyasa dönüşü stratejilerini aynı veri üzerinde ayrı ayrı backtest eder; geçerli kurulumlara öncelik vererek en güçlü yaklaşımı seçer.
- Momentum, hacim, masraflı backtest, yakın dönem rejimi, kronolojik yerel model ve 250 senaryolu Monte Carlo stres testi uygular.
- BIST temel oranlarını banka/finans, holding, gayrimenkul, büyüme-hizmet ve sanayi için farklı sektör ağırlıklarıyla karşılaştırır; güncel KAP ayrıca zorunlu kapıdır. Kriptoda hacim, işlem sayısı, aşırı 24 saatlik hareket ve BTC/piyasa rejimi ayrı kapılardır.
- Yalnızca bütün kapılar geçtiğinde `YATIR`, diğer her durumda `YATIRMA` yazar; reddedilen her kapıda gerçekleşen değer ile gerekli eşiği sayısal olarak gösterir.
- Destek geri çekilmesi, EMA yeniden testi ve ATR dengeli olmak üzere üç emir planı hesaplar. Fiyat adımına yuvarlanmış alış limiti, stop tetik, stop-limit ve iki hedef yalnızca geçerli `YATIR` sinyalinde etkinleşir.
- `Tümü`, `BIST`, `Kripto`, `Takip` ve `Geçmiş` sekmeleri vardır. Takip, en fazla üç eksik kapısı kalan varlıkların taramadan taramaya ilerlemesini ölçer; Geçmiş ise sinyalleri sonraki kapanmış tarama fiyatlarıyla izler.
- Aynı piyasa ve stratejide en az 12 izlenen sonuç biriktiğinde kazanma oranı `%40`ın veya ortalama sonuç `0R`ın altına düşerse performans koruması yeni olumlu sinyali kilitler. Bu izleme gerçek aracı kurum gerçekleşmesi değildir.
- Bir piyasa kaynağı hata verse bile diğer piyasanın taraması devam eder. Eksik veya eski veriden olumlu sinyal üretilmez.
- Yeni `YATIR` sonucu oluştuğunda ve takipteki bir varlık tek eksik kapıya yaklaştığında yerel Chrome bildirimi gösterir. Tarama, Chrome açıkken kapanmış dört saatlik mum sınırından yaklaşık beş dakika sonra yenilenir.
- İsteğe bağlı Pine Script v6 araçları yalnızca grafik teyidi içindir; TradingView'in fiyat/indikatör verisi için halka açık bir API'si olmadığından panel veriyi TradingView'den çekmez.

Kurulum için [TRADINGVIEW-KURULUM.md](TRADINGVIEW-KURULUM.md) dosyasını izleyin veya Windows'ta `TRADINGVIEW-KURULUMUNU-AC.bat` dosyasını çalıştırın.

## Demo veri davranışı

Uygulama ilk açılışta örnek bir portföy yükler. Yapılan değişiklikler tarayıcının `localStorage` alanında saklanır. Ayarlar → Gizlilik bölümünden veri indirilebilir veya demo sıfırlanabilir.

`GET /api/market` demo sağlayıcı verisini ve gecikme etiketini döndürür. `POST /api/ai` Zod ile doğrulanan finansal bağlamdan anahtarsız, açıklanabilir demo yanıtı üretir.

## Supabase kurulumu (isteğe bağlı)

Ücretsiz Supabase projesi kullanmak isterseniz:

1. `.env.example` dosyasını `.env.local` olarak kopyalayın.
2. `NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_ANON_KEY` değerlerini girin.
3. `supabase/migrations/001_initial_schema.sql` dosyasını SQL Editor içinde çalıştırın.
4. `supabase/seed.sql` dosyasını çalıştırın.

Şema `auth.users` tablosunu kullanıcı kaynağı olarak kullanır. Kullanıcıya ait tablolar RLS ile izole edilmiştir. Servis rolü anahtarı hiçbir zaman tarayıcıya gönderilmemelidir.

## Ortam değişkenleri

Tüm seçenekler `.env.example` içindedir. Varsayılan çalışma şekli:

```env
MARKET_DATA_PROVIDER=demo
AI_PROVIDER=demo
```

OpenAI veya ücretli piyasa API'si zorunlu değildir. E-posta ve push bildirimleri, sağlayıcı kimlik bilgileri yapılandırılana kadar kapalıdır.

## CSV biçimi

```csv
assetId,type,quantity,price,commission,date,note
gold,Alış,1,4750,5,2026-07-01,Örnek işlem
```

Desteklenen işlem türleri `Alış` ve `Satış`; tarih biçimi `YYYY-MM-DD` şeklindedir. İçe aktarılan kimlikler temizlenir, sayılar negatif olamaz ve geçersiz satırlar reddedilir.

## Proje yapısı

```text
app/                    Next.js sayfaları, manifest ve API rotaları
components/             Uygulama kabuğu, sayfalar ve ortak arayüz bileşenleri
lib/                    Tipler, demo veri, durum ve finans hesaplamaları
public/                 PWA simgesi ve service worker
supabase/migrations/    PostgreSQL şeması ve RLS politikaları
supabase/seed.sql       Ortak demo varlıkları
```

## Güvenlik sınırları

- Banka veya aracı kurum şifresi istenmez ve saklanmaz.
- Gerçek para alım/satımı ya da otomatik emir yürütme yoktur.
- Finansal girdiler istemci ve API sınırında doğrulanır.
- CSV içerikleri temizlenir.
- Gerçek API anahtarları frontend'e konmaz.
- Eksik piyasa verileri uydurulmaz; “Veri mevcut değil” durumu gösterilir.
- KAP, veri tazeliği, kapsam veya stres kontrollerinden biri doğrulanamazsa sonuç `YATIRMA` olur.
- Stop-limit emri fiyat boşluğunda gerçekleşmeyebilir; gösterilen seviyeler emir değil araştırma önerisidir.

## Doğrulama

```bash
npm test
npm run test:tradingview
npm run typecheck
npm run build
```

GitHub Actions aynı kontrolleri her gönderimde çalıştırır. Bu testler yazılım hatası riskini azaltır; gelecekteki piyasa hareketini veya kârı garanti etmez.
