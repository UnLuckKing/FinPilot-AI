# Kâğıttan canlıya geçiş kontrol listesi

Canlı moda geçmeden önce bütün kutuların gerçekten tamamlanması gerekir.

- [ ] En az birkaç yüz bağımsız, ileriye dönük kâğıt sinyali birikti.
- [ ] Sonuçlar komisyon, kayma ve gerçekleşmeyen limit emirleriyle birlikte ölçüldü.
- [ ] Kâr faktörü ve işlem başına beklenti masraf sonrası pozitif kaldı.
- [ ] Azami düşüş kabul edilen sınırı aşmadı.
- [ ] Eğitim ve dönem dışı tarih aralıkları ayrıldı.
- [ ] BIST gerçek zamanlı fiyat **ve hacim** verisi etkin.
- [ ] `config/exchange-calendar.json` resmî BIST takvimiyle güncel.
- [ ] `config/restrictions.json` güncel ve süresi dolmamış.
- [ ] Aracı kurum adaptörü resmî arayüz kullanıyor.
- [ ] Adaptör hesap, emir, pozisyon ve gerçekleşmeyi tam sorgulayabiliyor.
- [ ] Kısmi gerçekleşme, ret, iptal/değiştir ve bağlantı kaybı test edildi.
- [ ] Stop ve iki hedef test hesabında doğrulandı.
- [ ] Uygulama kapatılıp açıldığında mutabakat ve koruma geri geldi.
- [ ] Acil durdur yeni girişi iptal etti, koruyucu emirleri bırakmaya devam etti.
- [ ] Seans sonu zorunlu kapanış test edildi.
- [ ] `.env` sırları Git geçmişinde yok.
- [ ] Sunucu HTTPS ve kimlik doğrulama arkasında.
- [ ] Ayrı, düşük tutarlı işlem sermayesi belirlendi.

Sunucuyu `TRADING_MODE=LIVE`, `LIVE_MODE_ENABLED=true` ve tam mutabakat sağlayan adaptörle yeniden başlatın. Panelde canlı emirler yine kapalı kalır. Son adım olarak tam `CANLI İŞLEMİ AÇ` metniyle onay gerekir.

Bir hata, eski veri veya çelişkili pozisyon görülürse canlı modu açmayın. Sistem bu durumlarda fail-closed davranmak üzere tasarlanmıştır.
