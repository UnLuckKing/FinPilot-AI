"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Bot,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Goal,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  PieChart,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { PwaRegister } from "./pwa-register";
import { Button, Card, Field, Input, Progress, Skeleton } from "./ui";
import {
  AllocationPage,
  AssistantPage,
  BudgetPage,
  DashboardPage,
  GoalsPage,
  MarketsPage,
  PortfolioPage,
  ReportsPage,
  SettingsPage,
  WatchlistPage,
} from "./pages";

const nav = [
  ["/panel", "Genel Bakış", LayoutDashboard],
  ["/portfoy", "Portföy", BriefcaseBusiness],
  ["/butce", "Yatırım Bütçesi", CircleDollarSign],
  ["/dagilim", "Dağılım Planı", PieChart],
  ["/piyasalar", "Piyasalar", ChartNoAxesCombined],
  ["/takip", "Takip & Uyarılar", ListChecks],
  ["/asistan", "FinPilot Asistan", Bot],
  ["/raporlar", "Raporlar", FileText],
  ["/hedefler", "Hedefler", Goal],
  ["/ayarlar", "Ayarlar", Settings],
] as const;

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`logo ${compact ? "compact" : ""}`}>
      <span className="logo-mark">
        <ChartNoAxesCombined size={19} />
      </span>
      {!compact && (
        <span>
          FinPilot <b>AI</b>
        </span>
      )}
    </span>
  );
}

export function FinPilotApp() {
  const pathname = usePathname();
  const { hydrated } = useStore();
  if (!hydrated)
    return (
      <div className="boot">
        <Logo />
        <Skeleton />
      </div>
    );
  if (pathname === "/") return <Landing />;
  if (["/giris", "/kayit", "/sifremi-unuttum"].includes(pathname))
    return <AuthPage mode={pathname} />;
  if (pathname === "/onboarding") return <Onboarding />;
  return <AppShell />;
}

function Landing() {
  const router = useRouter();
  const { resetDemo } = useStore();
  const startDemo = () => {
    resetDemo();
    router.push("/panel");
  };
  return (
    <div className="landing">
      <PwaRegister />
      <header className="landing-nav">
        <Logo />
        <nav>
          <a href="#ozellikler">Özellikler</a>
          <a href="#guvenlik">Güvenlik</a>
          <Link href="/giris">Giriş</Link>
          <Button onClick={startDemo}>
            Demoyu aç <ChevronRight size={16} />
          </Button>
        </nav>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-pill">
              <Sparkles size={15} /> Finansal kararlarını sadeleştir
            </div>
            <h1>
              Paranı takip et.
              <br />
              <span>Kararını veriye dayandır.</span>
            </h1>
            <p>
              Portföy, yatırım bütçesi, risk ve hedeflerin tek bir ekranda.
              Ücretsiz demo analizleri sana ne olduğunu ve nedenini açıklar.
            </p>
            <div className="hero-actions">
              <Button onClick={startDemo}>
                Ücretsiz demoyu dene <ChevronRight size={17} />
              </Button>
              <Button variant="secondary" onClick={() => router.push("/kayit")}>
                Hesap oluştur
              </Button>
            </div>
            <div className="trust-row">
              <span>
                <ShieldCheck size={16} /> İşlem yapmaz
              </span>
              <span>
                <WalletCards size={16} /> Banka şifresi istemez
              </span>
              <span>
                <Sparkles size={16} /> API gerektirmez
              </span>
            </div>
          </div>
          <DashboardPreview />
        </section>
        <section className="feature-strip" id="ozellikler">
          {[
            [
              "01",
              "Gerçek portföy matematiği",
              "Alış ve satışlardan ortalama maliyet, gerçekleşen ve gerçekleşmemiş kâr/zarar.",
            ],
            [
              "02",
              "Güvenli yatırım bütçesi",
              "Gider, borç, acil fon ve yaklaşan harcamaları önceliklendirir.",
            ],
            [
              "03",
              "Açıklanabilir analiz",
              "Her öneri kullandığın gerçek rakama ve hesaplama nedenine bağlıdır.",
            ],
          ].map(([n, t, d]) => (
            <article key={n}>
              <span>{n}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </section>
        <section className="security-section" id="guvenlik">
          <div>
            <span className="eyebrow">GÜVENLİ SINIRLAR</span>
            <h2>Kontrol her zaman sende.</h2>
          </div>
          <div className="security-grid">
            <p>
              <ShieldCheck />
              Gerçek para işlemi, otomatik alım veya satım yapmaz.
            </p>
            <p>
              <ShieldCheck />
              Kaldıraç ya da borçla yatırım önermez.
            </p>
            <p>
              <ShieldCheck />
              Demo veriler gerçek zamanlı olarak gösterilmez.
            </p>
            <p>
              <ShieldCheck />
              Sonuçlar eğitim amaçlı karar desteğidir.
            </p>
          </div>
        </section>
      </main>
      <footer>
        <Logo />
        <p>© 2026 FinPilot AI · Yatırım danışmanlığı değildir.</p>
      </footer>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="preview-shell">
      <div className="preview-top">
        <span></span>
        <span></span>
        <span></span>
        <b>Canlı panel önizlemesi</b>
      </div>
      <div className="preview-body">
        <aside>
          <Logo compact />
          <i />
          <i />
          <i />
          <i />
          <i />
        </aside>
        <div className="preview-main">
          <div className="preview-greeting">
            <small>Günaydın, Efe</small>
            <strong>Finansal görünümün</strong>
          </div>
          <div className="preview-metrics">
            <div>
              <small>Toplam portföy</small>
              <b>₺218.460</b>
              <em>+₺18.220</em>
            </div>
            <div>
              <small>Aylık bütçe</small>
              <b>₺6.200</b>
              <em>Güvenli aralık</em>
            </div>
            <div>
              <small>Risk puanı</small>
              <b>
                42<small>/100</small>
              </b>
              <em>Dengeli</em>
            </div>
          </div>
          <div className="preview-chart">
            <div>
              <small>Portföy değeri</small>
              <b>Son 6 ay</b>
            </div>
            <svg viewBox="0 0 600 160" preserveAspectRatio="none">
              <defs>
                <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#59e391" stopOpacity=".3" />
                  <stop offset="1" stopColor="#59e391" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 135 C80 122 90 96 155 107 S250 58 320 78 S420 42 480 55 S545 18 600 26 L600 160 L0 160Z"
                fill="url(#fill)"
              />
              <path
                d="M0 135 C80 122 90 96 155 107 S250 58 320 78 S420 42 480 55 S545 18 600 26"
                fill="none"
                stroke="#59e391"
                strokeWidth="3"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthPage({ mode }: { mode: string }) {
  const router = useRouter();
  const { resetDemo } = useStore();
  const [sent, setSent] = useState(false);
  const isRegister = mode === "/kayit";
  const forgot = mode === "/sifremi-unuttum";
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (forgot) setSent(true);
    else {
      resetDemo();
      router.push(isRegister ? "/onboarding" : "/panel");
    }
  };
  return (
    <div className="auth-layout">
      <div className="auth-brand">
        <Logo />
        <div>
          <span className="eyebrow">AKILLI FİNANSAL KONTROL</span>
          <h1>
            Rakamları görmek yetmez.
            <br />
            Ne anlama geldiğini bil.
          </h1>
          <p>
            FinPilot; nakit akışını, riskini ve hedeflerini bir araya getirerek
            daha bilinçli karar vermene yardım eder.
          </p>
        </div>
        <small>Yatırım danışmanlığı değildir.</small>
      </div>
      <div className="auth-panel">
        <form className="auth-card" onSubmit={submit}>
          <div className="mobile-logo">
            <Logo />
          </div>
          <span className="eyebrow">
            {forgot
              ? "HESAP KURTARMA"
              : isRegister
                ? "YENİ HESAP"
                : "TEKRAR HOŞ GELDİN"}
          </span>
          <h2>
            {forgot
              ? "Şifreni yenile"
              : isRegister
                ? "Finansal kontrolü başlat"
                : "Hesabına giriş yap"}
          </h2>
          <p>
            {forgot
              ? "E-posta adresine güvenli yenileme bağlantısı gönderelim."
              : "Demo sürümünde bilgiler yalnızca bu cihazda saklanır."}
          </p>
          {sent ? (
            <div className="success-state">
              <ShieldCheck />
              <h3>Bağlantı hazır</h3>
              <p>
                Demo modunda e-posta gönderilmez. Gerçek kimlik doğrulama için
                Supabase değişkenlerini yapılandır.
              </p>
              <Button type="button" onClick={() => router.push("/giris")}>
                Girişe dön
              </Button>
            </div>
          ) : (
            <>
              {isRegister && (
                <Field label="Ad soyad">
                  <Input required placeholder="Adın ve soyadın" />
                </Field>
              )}
              <Field label="E-posta">
                <Input required type="email" placeholder="ornek@eposta.com" />
              </Field>
              {!forgot && (
                <Field label="Şifre">
                  <Input
                    required
                    type="password"
                    minLength={6}
                    placeholder="En az 6 karakter"
                  />
                </Field>
              )}
              <Button type="submit" className="full">
                {forgot
                  ? "Yenileme bağlantısı gönder"
                  : isRegister
                    ? "Ücretsiz hesap oluştur"
                    : "Giriş yap"}
              </Button>
              {!forgot && (
                <Button
                  type="button"
                  variant="secondary"
                  className="full"
                  onClick={() => {
                    resetDemo();
                    router.push("/panel");
                  }}
                >
                  Demo hesapla devam et
                </Button>
              )}
            </>
          )}
          <div className="auth-links">
            {mode === "/giris" && (
              <>
                <Link href="/sifremi-unuttum">Şifremi unuttum</Link>
                <span>
                  Hesabın yok mu? <Link href="/kayit">Kayıt ol</Link>
                </span>
              </>
            )}
            {isRegister && (
              <span>
                Zaten hesabın var mı? <Link href="/giris">Giriş yap</Link>
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Onboarding() {
  const router = useRouter();
  const { state, setProfile, setOnboarded } = useStore();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(state.profile);
  const update = (key: keyof typeof form, value: number | string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));
  const next = () =>
    step < 4
      ? setStep(step + 1)
      : (setProfile(form), setOnboarded(true), router.push("/panel"));
  return (
    <div className="onboarding">
      <header>
        <Logo />
        <span>Adım {step}/4</span>
      </header>
      <div className="onboarding-progress">
        <i style={{ width: `${step * 25}%` }} />
      </div>
      <main>
        <div className="onboarding-title">
          <span className="step-number">0{step}</span>
          <div>
            <h1>
              {
                [
                  "Gelir ve giderlerin",
                  "Borç ve güvenlik yastığın",
                  "Risk sınırların",
                  "Hedeflerin",
                ][step - 1]
              }
            </h1>
            <p>
              {
                [
                  "Aylık serbest nakit akışını hesaplayalım.",
                  "Yatırımdan önce korunması gereken alanları belirleyelim.",
                  "Sana uygun dalgalanma seviyesini anlayalım.",
                  "Planını hangi amaç için kurduğunu belirt.",
                ][step - 1]
              }
            </p>
          </div>
        </div>
        <div className="onboarding-fields">
          {step === 1 && (
            <>
              <Field label="Aylık net gelir (₺)">
                <Input
                  type="number"
                  value={form.income}
                  onChange={(e) => update("income", +e.target.value)}
                />
              </Field>
              <Field label="Zorunlu giderler (₺)">
                <Input
                  type="number"
                  value={form.essentialExpenses}
                  onChange={(e) => update("essentialExpenses", +e.target.value)}
                />
              </Field>
              <Field label="İsteğe bağlı giderler (₺)">
                <Input
                  type="number"
                  value={form.optionalExpenses}
                  onChange={(e) => update("optionalExpenses", +e.target.value)}
                />
              </Field>
              <Field label="Yaklaşan büyük harcamalar (₺)">
                <Input
                  type="number"
                  value={form.upcomingExpenses}
                  onChange={(e) => update("upcomingExpenses", +e.target.value)}
                />
              </Field>
            </>
          )}
          {step === 2 && (
            <>
              <Field label="Mevcut nakit birikim (₺)">
                <Input
                  type="number"
                  value={form.cashSavings}
                  onChange={(e) => update("cashSavings", +e.target.value)}
                />
              </Field>
              <Field label="Kredi kartı borcu (₺)">
                <Input
                  type="number"
                  value={form.creditCardDebt}
                  onChange={(e) => update("creditCardDebt", +e.target.value)}
                />
              </Field>
              <Field label="Toplam kredi borcu (₺)">
                <Input
                  type="number"
                  value={form.loanDebt}
                  onChange={(e) => update("loanDebt", +e.target.value)}
                />
              </Field>
              <Field label="Aylık borç ödemeleri (₺)">
                <Input
                  type="number"
                  value={form.monthlyDebtPayments}
                  onChange={(e) =>
                    update("monthlyDebtPayments", +e.target.value)
                  }
                />
              </Field>
              <Field label="Acil durum fonu hedefi (₺)">
                <Input
                  type="number"
                  value={form.emergencyTarget}
                  onChange={(e) => update("emergencyTarget", +e.target.value)}
                />
              </Field>
              <Field label="Aylık güvenlik payı (₺)">
                <Input
                  type="number"
                  value={form.safetyMargin}
                  onChange={(e) => update("safetyMargin", +e.target.value)}
                />
              </Field>
            </>
          )}
          {step === 3 && (
            <>
              <Field label={`Risk toleransı: ${form.riskTolerance}/5`}>
                <Input
                  type="range"
                  min="1"
                  max="5"
                  value={form.riskTolerance}
                  onChange={(e) => update("riskTolerance", +e.target.value)}
                />
              </Field>
              <Field label={`Kabul edilebilir azami kayıp: %${form.maxLoss}`}>
                <Input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={form.maxLoss}
                  onChange={(e) => update("maxLoss", +e.target.value)}
                />
              </Field>
              <Field label="Yatırım süresi (yıl)">
                <Input
                  type="number"
                  min="1"
                  max="40"
                  value={form.horizon}
                  onChange={(e) => update("horizon", +e.target.value)}
                />
              </Field>
              <Field label="Deneyim">
                <select
                  className="input"
                  value={form.experience}
                  onChange={(e) => update("experience", e.target.value)}
                >
                  <option>Başlangıç</option>
                  <option>Orta</option>
                  <option>İleri</option>
                </select>
              </Field>
              <label className="toggle-row">
                <span>
                  <b>Kripto para maruziyeti</b>
                  <small>
                    Dağılım planında sınırlı kripto payına izin ver.
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={form.cryptoExposure}
                  onChange={(e) => update("cryptoExposure", e.target.checked)}
                />
                <i />
              </label>
            </>
          )}
          {step === 4 && (
            <>
              <Field label="Yaş aralığı">
                <select
                  className="input"
                  value={form.ageRange}
                  onChange={(e) => update("ageRange", e.target.value)}
                >
                  <option>18–24</option>
                  <option>25–34</option>
                  <option>35–44</option>
                  <option>45–54</option>
                  <option>55+</option>
                </select>
              </Field>
              <div className="goal-picker">
                {[
                  "Acil durum fonu",
                  "Araba",
                  "Ev",
                  "İşletme sermayesi",
                  "Eğitim",
                  "Tatil",
                  "Uzun vadeli birikim",
                  "Emeklilik",
                ].map((g) => (
                  <button
                    type="button"
                    className={form.goals.includes(g) ? "selected" : ""}
                    key={g}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        goals: f.goals.includes(g)
                          ? f.goals.filter((x) => x !== g)
                          : [...f.goals, g],
                      }))
                    }
                  >
                    {g}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="onboarding-actions">
          <Button
            variant="ghost"
            disabled={step === 1}
            onClick={() => setStep(step - 1)}
          >
            Geri
          </Button>
          <Button onClick={next}>
            {step === 4 ? "Panelimi oluştur" : "Devam et"}
            <ChevronRight size={17} />
          </Button>
        </div>
      </main>
    </div>
  );
}

function AppShell() {
  const pathname = usePathname();
  const router = useRouter();
  const { state, markNotificationsRead } = useStore();
  const [mobile, setMobile] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const unread = state.notifications.filter((n) => !n.read).length;
  const title = useMemo(
    () =>
      nav.find(([href]) => pathname === href)?.[1] ||
      (pathname.startsWith("/varlik/") ? "Varlık Analizi" : "FinPilot"),
    [pathname],
  );
  useEffect(() => setMobile(false), [pathname]);
  return (
    <div className="app-shell">
      <PwaRegister />
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="sidebar-top">
          <Logo />
          <button className="mobile-close" onClick={() => setMobile(false)}>
            <X />
          </button>
        </div>
        <nav>
          {nav.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              className={pathname === href ? "active" : ""}
            >
              <Icon size={19} />
              <span>{label}</span>
              {label === "FinPilot Asistan" && <em>AI</em>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="legal-note">
            <ShieldCheck size={17} />
            <span>
              <b>Eğitim amaçlıdır</b>Yatırım danışmanlığı değildir.
            </span>
          </div>
          <button onClick={() => router.push("/")}>
            <LogOut size={18} /> Çıkış yap
          </button>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <button className="menu-button" onClick={() => setMobile(true)}>
              <Menu />
            </button>
            <div>
              <small>FinPilot /</small>
              <strong>{title}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <button
              className="search-button"
              onClick={() => router.push("/piyasalar")}
            >
              <Search size={18} />
              <span>Varlık ara...</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="icon-button"
              title="Görünüm ayarları"
              onClick={() => router.push("/ayarlar")}
            >
              <Moon size={19} />
            </button>
            <div className="notification-wrap">
              <button
                className="icon-button"
                onClick={() => setNotifications(!notifications)}
              >
                <Bell size={19} />
                {unread > 0 && <i>{unread}</i>}
              </button>
              {notifications && (
                <div className="notification-pop">
                  <div>
                    <h3>Bildirimler</h3>
                    <button onClick={markNotificationsRead}>
                      Tümünü okundu yap
                    </button>
                  </div>
                  {state.notifications.map((n) => (
                    <article
                      key={n.id}
                      className={`${n.tone} ${n.read ? "read" : ""}`}
                    >
                      <i />
                      <span>
                        <b>{n.title}</b>
                        <p>{n.body}</p>
                        <small>{n.time}</small>
                      </span>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <div className="avatar">EC</div>
          </div>
        </header>
        <main className="app-content">
          {pathname === "/panel" && <DashboardPage />}
          {pathname === "/portfoy" && <PortfolioPage />}
          {pathname === "/butce" && <BudgetPage />}
          {pathname === "/dagilim" && <AllocationPage />}
          {pathname === "/piyasalar" && <MarketsPage />}
          {pathname === "/takip" && <WatchlistPage />}
          {pathname === "/asistan" && <AssistantPage />}
          {pathname === "/raporlar" && <ReportsPage />}
          {pathname === "/hedefler" && <GoalsPage />}
          {pathname === "/ayarlar" && <SettingsPage />}
          {pathname.startsWith("/varlik/") && (
            <MarketsPage assetId={pathname.split("/").pop()} />
          )}
        </main>
        <nav className="mobile-nav">
          {nav.slice(0, 5).map(([href, label, Icon]) => (
            <Link
              href={href}
              key={href}
              className={pathname === href ? "active" : ""}
            >
              <Icon />
              <span>{label.split(" ")[0]}</span>
            </Link>
          ))}
        </nav>
      </div>
      {mobile && (
        <div className="sidebar-overlay" onClick={() => setMobile(false)} />
      )}
    </div>
  );
}
