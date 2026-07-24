# Gizlilik

- Eklenti aracı kurum hesabına bağlanmaz.
- Şifre, API anahtarı, kimlik veya banka bilgisi istemez.
- Analiz, fırsat kutusu, işlem yaşam döngüsü ve kâğıt sinyal geçmişi `chrome.storage.local` içinde yalnız bu tarayıcıda saklanır.
- Sembol ve mum verisi yalnız manifestte açıkça belirtilen Yahoo Finance ve Binance piyasa veri uçlarına gönderilir.
- KAP bağlantısı yalnız güncel BIST şirket/sembol evrenini okumak için kullanılır; kullanıcı bilgisi gönderilmez.
- `scripting` izni yalnız açık TradingView sekmesindeki sembol algılayıcısını uzantı güncellemesinden sonra yeniden yüklemek için kullanılır; diğer sitelere kod eklenmez.
- Reklam, telemetri ve uzaktan çalıştırılan kod yoktur.
- Geçmiş ve fırsat kutusu paneldeki **Yerel geçmişi temizle** düğmesiyle silinebilir.
