import { PaperBroker } from "@finpilot/brokers";

const candles = 1_000;
const broker = new PaperBroker({ initialCapital: 100_000, random: () => 0.5, maximumFillFractionOfCandle: 0.02 });
await broker.connect();

let price = 100;
let processed = 0;
for (let index = 0; index < candles; index += 1) {
  const drift = 0.015;
  const wave = Math.sin(index / 13) * 0.35 + Math.cos(index / 29) * 0.2;
  const open = price;
  price = Math.max(10, price + drift + wave);
  await broker.processCandle({
    symbol: "ASELS",
    time: new Date(Date.UTC(2024, 0, 1, 7, index * 15)).toISOString(),
    open,
    high: Math.max(open, price) + 0.25,
    low: Math.min(open, price) - 0.25,
    close: price,
    volume: 250_000 + (index % 50) * 5_000
  });
  processed += 1;
}

const account = await broker.getAccount();
console.log(JSON.stringify({
  mode: "PAPER",
  syntheticCandlesProcessed: processed,
  realOrdersSent: 0,
  finalEquity: account.equity,
  note: "Bu test strateji başarısı değil, emir gönderilmeyen dayanıklılık kontrolüdür."
}, null, 2));
