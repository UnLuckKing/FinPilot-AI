import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardSnapshot } from "@finpilot/core";

type Page = "Genel Bakış" | "Canlı Sinyaller" | "Bekleyen Emirler" | "Açık Pozisyonlar" | "Risk Merkezi" | "Bağlantılar" | "Ayarlar";

const pages: Page[] = ["Genel Bakış", "Canlı Sinyaller", "Bekleyen Emirler", "Açık Pozisyonlar", "Risk Merkezi", "Bağlantılar", "Ayarlar"];

export function App() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [page, setPage] = useState<Page>("Genel Bakış");
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");
  const [password, setPassword] = useState("");
  const [capital, setCapital] = useState("100000");
  const [busy, setBusy] = useState(false);
  const previousSnapshot = useRef<DashboardSnapshot | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/dashboard", { credentials: "include" });
    if (response.status === 401) {
      setAuthRequired(true);
      return;
    }
    if (!response.ok) throw new Error("Panel verisi alınamadı");
    const data = await response.json() as DashboardSnapshot;
    setSnapshot(data);
    setCapital(String(data.capital));
    setAuthRequired(false);
  }, []);

  useEffect(() => {
    void load().catch((reason: unknown) => setError(message(reason)));
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${location.host}/ws`);
    socket.onmessage = (event) => {
      const payload = JSON.parse(String(event.data)) as { type: string; data?: DashboardSnapshot };
      if (payload.type === "snapshot" && payload.data) setSnapshot(payload.data);
    };
    return () => socket.close();
  }, [load]);

  useEffect(() => {
    if (!snapshot) return;
    const previous = previousSnapshot.current;
    previousSnapshot.current = snapshot;
    if (!previous || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const newest = snapshot.recentSignals[0];
    if (newest && newest.id !== previous.recentSignals[0]?.id) {
      new Notification(`FinPilot: ${newest.symbol}`, { body: `${newest.state} — ${newest.reason}` });
    }
    if (!previous.killSwitchActive && snapshot.killSwitchActive) {
      new Notification("FinPilot: Acil durdur", { body: "Yeni giriş emirleri kapatıldı; koruyucu emirler bırakıldı." });
    }
    if (previous.broker.connected && !snapshot.broker.connected) {
      new Notification("FinPilot: Bağlantı kesildi", { body: "Aracı kurum bağlantısı güvenilir değil; yeni emirler kapalı." });
    }
  }, [snapshot]);

  const mutate = useCallback(async (path: string, body?: unknown, method = "POST") => {
    setBusy(true);
    setError(null);
    try {
      const request: RequestInit = {
        method,
        credentials: "include",
        headers: { "content-type": "application/json", ...(csrfToken ? { "x-csrf-token": csrfToken } : {}) }
      };
      if (body !== undefined) request.body = JSON.stringify(body);
      const response = await fetch(path, request);
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "İşlem başarısız");
      await load();
    } finally {
      setBusy(false);
    }
  }, [csrfToken, load]);

  const login = async () => {
    setError(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = await response.json() as { csrfToken?: string; error?: string };
    if (!response.ok || !data.csrfToken) throw new Error(data.error ?? "Giriş başarısız");
    setCsrfToken(data.csrfToken);
    setPassword("");
    await load();
  };

  if (authRequired) {
    return <main className="login-shell">
      <form className="login-card" onSubmit={(event) => { event.preventDefault(); void login().catch((reason: unknown) => setError(message(reason))); }}>
        <Brand />
        <p>Uzak veya canlı kullanım için yönetici oturumu gerekir.</p>
        <label>Yönetici parolası<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
        <button className="primary" type="submit">Giriş yap</button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>;
  }

  if (!snapshot) return <main className="loading">FinPilot güvenli durumu doğruluyor…</main>;

  return <div className="app-shell">
    <aside>
      <Brand />
      <nav>{pages.map((item) => <button key={item} className={page === item ? "active" : ""} onClick={() => setPage(item)}>{item}</button>)}</nav>
      <div className="safety-note"><span className="dot" /> Varsayılan: kâğıt işlem<br /><small>Kâr garantisi yoktur.</small></div>
    </aside>
    <main>
      <header>
        <div><span className="eyebrow">15 DK KAPANIŞ TEMELLİ</span><h1>{page}</h1></div>
        <div className="header-actions">
          <span className={`mode ${snapshot.mode.toLowerCase()}`}>{snapshot.mode === "PAPER" ? "KÂĞIT" : "CANLI"}</span>
          <button className="danger" disabled={busy || snapshot.killSwitchActive} onClick={() => void mutate("/api/risk/kill-switch").catch((reason: unknown) => setError(message(reason)))}>ACİL DURDUR</button>
        </div>
      </header>
      {error && <div className="banner error">{error}<button onClick={() => setError(null)}>×</button></div>}
      {snapshot.killSwitchActive && <div className="banner blocked">Yeni emirler kapalı. Koruyucu emirler iptal edilmedi.</div>}
      <PageContent
        page={page}
        snapshot={snapshot}
        capital={capital}
        setCapital={setCapital}
        busy={busy}
        mutate={mutate}
        setError={setError}
      />
    </main>
  </div>;
}

function PageContent(props: {
  page: Page;
  snapshot: DashboardSnapshot;
  capital: string;
  setCapital: (value: string) => void;
  busy: boolean;
  mutate: (path: string, body?: unknown, method?: string) => Promise<void>;
  setError: (value: string | null) => void;
}) {
  const { page, snapshot } = props;
  if (page === "Genel Bakış") return <Overview snapshot={snapshot} />;
  if (page === "Canlı Sinyaller") return <Signals snapshot={snapshot} />;
  if (page === "Bekleyen Emirler") return <Orders snapshot={snapshot} />;
  if (page === "Açık Pozisyonlar") return <Positions snapshot={snapshot} onClose={() => {
    const confirmation = window.prompt("Tüm pozisyonlar için kapanış emri göndermek üzere KAPAT yazın");
    if (confirmation === "KAPAT") void props.mutate("/api/positions/close-all").catch((reason: unknown) => props.setError(message(reason)));
  }} />;
  if (page === "Risk Merkezi") return <RiskCenter snapshot={snapshot} onClear={() => {
    const confirmation = window.prompt("Kilidi kaldırmak için ACİL DURDURMAYI KALDIR yazın");
    if (confirmation) void props.mutate("/api/risk/kill-switch/clear", { confirmation }).catch((reason: unknown) => props.setError(message(reason)));
  }} />;
  if (page === "Bağlantılar") return <Connections snapshot={snapshot} />;
  return <Settings {...props} />;
}

function Overview({ snapshot }: { snapshot: DashboardSnapshot }) {
  return <>
    <section className="hero-grid">
      <Metric label="Kullanılacak sermaye" value={money(snapshot.capital)} />
      <Metric label="Kullanılabilir nakit" value={money(snapshot.availableCash)} />
      <Metric label="Günlük gerçekleşen" value={signedMoney(snapshot.realisedPnl)} tone={snapshot.realisedPnl < 0 ? "bad" : "good"} />
      <Metric label="Açık pozisyon" value={String(snapshot.openPositions.length)} />
      <Metric label="Kalan işlem hakkı" value={String(snapshot.risk.remainingTrades)} />
      <Metric label="Kalan kayıp bütçesi" value={money(snapshot.risk.remainingLossBudgetTry)} />
    </section>
    <section className="split">
      <article className="panel"><div className="panel-title"><span>RİSK DURUMU</span><b>{riskLabel(snapshot.risk.state)}</b></div><div className="risk-orb">%{Math.round(snapshot.risk.riskMultiplier * 100)}<small>normal risk</small></div>{snapshot.risk.reasons.length ? <ul>{snapshot.risk.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p className="muted">Yeni emir kapıları açık; her sinyal yine ayrı doğrulanır.</p>}</article>
      <article className="panel"><div className="panel-title"><span>SİSTEM SAĞLIĞI</span><b>{snapshot.health.every((item) => item.state === "OK") ? "HAZIR" : "KONTROL"}</b></div>{snapshot.health.map((item) => <div className="health-row" key={item.name}><span className={`health ${item.state.toLowerCase()}`}>{item.state}</span><div><b>{item.name}</b><small>{item.detail}</small></div></div>)}</article>
    </section>
    <section className="panel"><div className="panel-title"><span>SON SİNYALLER</span><b>{snapshot.recentSignals.length}</b></div><Signals snapshot={snapshot} embedded /></section>
  </>;
}

function Signals({ snapshot, embedded = false }: { snapshot: DashboardSnapshot; embedded?: boolean }) {
  if (!snapshot.recentSignals.length) return <Empty title="Henüz onaylı sinyal yok" text="TradingView 15 dakika kapanış alarmı geldikten sonra gerekçesiyle burada görünür." />;
  return <div className={embedded ? "table-wrap embedded" : "panel table-wrap"}><table><thead><tr><th>Sembol</th><th>Durum</th><th>Teknik skor</th><th>Zaman</th><th>Gerekçe</th></tr></thead><tbody>{snapshot.recentSignals.map((signal) => <tr key={signal.id}><td><b>{signal.symbol}</b></td><td><State value={signal.state} /></td><td>{signal.score}/100</td><td>{dateTime(signal.createdAt)}</td><td>{signal.reason}</td></tr>)}</tbody></table></div>;
}

function Orders({ snapshot }: { snapshot: DashboardSnapshot }) {
  if (!snapshot.pendingOrders.length) return <Empty title="Bekleyen emir yok" text="Kabul edilen emir gerçekleşmiş sayılmaz; gerçekleşme gelene kadar bu listede kalır." />;
  return <div className="panel table-wrap"><table><thead><tr><th>Sembol</th><th>Yön</th><th>Tür</th><th>Adet</th><th>Fiyat</th><th>Gerçekleşen</th><th>Durum</th></tr></thead><tbody>{snapshot.pendingOrders.map((order) => <tr key={order.brokerOrderId}><td><b>{order.symbol}</b></td><td>{order.side}</td><td>{order.type}</td><td>{order.quantity}</td><td>{order.limitPrice ? money(order.limitPrice) : "Piyasa"}</td><td>{order.filledQuantity}/{order.quantity}</td><td><State value={order.status} /></td></tr>)}</tbody></table></div>;
}

function Positions({ snapshot, onClose }: { snapshot: DashboardSnapshot; onClose: () => void }) {
  return <><div className="section-actions"><p>Koruyucu stoplar acil durdurdan sonra da etkin kalır.</p><button className="danger ghost" onClick={onClose}>Tümünü kapat</button></div>{!snapshot.openPositions.length ? <Empty title="Açık pozisyon yok" text="Bir alış gerçekten gerçekleşmeden pozisyon oluşturulmaz." /> : <div className="panel table-wrap"><table><thead><tr><th>Sembol</th><th>Adet</th><th>Ortalama</th><th>Son</th><th>Stop</th><th>Hedef 1</th><th>Hedef 2</th><th>Açık K/Z</th></tr></thead><tbody>{snapshot.openPositions.map((position) => <tr key={position.symbol}><td><b>{position.symbol}</b></td><td>{position.quantity}</td><td>{money(position.averagePrice)}</td><td>{money(position.lastPrice)}</td><td>{position.stopPrice ? money(position.stopPrice) : <State value="KORUMASIZ" />}</td><td>{position.target1 ? money(position.target1) : "—"}</td><td>{position.target2 ? money(position.target2) : "—"}</td><td>{signedMoney(position.unrealisedPnl)}</td></tr>)}</tbody></table></div>}</>;
}

function RiskCenter({ snapshot, onClear }: { snapshot: DashboardSnapshot; onClear: () => void }) {
  return <div className="split"><article className="panel"><div className="panel-title"><span>GÜNLÜK DURUM MAKİNESİ</span><b>{riskLabel(snapshot.risk.state)}</b></div><ol className="states"><li className={snapshot.risk.state === "NORMAL" ? "current" : ""}>Normal — işlem başına %0,50</li><li className={snapshot.risk.state === "AZALTILMIŞ" ? "current" : ""}>İlk kayıp — risk %30 azalır</li><li className={snapshot.risk.state === "YALNIZ_A_KALİTE" ? "current" : ""}>İkinci kayıp — yarım risk, yalnız A kalite</li><li className={snapshot.risk.state === "GÜN_KİLİTLİ" ? "current" : ""}>Üçüncü kayıp — gün kapanır</li></ol></article><article className="panel"><div className="panel-title"><span>ACİL DURDUR</span><b>{snapshot.killSwitchActive ? "ETKİN" : "KAPALI"}</b></div><p>Etkinleştirildiğinde yeni emirleri durdurur ve bekleyen girişleri iptal eder; koruyucu stopları silmez.</p>{snapshot.killSwitchActive && <button className="secondary" onClick={onClear}>Mutabakat yap ve kilidi kaldır</button>}</article></div>;
}

function Connections({ snapshot }: { snapshot: DashboardSnapshot }) {
  return <div className="split"><article className="panel connection"><span className={`health ${snapshot.broker.connected ? "ok" : "blocked"}`}>{snapshot.broker.connected ? "BAĞLI" : "KAPALI"}</span><h2>{snapshot.broker.adapter}</h2><p>{snapshot.broker.message}</p><dl><dt>Mutabakat</dt><dd>{snapshot.broker.reconciliation}</dd><dt>Son kontrol</dt><dd>{dateTime(snapshot.broker.checkedAt)}</dd></dl></article><article className="panel"><div className="panel-title"><span>TRADINGVIEW</span><b>{snapshot.lastWebhookAt ? "ALARM ALINDI" : "BEKLENİYOR"}</b></div><p>Alarm adresi:</p><code>{location.origin}/api/webhooks/tradingview</code><p className="muted">ONAYLI AL/SAT yalnız kapanmış 15 dakika mumunda üretilir. Her sembol için TradingView alarmı ayrıca kurulmalıdır.</p></article></div>;
}

function Settings(props: Parameters<typeof PageContent>[0]) {
  return <div className="split"><form className="panel" onSubmit={(event) => { event.preventDefault(); void props.mutate("/api/settings/capital", { capitalTry: Number(props.capital) }, "PUT").catch((reason: unknown) => props.setError(message(reason))); }}><div className="panel-title"><span>TEK STRATEJİ GİRDİSİ</span><b>SERMAYE</b></div><label>Kullanılacak sermaye (₺)<input type="number" min="1000" step="100" value={props.capital} onChange={(event) => props.setCapital(event.target.value)} /></label><p className="muted">Adet; sermayenin tamamı kullanılarak değil, stop mesafesi ve işlem başına risk sınırıyla hesaplanır.</p><button className="primary" disabled={props.busy}>Kaydet</button><button className="secondary" type="button" onClick={() => void requestDesktopNotifications().catch((reason: unknown) => props.setError(message(reason)))}>Masaüstü bildirimlerini aç</button></form><article className="panel"><div className="panel-title"><span>SABİT GÜVENLİK KURALLARI</span><b>v1.0.0</b></div><ul><li>Kaldıraç ve açığa satış yok</li><li>Gecelik pozisyon yok</li><li>Günde en fazla 3 tamamlanan işlem</li><li>Martingale kesinlikle yok</li><li>Stop girişten sonra genişletilmez</li><li>Canlı mod ayrı yazılı onay ister</li></ul></article></div>;
}

function Brand() { return <div className="brand"><div className="logo">F</div><div><b>FinPilot</b><span>AutoTrader v1</span></div></div>; }
function Metric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) { return <article className="metric"><span>{label}</span><strong className={tone}>{value}</strong></article>; }
function State({ value }: { value: string }) { const bad = /REJECT|KORUMASIZ|FAILED|EXPIRED|CANCEL/.test(value); const good = /PROTECTED|FILLED|ACCEPTED|ORDER_SENT/.test(value); return <span className={`state ${bad ? "bad" : good ? "good" : "neutral"}`}>{value.replaceAll("_", " ")}</span>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><div>◇</div><h2>{title}</h2><p>{text}</p></div>; }
function money(value: number) { return value.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }); }
function signedMoney(value: number) { return `${value > 0 ? "+" : ""}${money(value)}`; }
function dateTime(value: string) { return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function message(reason: unknown) { return reason instanceof Error ? reason.message : "Beklenmeyen hata"; }
function riskLabel(value: DashboardSnapshot["risk"]["state"]) { return ({ NORMAL: "NORMAL", "AZALTILMIŞ": "AZALTILMIŞ", "YALNIZ_A_KALİTE": "YALNIZ A KALİTE", "GÜN_KİLİTLİ": "GÜN KİLİTLİ" } as const)[value]; }
async function requestDesktopNotifications() { if (typeof Notification === "undefined") throw new Error("Bu tarayıcı masaüstü bildirimini desteklemiyor"); const permission = await Notification.requestPermission(); if (permission !== "granted") throw new Error("Bildirim izni verilmedi"); new Notification("FinPilot", { body: "Masaüstü bildirimleri etkin." }); }
