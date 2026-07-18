# Güvenlik kontrol listesi

- [ ] `.env` ve aracı kurum şablonu Git'e eklenmedi.
- [ ] `TV_WEBHOOK_SECRET` ve `SESSION_SECRET` ayrı, rastgele ve en az 32 karakter.
- [ ] Üretimde varsayılan `ADMIN_PASSWORD` değiştirildi.
- [ ] `ALLOW_LOCAL_PAPER_NO_AUTH=false` ve harici erişim yalnız HTTPS.
- [ ] API yalnız gerekli ağ arayüzünde dinliyor.
- [ ] Ters vekil istek gövdesini veya webhook anahtarını loglamıyor.
- [ ] Broker anahtarı Pine kaynağında, frontend paketinde veya bildirimde yok.
- [ ] Resmî şablon dosyası yalnız servis kullanıcısı tarafından okunabiliyor.
- [ ] Şifreli sır kullanılıyorsa `FINPILOT_MASTER_KEY` Git dışında tutuluyor.
- [ ] SQLite ve yedekleri yetkisiz kullanıcıya açık değil.
- [ ] Yedekten geri dönüş ve yeniden başlatma mutabakatı test edildi.
- [ ] Webhook zaman, nonce ve signalId tekrar denemeleri test edildi.
- [ ] Hız sınırı ve 64 KB gövde sınırı etkin.
- [ ] Sayısal değerler ve sembol izin listesi doğrulanıyor.
- [ ] Acil durdur yeniden başlatmada etkin kalıyor.
- [ ] Koruyucu stop, uygulama kesintisinde broker tarafında kalıyor; kalmıyorsa operasyonel risk açıkça kabul edildi.

Bir sır yanlışlıkla commit edildiyse yalnız dosyayı silmek yetmez: anahtarı derhal iptal edin/değiştirin ve Git geçmişini ayrı güvenlik prosedürüyle temizleyin.
