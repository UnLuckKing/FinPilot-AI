# Güvenlik

FinPilot broker veya banka hesabına bağlanmaz. Yine de webhook internete açıldığında bir sunucu hizmetidir.

## Zorunlu kurallar

- `FINPILOT_WEBHOOK_SECRET` en az 32 rastgele karakter olmalıdır.
- TradingView, banka, e-posta veya GitHub parolanızı webhook anahtarı olarak kullanmayın.
- `.env` dosyasını Git'e eklemeyin.
- İnternete yalnız HTTPS/443 üzerinden açın.
- Ters vekil kullanmıyorsanız `FINPILOT_TRUST_PROXY=false` bırakın.
- Güncellemeleri uygulamadan önce `npm run check` çalıştırın.
- `data/events.jsonl` kişisel işlem araştırma geçmişidir; herkese açık paylaşmayın.

## Uygulanan korumalar

- Sabit zamanlı webhook anahtarı karşılaştırması
- 64 KiB istek sınırı
- JSON ve alan izin listesi
- 20 dakikalık zaman aşımı
- Nonce tekrar koruması
- IP başına hız sınırı
- İsteğe bağlı IP izin listesi
- CSP, frame engeli, MIME koruması ve sıkı yönlendirme politikası
- Dosya yolu geçişine karşı statik sunucu sınırı
- Anahtarın günlüğe yazılmaması

## Olay bildirimi

Bir güvenlik sorunu bulursanız herkese açık issue içinde anahtar veya özel veri paylaşmayın. Önce webhooku kapatın, anahtarı değiştirin ve ilgili kayıtları inceleyin.
