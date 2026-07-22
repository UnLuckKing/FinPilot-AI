# İzleme listeleri

TradingView izleme listesi dışa aktarımı, borsa önekli ve virgülle ayrılmış `.txt` dosyasıdır.

Örnek:

```text
BIST:THYAO,BIST:ASELS,BIST:TUPRS
```

Ultimate listesi 1.000 sembolü destekler. Daha büyük bir dışa aktarımı bölmek için:

```bash
node scripts/split-watchlist.mjs yol/izleme-listesi.txt watchlists/bolunmus
```

Script sembolleri tekilleştirir ve 1.000'er sembollük dosyalar oluşturur. Resmî olmayan piyasa sitelerinden otomatik sembol kazımaz; kaynak liste TradingView'den dışa aktarılmalıdır.
