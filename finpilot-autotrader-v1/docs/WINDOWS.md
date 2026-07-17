# Windows kurulumu

## Kolay kurulum

1. Node.js 20 LTS veya daha yenisini kurun.
2. Bu klasörde `FinPilot-AutoTrader-Kur.bat` dosyasına çift tıklayın.
3. `.env` dosyasındaki üç varsayılan güvenlik değerini değiştirin.
4. `FinPilot-AutoTrader-Baslat.bat` dosyasına çift tıklayın.
5. `http://127.0.0.1:4310` adresini açın.

## Komut satırı

```bat
copy .env.example .env
npm install
npm run check
npm start
```

Windows yeniden başlatıldığında otomatik açılmasını isterseniz Görev Zamanlayıcı'da oturum açma tetikleyicisi oluşturun; program olarak `cmd.exe`, argüman olarak `/c C:\TAM\YOL\FinPilot-AutoTrader-Baslat.bat`, başlangıç dizini olarak proje klasörünü kullanın. Canlı modda çalıştırmadan önce servis hesabı, HTTPS ve sır yönetimi yapılandırılmalıdır.
