# FinPilot AI v1.2

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

## TradingView üzerinde otomatik araştırma paneli

`extension` klasörü, TradingView açıkken tek düğmeyle BIST araştırması yapan ücretsiz Chrome yan panelidir. Sembol, fiyat, CSV veya emir girişi istemez; aracı kuruma bağlanmaz ve gerçek emir göndermez.

- İş Yatırım'ın halka açık tarihsel fiyat ve temel oran sayfalarını kullanır.
- 1, 5 ve 20 işlem günü için yükseliş, düşüş ve yatay olasılıkları ile beklenen aralığı gösterir.
- Trend, momentum, hacim, sektör içi temel analiz, masraflı backtest ve kronolojik yerel model kullanır.
- Yakın dönem rejimi ve 250 senaryolu Monte Carlo stres kapısı uygular.
- KAP'taki son bildirimlerde tanımlı risk işaretlerini araştırır; KAP doğrulanamazsa `YATIR` üretmez.
- Yalnızca bütün kapılar geçtiğinde `YATIR`, diğer her durumda `YATIRMA` yazar.
- Borsa İstanbul fiyat adımlarına yuvarlanmış alış limiti, stop tetik, stop-limit ve iki hedef verir.
- Veri yaşı, `%95` aralık, kâr faktörü, beklenen değer ve her kapının geçti/kaldı durumunu açıklar.
- Yeni `YATIR` sonucu oluştuğunda yerel Chrome bildirimi gösterir.
- Chrome açıkken yaklaşık 12 saatte bir yenilenir; tek manuel kontrol **ŞİMDİ OTOMATİK ARAŞTIR** düğmesidir.
- İsteğe bağlı Pine Script v6 stratejisi ve Pine Screener göstergesi içerir. Pine, KAP okuyamadığı için yalnızca “ön aday” gösterir; nihai karar Chrome panelindedir.

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
