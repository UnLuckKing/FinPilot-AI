# FinPilot v2.2 Free kurulumu

## Chrome

1. ZIP dosyasına sağ tıklayıp **Tümünü ayıkla** seçin.
2. Adres çubuğuna `chrome://extensions` yazın.
3. Sağ üstten **Geliştirici modu**nu açın.
4. Eski FinPilot sürümünü kaldırın veya kapatın.
5. **Paketlenmemiş öğe yükle** seçeneğine basın.
6. İçinde `manifest.json` bulunan `FinPilot-TradingView-Extension` klasörünü seçin.
7. TradingView'i yenileyin ve FinPilot simgesine tıklayın.

Microsoft Edge'de aynı adımlar `edge://extensions` sayfasından uygulanır.

## Üyelik gereksinimi

- TradingView Free yeterlidir.
- Watchlist alarmı, webhook, Pine Premium/Ultimate limiti veya ücretli TradingView verisi zorunlu değildir.
- Chrome tamamen kapalıyken uzantı tarama veya bildirim yapamaz.

## Kullanım

- `Piyasalar` bölümü otomatik küresel taramayı gösterir.
- Bir sonuca dokununca sembol TradingView'de açılır.
- `Grafik` bölümündeki iki vade kartından `15 DK` veya `1–5 GÜN` planı görüntülenir.
- `15 DK ONAYLI AL`, bir gün bekleme talimatı değildir; giriş planı dört adet 15 dakikalık mum içinde geçerlidir.
- `1–5 GÜN AL`, ayrı günlük mum ve swing stop/hedefleriyle hesaplanır.
- Fiyat giriş bölgesine değmezse sistem kâğıt işlemi başlatmaz.
- Kâr 1 sonrası kâğıt takip stopu maliyete taşır.
- `SHORT` için desteklenen türev/açığa satış ürünü gerekir. Spot üründe yalnız `DÜŞÜŞ — UZAK DUR` gösterilir.
- Emirleri ve gerçek pozisyon yönetimini kendi aracı kurumunuzda siz uygularsınız.

## Güncelleme ve sorun giderme

- Eski sürüm klasörünü yeni dosyalarla karıştırmayın; önce eski uzantıyı kaldırıp v2.2 klasörünü yükleyin.
- Grafik algılanmazsa gerçek TradingView grafik sayfasını açıp sayfayı yenileyin; eklenti algılayıcıyı bir kez otomatik yeniden yükler.
- `VERİ YETERSİZ`, sembol eşlemesinin başarısız, seans verisinin eski veya ücretsiz kaynağın geçici olarak erişilemez olduğu anlamına gelebilir.
- İlk BIST taraması KAP evreninin ön elemesi nedeniyle sonraki taramalardan uzun sürebilir.
