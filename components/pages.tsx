"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  Bot,
  Check,
  ChevronDown,
  CircleDollarSign,
  Download,
  FileDown,
  FileText,
  Filter,
  Flag,
  Info,
  Landmark,
  MoreHorizontal,
  Pencil,
  PieChart as PieIcon,
  Plus,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  WalletCards,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStore } from "@/lib/store";
import {
  calculateBudget,
  calculateRiskProfile,
  formatPct,
  formatTRY,
  generateAiInsights,
  parseCsvTransactions,
  portfolioSummary,
  recommendedAllocation,
} from "@/lib/calculations";
import type {
  Alert,
  Asset,
  FinancialProfile,
  Goal,
  Transaction,
} from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  PageHeader,
  Progress,
  Select,
} from "./ui";

const GREEN = "#59e391";
const COLORS = [
  "#59e391",
  "#d7ff68",
  "#55a7ff",
  "#b987ff",
  "#ffbd61",
  "#ff6f91",
  "#60d6d0",
  "#9aa6a0",
];
const today = new Date().toISOString().slice(0, 10);

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <small>{label}</small>
      {payload.map((p, i) => (
        <p key={i}>
          <i style={{ background: p.color }} />
          {p.name}: <b>{formatTRY(Number(p.value), true)}</b>
        </p>
      ))}
    </div>
  );
}

function Notice({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="toast">
      <Check size={17} />
      {text}
      <button onClick={onClose}>
        <X size={15} />
      </button>
    </div>
  );
}

export function DashboardPage() {
  const { state } = useStore();
  const s = portfolioSummary(state);
  const budget = calculateBudget(state.profile);
  const insights = generateAiInsights(state);
  const months = ["Şub", "Mar", "Nis", "May", "Haz", "Tem"].map((month, i) => ({
    month,
    value: Math.round(s.value * [0.78, 0.82, 0.87, 0.9, 0.96, 1][i]),
    invested: Math.round(s.invested * [0.74, 0.78, 0.83, 0.88, 0.94, 1][i]),
  }));
  const allocation = Object.entries(s.allocations).map(([name, value]) => ({
    name,
    value,
  }));
  return (
    <div className="page">
      <PageHeader
        eyebrow="14 TEMMUZ 2026 · SALI"
        title={`Merhaba, ${state.userName.split(" ")[0]}.`}
        text="Finansal durumunun bugünkü özeti ve dikkat edilmesi gereken noktalar."
        actions={
          <>
            <Badge tone="warning">Demo piyasa verisi</Badge>
            <Link href="/portfoy">
              <Button>
                <Plus size={17} /> İşlem ekle
              </Button>
            </Link>
          </>
        }
      />
      <div className="metric-grid dashboard-metrics">
        <Metric
          label="Toplam portföy"
          value={formatTRY(s.value, true)}
          change={formatPct(s.profitPercent)}
          icon={<WalletCards />}
        />
        <Metric
          label="Toplam kâr / zarar"
          value={formatTRY(s.profit, true)}
          change={`${s.profit >= 0 ? "Kazanç" : "Kayıp"}`}
          positive={s.profit >= 0}
          icon={<TrendingUp />}
        />
        <Metric
          label="Bugünkü değişim"
          value={formatTRY(s.daily, true)}
          change={formatPct(s.value ? (s.daily / s.value) * 100 : 0)}
          positive={s.daily >= 0}
          icon={<ArrowUpRight />}
        />
        <Metric
          label="Aylık yatırım bütçesi"
          value={formatTRY(budget.balanced, true)}
          change="Dengeli seviye"
          icon={<CircleDollarSign />}
        />
      </div>
      <div className="dashboard-grid">
        <Card className="chart-card span-2">
          <div className="card-title">
            <div>
              <span>PORTFÖY PERFORMANSI</span>
              <h2>Değer gelişimi</h2>
            </div>
            <Badge tone="success">
              Son 6 ay +{formatPct(s.profitPercent).replace("+", "")}
            </Badge>
          </div>
          <div className="large-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={months}>
                <defs>
                  <linearGradient
                    id="portfolioFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0" stopColor={GREEN} stopOpacity={0.28} />
                    <stop offset="1" stopColor={GREEN} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#173028" vertical={false} />
                <XAxis
                  dataKey="month"
                  stroke="#6e827a"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide domain={["dataMin - 10000", "dataMax + 10000"]} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Portföy"
                  stroke={GREEN}
                  fill="url(#portfolioFill)"
                  strokeWidth={2.5}
                />
                <Line
                  type="monotone"
                  dataKey="invested"
                  name="Yatırılan"
                  stroke="#7c9188"
                  strokeDasharray="5 5"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="allocation-card">
          <div className="card-title">
            <div>
              <span>DAĞILIM</span>
              <h2>Varlık sınıfları</h2>
            </div>
            <Link href="/dagilim">Detay</Link>
          </div>
          <div className="donut">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={allocation}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={88}
                  paddingAngle={3}
                >
                  {allocation.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatTRY(Number(v), true)} />
              </PieChart>
            </ResponsiveContainer>
            <div>
              <b>{allocation.length}</b>
              <small>varlık sınıfı</small>
            </div>
          </div>
          <div className="legend-list">
            {allocation
              .sort((a, b) => b.value - a.value)
              .slice(0, 5)
              .map((a, i) => (
                <div key={a.name}>
                  <i style={{ background: COLORS[i] }} />
                  <span>{a.name}</span>
                  <b>%{((a.value / s.value) * 100).toFixed(1)}</b>
                </div>
              ))}
          </div>
        </Card>
        <Card className="ai-summary span-2">
          <div className="ai-head">
            <span>
              <Sparkles size={20} />
            </span>
            <div>
              <small>ÜCRETSİZ VERİ TABANLI ANALİZ</small>
              <h2>FinPilot AI Özeti</h2>
            </div>
            <Link href="/asistan">
              Asistana sor <ArrowRight size={15} />
            </Link>
          </div>
          <div className="insight-grid">
            {insights.slice(0, 3).map((x, i) => (
              <article key={x}>
                <Badge
                  tone={i === 0 ? "warning" : i === 1 ? "info" : "success"}
                >
                  {["Dikkat", "Bütçe", "Risk"][i]}
                </Badge>
                <p>{x}</p>
                <small>
                  <Info size={13} /> Kullanıcı verilerinden hesaplandı
                </small>
              </article>
            ))}
          </div>
        </Card>
        <Card>
          <div className="card-title">
            <div>
              <span>FİNANSAL SAĞLIK</span>
              <h2>Koruma katmanın</h2>
            </div>
            <ShieldCheck size={22} />
          </div>
          <HealthRow
            label="Acil durum fonu"
            value={budget.emergencyPercent}
            text={`%${budget.emergencyPercent.toFixed(0)}`}
            tone="lime"
          />
          <HealthRow
            label="Çeşitlendirme"
            value={s.diversification}
            text={`${s.diversification.toFixed(0)}/100`}
          />
          <HealthRow
            label="Risk kontrolü"
            value={100 - s.riskScore}
            text={`${s.riskScore.toFixed(0)} risk`}
            tone="blue"
          />
          <Link className="card-link" href="/raporlar">
            Sağlık raporunu aç <ArrowRight size={15} />
          </Link>
        </Card>
      </div>
      <p className="disclaimer">
        <ShieldCheck size={14} /> FinPilot, eğitim amaçlı karar desteği sağlar;
        yatırım danışmanlığı veya getiri garantisi sunmaz. Piyasa verileri
        demodur.
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  change,
  positive = true,
  icon,
}: {
  label: string;
  value: string;
  change: string;
  positive?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Card className="metric-card">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <h2>{value}</h2>
      <small className={positive ? "up" : "down"}>
        {positive ? <ArrowUpRight /> : <ArrowDownRight />}
        {change}
      </small>
    </Card>
  );
}
function HealthRow({
  label,
  value,
  text,
  tone = "green",
}: {
  label: string;
  value: number;
  text: string;
  tone?: "green" | "lime" | "orange" | "blue";
}) {
  return (
    <div className="health-row">
      <div>
        <span>{label}</span>
        <b>{text}</b>
      </div>
      <Progress value={value} tone={tone} />
    </div>
  );
}

export function PortfolioPage() {
  const store = useStore();
  const { state } = store;
  const s = portfolioSummary(state);
  const [modal, setModal] = useState<"add" | "import" | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const filtered = s.holdings.filter((h) =>
    `${h.asset.name} ${h.asset.symbol}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const exportCsv = () => {
    const rows = [
      "assetId,type,quantity,price,commission,date,note",
      ...state.transactions.map((t) =>
        [
          t.assetId,
          t.type,
          t.quantity,
          t.price,
          t.commission,
          t.date,
          `"${t.note || ""}"`,
        ].join(","),
      ),
    ];
    download("finpilot-islemler.csv", rows.join("\n"));
    setNotice("CSV dosyası hazırlandı.");
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="PORTFÖY YÖNETİMİ"
        title="Varlıkların"
        text="İşlemlerden hesaplanan maliyet, güncel değer ve kâr/zarar görünümü."
        actions={
          <>
            <Button variant="secondary" onClick={() => setModal("import")}>
              <Upload size={16} /> CSV içe aktar
            </Button>
            <Button onClick={() => setModal("add")}>
              <Plus size={16} /> İşlem ekle
            </Button>
          </>
        }
      />
      <div className="metric-grid three">
        <Metric
          label="Güncel değer"
          value={formatTRY(s.value, true)}
          change={`${s.holdings.length} pozisyon`}
          icon={<WalletCards />}
        />
        <Metric
          label="Yatırılan tutar"
          value={formatTRY(s.invested, true)}
          change="İşlem bazlı"
          icon={<Landmark />}
        />
        <Metric
          label="Net gerçekleşmemiş K/Z"
          value={formatTRY(s.profit, true)}
          change={formatPct(s.profitPercent)}
          positive={s.profit >= 0}
          icon={<TrendingUp />}
        />
      </div>
      <Card className="table-card">
        <div className="table-toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Varlık veya sembol ara"
            />
          </div>
          <div>
            <Button variant="ghost" onClick={exportCsv}>
              <Download size={16} /> Dışa aktar
            </Button>
          </div>
        </div>
        {filtered.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Varlık</th>
                  <th>Miktar</th>
                  <th>Ort. maliyet</th>
                  <th>Güncel fiyat</th>
                  <th>Değer</th>
                  <th>Kâr / zarar</th>
                  <th>Ağırlık</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h) => (
                  <tr key={h.asset.id}>
                    <td>
                      <Link
                        href={`/varlik/${h.asset.id}`}
                        className="asset-cell"
                      >
                        <AssetIcon asset={h.asset} />
                        <span>
                          <b>{h.asset.symbol}</b>
                          <small>{h.asset.name}</small>
                        </span>
                      </Link>
                    </td>
                    <td>
                      {h.quantity.toLocaleString("tr-TR", {
                        maximumFractionDigits: 4,
                      })}
                    </td>
                    <td>{formatTRY(h.averageCost)}</td>
                    <td>{formatTRY(h.asset.price)}</td>
                    <td>
                      <b>{formatTRY(h.value)}</b>
                    </td>
                    <td className={h.profit >= 0 ? "positive" : "negative"}>
                      <b>{formatTRY(h.profit)}</b>
                      <small>{formatPct(h.profitPercent)}</small>
                    </td>
                    <td>%{((h.value / s.value) * 100).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Eşleşen varlık yok"
            text="Arama ifadesini değiştir veya yeni işlem ekle."
          />
        )}
      </Card>
      <Card className="table-card">
        <div className="card-title">
          <div>
            <span>HAREKETLER</span>
            <h2>İşlem geçmişi</h2>
          </div>
          <Badge>{state.transactions.length} işlem</Badge>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Varlık</th>
                <th>Tür</th>
                <th>Miktar</th>
                <th>Fiyat</th>
                <th>Komisyon</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...state.transactions]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((t) => {
                  const a = state.assets.find((x) => x.id === t.assetId);
                  return (
                    <tr key={t.id}>
                      <td>{new Date(t.date).toLocaleDateString("tr-TR")}</td>
                      <td>
                        <b>{a?.symbol || t.assetId}</b>
                      </td>
                      <td>
                        <Badge tone={t.type === "Alış" ? "success" : "danger"}>
                          {t.type}
                        </Badge>
                      </td>
                      <td>{t.quantity}</td>
                      <td>{formatTRY(t.price)}</td>
                      <td>{formatTRY(t.commission)}</td>
                      <td>
                        <button
                          className="table-action"
                          onClick={() => setEditing(t)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="table-action danger"
                          onClick={() => {
                            if (confirm("Bu işlem silinsin mi?")) {
                              store.deleteTransaction(t.id);
                              setNotice("İşlem silindi.");
                            }
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>
      {modal === "add" && (
        <TransactionModal
          assets={state.assets}
          onClose={() => setModal(null)}
          onSave={(t) => {
            store.addTransaction(t);
            setModal(null);
            setNotice("İşlem portföye eklendi.");
          }}
        />
      )}
      {editing && (
        <TransactionModal
          assets={state.assets}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(t) => {
            store.updateTransaction({ ...t, id: editing.id });
            setEditing(null);
            setNotice("İşlem güncellendi.");
          }}
        />
      )}
      {modal === "import" && (
        <ImportModal
          onClose={() => setModal(null)}
          onImport={(txs) => {
            store.importTransactions(txs);
            setModal(null);
            setNotice(`${txs.length} işlem içe aktarıldı.`);
          }}
        />
      )}
      {notice && <Notice text={notice} onClose={() => setNotice("")} />}
    </div>
  );
}

function AssetIcon({ asset }: { asset: Asset }) {
  return (
    <span
      className={`asset-icon c-${asset.category.replaceAll(" ", "").replace("/", "").toLowerCase()}`}
    >
      {asset.symbol.slice(0, 2)}
    </span>
  );
}

function TransactionModal({
  assets,
  initial,
  onClose,
  onSave,
}: {
  assets: Asset[];
  initial?: Transaction;
  onClose: () => void;
  onSave: (t: Omit<Transaction, "id">) => void;
}) {
  const [form, setForm] = useState<Omit<Transaction, "id">>(
    initial
      ? {
          assetId: initial.assetId,
          type: initial.type,
          quantity: initial.quantity,
          price: initial.price,
          commission: initial.commission,
          date: initial.date,
          note: initial.note,
        }
      : {
          assetId: assets[1]?.id || assets[0].id,
          type: "Alış",
          quantity: 1,
          price: assets[1]?.price || 0,
          commission: 0,
          date: today,
          note: "",
        },
  );
  const set = (key: keyof typeof form, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.quantity <= 0 || form.price < 0) return;
    onSave(form);
  };
  return (
    <Modal
      title={initial ? "İşlemi düzenle" : "Yeni işlem ekle"}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <Field label="Varlık">
          <Select
            value={form.assetId}
            onChange={(e) => {
              const a = assets.find((x) => x.id === e.target.value);
              setForm((f) => ({
                ...f,
                assetId: e.target.value,
                price: a?.price || f.price,
              }));
            }}
          >
            {assets.map((a) => (
              <option value={a.id} key={a.id}>
                {a.symbol} — {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="İşlem türü">
          <Select
            value={form.type}
            onChange={(e) => set("type", e.target.value)}
          >
            <option>Alış</option>
            <option>Satış</option>
          </Select>
        </Field>
        <Field label="Miktar">
          <Input
            required
            type="number"
            min="0.000001"
            step="any"
            value={form.quantity}
            onChange={(e) => set("quantity", +e.target.value)}
          />
        </Field>
        <Field label="Birim fiyat">
          <Input
            required
            type="number"
            min="0"
            step="any"
            value={form.price}
            onChange={(e) => set("price", +e.target.value)}
          />
        </Field>
        <Field label="Komisyon">
          <Input
            type="number"
            min="0"
            step="any"
            value={form.commission}
            onChange={(e) => set("commission", +e.target.value)}
          />
        </Field>
        <Field label="Tarih">
          <Input
            required
            type="date"
            value={form.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </Field>
        <Field label="Not (isteğe bağlı)">
          <Input
            maxLength={120}
            value={form.note || ""}
            onChange={(e) => set("note", e.target.value)}
            placeholder="İşlem notu"
          />
        </Field>
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit">
            {initial ? "Değişiklikleri kaydet" : "İşlemi ekle"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (txs: Omit<Transaction, "id">[]) => void;
}) {
  const [csv, setCsv] = useState(
    "assetId,type,quantity,price,commission,date,note\ngold,Alış,1,4750,5,2026-07-01,Örnek işlem",
  );
  const [error, setError] = useState("");
  const submit = () => {
    try {
      const txs = parseCsvTransactions(csv);
      if (!txs.length) throw new Error("Geçerli işlem bulunamadı.");
      onImport(txs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV okunamadı.");
    }
  };
  return (
    <Modal title="CSV işlemlerini içe aktar" onClose={onClose} wide>
      <div className="import-help">
        <Info size={18} />
        <p>
          Başlıklar şu sırada olmalı:{" "}
          <code>assetId,type,quantity,price,commission,date,note</code>. Dosya
          içeriği zararlı karakterlere karşı temizlenir.
        </p>
      </div>
      <textarea
        className="textarea csv"
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
      />
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <Button variant="ghost" onClick={onClose}>
          Vazgeç
        </Button>
        <Button onClick={submit}>
          <Upload size={16} /> İçe aktar
        </Button>
      </div>
    </Modal>
  );
}

export function BudgetPage() {
  const { state, setProfile } = useStore();
  const [profile, setLocal] = useState(state.profile);
  const [saved, setSaved] = useState(false);
  const result = calculateBudget(profile);
  const set = (key: keyof FinancialProfile, value: number) =>
    setLocal((p) => ({ ...p, [key]: Math.max(0, value) }));
  const save = () => {
    setProfile(profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="NAKİT AKIŞI"
        title="Ne kadar yatırım yapabilirim?"
        text="Önce zorunlu giderleri, borçları ve güvenlik yastığını koruyan aylık yatırım sınırları."
        actions={
          <Button onClick={save}>
            {saved ? <Check size={17} /> : <RefreshCcw size={17} />}{" "}
            {saved ? "Kaydedildi" : "Hesaplamayı kaydet"}
          </Button>
        }
      />
      <div className="budget-layout">
        <Card className="budget-form">
          <div className="card-title">
            <div>
              <span>AYLIK VERİLER</span>
              <h2>Gelir ve öncelikler</h2>
            </div>
            <Badge tone="info">Düzenlenebilir</Badge>
          </div>
          <div className="form-grid two">
            {[
              ["income", "Net gelir"],
              ["essentialExpenses", "Zorunlu giderler"],
              ["optionalExpenses", "İsteğe bağlı giderler"],
              ["monthlyDebtPayments", "Minimum borç ödemeleri"],
              ["creditCardDebt", "Kredi kartı borcu"],
              ["cashSavings", "Nakit birikim"],
              ["emergencyTarget", "Acil fon hedefi"],
              ["upcomingExpenses", "Yaklaşan büyük harcamalar"],
              ["safetyMargin", "Güvenlik payı"],
            ].map(([key, label]) => (
              <Field key={key} label={`${label} (₺)`}>
                <Input
                  type="number"
                  value={Number(profile[key as keyof FinancialProfile])}
                  onChange={(e) =>
                    set(key as keyof FinancialProfile, +e.target.value)
                  }
                />
              </Field>
            ))}
          </div>
        </Card>
        <div className="budget-results">
          <Card className="budget-hero">
            <span className="eyebrow">ÖNERİLEN AYLIK ARALIK</span>
            <h2>
              {formatTRY(result.safe, true)} <small>—</small>{" "}
              {formatTRY(result.balanced, true)}
            </h2>
            <p>
              Üst sınır: <b>{formatTRY(result.upper, true)}</b>
            </p>
            <div className="budget-scale">
              <i
                style={{
                  width: `${result.upper ? (result.safe / result.upper) * 100 : 0}%`,
                }}
              />
              <i
                style={{
                  width: `${result.upper ? (result.balanced / result.upper) * 100 : 0}%`,
                }}
              />
              <i />
            </div>
          </Card>
          <div className="level-cards">
            <Card>
              <i className="level safe" />
              <span>Güvenli Seviye</span>
              <h3>{formatTRY(result.safe, true)}</h3>
              <p>Acil fon ve borç riskine karşı en yüksek koruma.</p>
            </Card>
            <Card>
              <i className="level balanced" />
              <span>Dengeli Seviye</span>
              <h3>{formatTRY(result.balanced, true)}</h3>
              <p>Birikim ve yatırım arasında dengeli yaklaşım.</p>
            </Card>
            <Card>
              <i className="level upper" />
              <span>Üst Sınır</span>
              <h3>{formatTRY(result.upper, true)}</h3>
              <p>Beklenmedik harcamalara karşı daha az esneklik.</p>
            </Card>
          </div>
        </div>
      </div>
      <Card className="calculation-breakdown">
        <div className="card-title">
          <div>
            <span>ŞEFFAF HESAPLAMA</span>
            <h2>Bu rakam nasıl oluştu?</h2>
          </div>
          <Badge tone="success">Borçla yatırım yok</Badge>
        </div>
        <div className="waterfall">
          {[
            ["Aylık net gelir", profile.income, "plus"],
            ["Zorunlu giderler", -profile.essentialExpenses, "minus"],
            ["İsteğe bağlı giderler", -profile.optionalExpenses, "minus"],
            ["Minimum borç ödemeleri", -profile.monthlyDebtPayments, "minus"],
            ["Acil fon katkısı", -result.emergencyContribution, "minus"],
            ["Kredi kartı ek ödemesi", -result.debtExtra, "minus"],
            ["Yaklaşan harcamalar", -profile.upcomingExpenses, "minus"],
            ["Güvenlik payı", -profile.safetyMargin, "minus"],
            ["Yatırım üst sınırı", result.upper, "result"],
          ].map(([label, value, type]) => (
            <div className={String(type)} key={String(label)}>
              <span>{label}</span>
              <b>
                {Number(value) >= 0 ? "+" : "−"}
                {formatTRY(Math.abs(Number(value)), true)}
              </b>
            </div>
          ))}
        </div>
        <p className="explain">
          <Info size={16} /> Öncelik sırası: zorunlu giderler → borç ödemeleri →
          acil durum fonu → yaklaşan harcamalar → yatırım bütçesi. Bu hesap,
          borç alarak yatırım yapmayı hiçbir koşulda önermez.
        </p>
      </Card>
    </div>
  );
}

export function AllocationPage() {
  const { state } = useStore();
  const s = portfolioSummary(state);
  const suggested = recommendedAllocation(state.profile);
  const [limits, setLimits] = useState(suggested);
  const budget = calculateBudget(state.profile);
  const categoryMap: Record<string, string> = {
    Nakit: "Nakit & Para Piyasası",
    Fon: "Türk Fonları",
    Altın: "Altın",
    BIST: "BIST",
    "ABD Hisse/ETF": "Uluslararası",
    Kripto: "Kripto",
    Döviz: "Nakit & Para Piyasası",
    Diğer: "Alternatif",
  };
  const current = Object.entries(s.allocations).reduce<Record<string, number>>(
    (a, [k, v]) => {
      const key = categoryMap[k] || "Alternatif";
      a[key] = (a[key] || 0) + (v / s.value) * 100;
      return a;
    },
    {},
  );
  const total = Object.values(limits).reduce((a, b) => a + b, 0);
  const chart = Object.entries(limits).map(([name, value]) => ({
    name,
    value,
  }));
  const update = (key: string, v: number) =>
    setLimits((x) => ({ ...x, [key]: Math.max(0, Math.min(100, v)) }));
  const normalize = () => {
    const t = Object.values(limits).reduce((a, b) => a + b, 0) || 1;
    const entries = Object.entries(limits);
    let used = 0;
    const n = Object.fromEntries(
      entries.map(([k, v], i) => {
        const val =
          i === entries.length - 1 ? 100 - used : Math.round((v / t) * 100);
        used += val;
        return [k, val];
      }),
    );
    setLimits(n);
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="PORTFÖY PLANI"
        title="Dağılım önerisi"
        text={`${calculateRiskProfile(state.profile)} risk profiline ve mevcut finansal durumuna göre senaryo.`}
        actions={
          <>
            <Badge tone={total === 100 ? "success" : "danger"}>
              Toplam %{total}
            </Badge>
            {total !== 100 && (
              <Button onClick={normalize}>100’e dengele</Button>
            )}
          </>
        }
      />
      <div className="allocation-layout">
        <Card className="allocation-compare">
          <div className="card-title">
            <div>
              <span>KARŞILAŞTIRMA</span>
              <h2>Mevcut ve önerilen</h2>
            </div>
            <Badge tone="warning">Senaryo, tavsiye değil</Badge>
          </div>
          <div className="allocation-bars">
            {Object.entries(limits).map(([name, value], i) => (
              <div key={name}>
                <div>
                  <span>
                    <i style={{ background: COLORS[i] }} />
                    {name}
                  </span>
                  <b>
                    %{(current[name] || 0).toFixed(1)} <ArrowRight size={14} />{" "}
                    %{value}
                  </b>
                </div>
                <div className="dual-bar">
                  <i style={{ width: `${current[name] || 0}%` }} />
                  <em style={{ width: `${value}%`, background: COLORS[i] }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="suggested-donut">
          <div className="card-title">
            <div>
              <span>HEDEF DAĞILIM</span>
              <h2>Önerilen görünüm</h2>
            </div>
          </div>
          <div className="donut large">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chart}
                  dataKey="value"
                  innerRadius={78}
                  outerRadius={112}
                  paddingAngle={2}
                >
                  {chart.map((_, i) => (
                    <Cell fill={COLORS[i]} key={i} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `%${v}`} />
              </PieChart>
            </ResponsiveContainer>
            <div>
              <b>%{total}</b>
              <small>toplam</small>
            </div>
          </div>
          <div className="risk-before-after">
            <div>
              <span>Mevcut risk</span>
              <b>{s.riskScore.toFixed(0)}/100</b>
            </div>
            <ArrowRight />
            <div>
              <span>Senaryo riski</span>
              <b>{Math.max(12, s.riskScore - 7).toFixed(0)}/100</b>
            </div>
          </div>
        </Card>
      </div>
      <Card>
        <div className="card-title">
          <div>
            <span>SINIRLARI ÖZELLEŞTİR</span>
            <h2>Hedef yüzdeler</h2>
          </div>
          <small>Kripto payı risk profiline göre sınırlıdır.</small>
        </div>
        <div className="slider-grid">
          {Object.entries(limits).map(([name, value]) => (
            <Field key={name} label={`${name} — %${value}`}>
              <Input
                type="range"
                min="0"
                max={
                  name === "Kripto" &&
                  calculateRiskProfile(state.profile).includes("Temkinli")
                    ? 5
                    : 100
                }
                value={value}
                onChange={(e) => update(name, +e.target.value)}
              />
            </Field>
          ))}
        </div>
      </Card>
      <Card className="contribution-plan">
        <div className="card-title">
          <div>
            <span>AYLIK KATKI PLANI</span>
            <h2>{formatTRY(budget.balanced, true)} nasıl dağıtılabilir?</h2>
          </div>
        </div>
        <div>
          {Object.entries(limits)
            .filter(([, v]) => v > 0)
            .map(([name, value], i) => (
              <article key={name}>
                <i style={{ background: COLORS[i % COLORS.length] }} />
                <span>{name}</span>
                <b>{formatTRY((budget.balanced * value) / 100, true)}</b>
                <small>%{value}</small>
              </article>
            ))}
        </div>
        <p className="explain">
          <Info size={16} /> Bu senaryo beklenen getiri vaat etmez. Dağılım;
          risk profili, süre, acil fon açığı, borç seviyesi ve mevcut yoğunlaşma
          kullanılarak oluşturuldu.
        </p>
      </Card>
    </div>
  );
}

export function MarketsPage({ assetId }: { assetId?: string }) {
  const { state, toggleWatchAsset } = useStore();
  const [search, setSearch] = useState("");
  const [market, setMarket] = useState("Tümü");
  const asset = assetId
    ? state.assets.find((a) => a.id === assetId)
    : undefined;
  if (asset) return <AssetDetail asset={asset} />;
  const items = state.assets.filter((a) => {
    const matchesSearch = `${a.name} ${a.symbol}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesMarket =
      market === "Tümü" ||
      (market === "BIST" && a.category === "BIST") ||
      (market === "ABD" && a.category === "ABD Hisse/ETF") ||
      (market === "Kripto" && a.category === "Kripto") ||
      (market === "Emtia" && ["Altın", "Diğer"].includes(a.category));
    return matchesSearch && matchesMarket;
  });
  return (
    <div className="page">
      <PageHeader
        eyebrow="PİYASA MERKEZİ"
        title="Piyasalar"
        text="Demo sağlayıcıdan gecikmeli örnek fiyatlar. Gerçek zamanlı veri olarak kullanılmamalıdır."
        actions={<Badge tone="warning">Demo veri · 15 dk gecikmeli</Badge>}
      />
      <div className="market-overview">
        {[
          ["BIST 100", "12.184", 0.74],
          ["S&P 500", "6.241", 0.32],
          ["Bitcoin", "₺2,84 Mn", -2.18],
          ["Gram Altın", "₺4.820", 0.74],
        ].map(([n, v, c]) => (
          <Card key={String(n)}>
            <span>{n}</span>
            <h2>{v}</h2>
            <small className={Number(c) >= 0 ? "positive" : "negative"}>
              {formatPct(Number(c))}
            </small>
          </Card>
        ))}
      </div>
      <Card className="market-table">
        <div className="table-toolbar">
          <div className="search-input">
            <Search />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Piyasalarda ara"
            />
          </div>
          <div className="market-tabs">
            {["Tümü", "BIST", "ABD", "Kripto", "Emtia"].map((tab) => (
              <button
                key={tab}
                className={market === tab ? "active" : ""}
                onClick={() => setMarket(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Varlık</th>
                <th>Kategori</th>
                <th>Fiyat</th>
                <th>24s değişim</th>
                <th>Volatilite</th>
                <th>Takip</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const watched = state.watchlists[0]?.assetIds.includes(a.id);
                return (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/varlik/${a.id}`} className="asset-cell">
                        <AssetIcon asset={a} />
                        <span>
                          <b>{a.symbol}</b>
                          <small>{a.name}</small>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <Badge>{a.category}</Badge>
                    </td>
                    <td>
                      <b>{formatTRY(a.price)}</b>
                    </td>
                    <td className={a.change >= 0 ? "positive" : "negative"}>
                      {formatPct(a.change)}
                    </td>
                    <td>
                      <span
                        className={`risk-dot ${a.volatility > 40 ? "high" : a.volatility > 20 ? "medium" : "low"}`}
                      />
                      {a.volatility > 40
                        ? "Yüksek"
                        : a.volatility > 20
                          ? "Orta"
                          : "Düşük"}
                    </td>
                    <td>
                      <button
                        className={`watch-button ${watched ? "active" : ""}`}
                        onClick={() =>
                          toggleWatchAsset(state.watchlists[0].id, a.id)
                        }
                      >
                        {watched ? <Check /> : <Plus />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function AssetDetail({ asset }: { asset: Asset }) {
  const { state, addAlert } = useStore();
  const s = portfolioSummary(state);
  const holding = s.holdings.find((h) => h.asset.id === asset.id);
  const [alert, setAlert] = useState(false);
  const chart = [82, 85, 81, 89, 93, 91, 98, 101, 99, 107, 105, 110].map(
    (x, i) => ({
      day: `${i + 1} Tem`,
      price: (asset.price * x) / 110,
      ma: (asset.price * (x - 2)) / 110,
    }),
  );
  return (
    <div className="page">
      <div className="asset-detail-head">
        <Link href="/piyasalar">← Piyasalar</Link>
        <div>
          <AssetIcon asset={asset} />
          <span>
            <h1>{asset.name}</h1>
            <p>
              {asset.symbol} · {asset.category}
            </p>
          </span>
        </div>
        <div>
          <h2>{formatTRY(asset.price)}</h2>
          <Badge tone={asset.change >= 0 ? "success" : "danger"}>
            {formatPct(asset.change)}
          </Badge>
        </div>
      </div>
      <div className="asset-detail-grid">
        <Card className="span-2">
          <div className="card-title">
            <div>
              <span>FİYAT GRAFİĞİ</span>
              <h2>Son 12 gün</h2>
            </div>
            <Badge tone="warning">Demo</Badge>
          </div>
          <div className="large-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <CartesianGrid stroke="#173028" vertical={false} />
                <XAxis dataKey="day" hide />
                <YAxis hide domain={["dataMin - 100", "dataMax + 100"]} />
                <Tooltip formatter={(v) => formatTRY(Number(v))} />
                <Line
                  dataKey="price"
                  name="Fiyat"
                  stroke={GREEN}
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  dataKey="ma"
                  name="Hareketli ort."
                  stroke="#7c9188"
                  strokeDasharray="4 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <div className="card-title">
            <div>
              <span>POZİSYONUN</span>
              <h2>Portföy bilgisi</h2>
            </div>
          </div>
          {holding ? (
            <div className="position-stats">
              <div>
                <span>Miktar</span>
                <b>{holding.quantity}</b>
              </div>
              <div>
                <span>Ortalama maliyet</span>
                <b>{formatTRY(holding.averageCost)}</b>
              </div>
              <div>
                <span>Güncel değer</span>
                <b>{formatTRY(holding.value)}</b>
              </div>
              <div>
                <span>Kâr / zarar</span>
                <b className={holding.profit >= 0 ? "positive" : "negative"}>
                  {formatTRY(holding.profit)} (
                  {formatPct(holding.profitPercent)})
                </b>
              </div>
              <div>
                <span>Portföy ağırlığı</span>
                <b>%{((holding.value / s.value) * 100).toFixed(1)}</b>
              </div>
            </div>
          ) : (
            <Empty
              title="Pozisyonun yok"
              text="Bu varlık yalnızca takip listende bulunabilir."
            />
          )}
          <Button
            className="full"
            variant="secondary"
            onClick={() => setAlert(true)}
          >
            <BellRing size={16} /> Fiyat uyarısı kur
          </Button>
        </Card>
        <Card>
          <div className="card-title">
            <div>
              <span>TEMEL RİSK</span>
              <h2>Risk göstergeleri</h2>
            </div>
          </div>
          <HealthRow
            label="Volatilite"
            value={asset.volatility}
            text={`${asset.volatility}/100`}
            tone={asset.volatility > 40 ? "orange" : "green"}
          />
          <div className="fact-list">
            <div>
              <span>Piyasa değeri</span>
              <b>Veri mevcut değil</b>
            </div>
            <div>
              <span>Değerleme oranları</span>
              <b>Veri mevcut değil</b>
            </div>
            <div>
              <span>Haber duyarlılığı</span>
              <b>Veri mevcut değil</b>
            </div>
          </div>
          <p className="explain">
            <Info size={15} /> Sağlayıcı yapılandırılmadığı için eksik veriler
            tahmin edilmedi.
          </p>
        </Card>
      </div>
      {alert && (
        <AlertModal
          asset={asset}
          onClose={() => setAlert(false)}
          onSave={(a) => {
            addAlert(a);
            setAlert(false);
          }}
        />
      )}
    </div>
  );
}

export function WatchlistPage() {
  const store = useStore();
  const { state } = store;
  const [listId, setListId] = useState(state.watchlists[0]?.id);
  const [newName, setNewName] = useState("");
  const [showAlert, setShowAlert] = useState(false);
  const active =
    state.watchlists.find((w) => w.id === listId) || state.watchlists[0];
  const assets = active
    ? state.assets.filter((a) => active.assetIds.includes(a.id))
    : [];
  return (
    <div className="page">
      <PageHeader
        eyebrow="İZLEME MERKEZİ"
        title="Takip listeleri ve uyarılar"
        text="İlgilendiğin varlıkları izle; fiyat, hareket ve finansal sağlık sınırları belirle."
        actions={
          <Button onClick={() => setShowAlert(true)}>
            <BellRing size={16} /> Uyarı oluştur
          </Button>
        }
      />
      <div className="watch-layout">
        <Card className="watch-sidebar">
          <div className="card-title">
            <div>
              <span>LİSTELER</span>
              <h2>Takip listelerim</h2>
            </div>
          </div>
          {state.watchlists.map((w) => (
            <button
              className={w.id === active?.id ? "active" : ""}
              onClick={() => setListId(w.id)}
              key={w.id}
            >
              <span>{w.name}</span>
              <Badge>{w.assetIds.length}</Badge>
            </button>
          ))}
          <div className="inline-create">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Yeni liste adı"
            />
            <button
              onClick={() => {
                if (newName.trim()) {
                  store.addWatchlist(newName.trim());
                  setNewName("");
                }
              }}
            >
              <Plus />
            </button>
          </div>
        </Card>
        <Card className="watch-main">
          <div className="card-title">
            <div>
              <span>SEÇİLİ LİSTE</span>
              <h2>{active?.name || "Liste yok"}</h2>
            </div>
            <Link href="/piyasalar">
              Varlık ekle <ArrowRight />
            </Link>
          </div>
          {assets.length ? (
            <div className="watch-assets">
              {assets.map((a) => (
                <article key={a.id}>
                  <AssetIcon asset={a} />
                  <Link href={`/varlik/${a.id}`}>
                    <b>{a.symbol}</b>
                    <span>{a.name}</span>
                  </Link>
                  <div>
                    <b>{formatTRY(a.price, true)}</b>
                    <small className={a.change >= 0 ? "positive" : "negative"}>
                      {formatPct(a.change)}
                    </small>
                  </div>
                  <button
                    onClick={() => store.toggleWatchAsset(active.id, a.id)}
                  >
                    <X />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Bu liste boş"
              text="Piyasalar sayfasından takip etmek istediğin varlıkları ekle."
              action={
                <Link href="/piyasalar">
                  <Button>Piyasaları aç</Button>
                </Link>
              }
            />
          )}
        </Card>
      </div>
      <Card className="alerts-card">
        <div className="card-title">
          <div>
            <span>AKTİF KURALLAR</span>
            <h2>Uyarılar</h2>
          </div>
          <Badge tone="info">Uygulama içi bildirim</Badge>
        </div>
        <div className="alert-list">
          {state.alerts.map((a) => (
            <article key={a.id}>
              <button
                className={`switch ${a.enabled ? "on" : ""}`}
                onClick={() => store.toggleAlert(a.id)}
              >
                <i />
              </button>
              <span>
                <b>{a.label}</b>
                <small>
                  {a.condition}: {a.value.toLocaleString("tr-TR")}
                  {a.condition.includes("Fiyat") ? " ₺" : "%"}
                </small>
              </span>
              <Badge tone={a.enabled ? "success" : "neutral"}>
                {a.enabled ? "Açık" : "Kapalı"}
              </Badge>
              <button
                className="table-action danger"
                onClick={() => store.deleteAlert(a.id)}
              >
                <Trash2 />
              </button>
            </article>
          ))}
        </div>
        <p className="explain">
          <Info size={16} /> E-posta ve push bildirim mimarisi hazırdır;
          sağlayıcı kimlik bilgileri girilene kadar yalnızca uygulama içi
          bildirim kullanılır.
        </p>
      </Card>
      {showAlert && (
        <AlertModal
          asset={state.assets[1]}
          onClose={() => setShowAlert(false)}
          onSave={(a) => {
            store.addAlert(a);
            setShowAlert(false);
          }}
        />
      )}
    </div>
  );
}

function AlertModal({
  asset,
  onClose,
  onSave,
}: {
  asset: Asset;
  onClose: () => void;
  onSave: (a: Omit<Alert, "id">) => void;
}) {
  const [form, setForm] = useState<Omit<Alert, "id">>({
    assetId: asset.id,
    label: `${asset.symbol} fiyat uyarısı`,
    condition: "Fiyat üstüne çıkarsa",
    value: asset.price * 1.05,
    enabled: true,
  });
  return (
    <Modal title="Yeni uyarı" onClose={onClose}>
      <div className="form-grid">
        <Field label="Uyarı adı">
          <Input
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </Field>
        <Field label="Koşul">
          <Select
            value={form.condition}
            onChange={(e) => setForm({ ...form, condition: e.target.value })}
          >
            <option>Fiyat üstüne çıkarsa</option>
            <option>Fiyat altına inerse</option>
            <option>Günlük düşüş aşarsa</option>
            <option>Portföy ağırlığı aşarsa</option>
          </Select>
        </Field>
        <Field label="Değer">
          <Input
            type="number"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: +e.target.value })}
          />
        </Field>
        <div className="form-actions">
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={() => form.label && onSave(form)}>
            Uyarıyı kaydet
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function AssistantPage() {
  const { state } = useStore();
  const s = portfolioSummary(state);
  const budget = calculateBudget(state.profile);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<
    { role: "user" | "ai"; text: string }[]
  >([
    {
      role: "ai",
      text: `Merhaba ${state.userName.split(" ")[0]}. Portföyün ${formatTRY(s.value, true)} değerinde. Bugün neyi anlamak istersin?`,
    },
  ]);
  const reply = (q: string) => {
    const l = q.toLocaleLowerCase("tr-TR");
    let answer =
      "Bu soruyu yanıtlamak için yeterli veri yok. Portföy yoğunlaşması, yatırım bütçesi, kripto oranı, acil fon veya son değişim hakkında sorabilirsin.";
    if (l.includes("düşt") || l.includes("bugün")) {
      const losers = s.holdings
        .filter((h) => h.asset.change < 0)
        .sort((a, b) => a.asset.change - b.asset.change);
      answer = losers.length
        ? `Bugünkü tahmini değişim ${formatTRY(s.daily, true)}. En büyük negatif hareket ${losers[0].asset.symbol} tarafında (${formatPct(losers[0].asset.change)}). Bu açıklama demo fiyat değişimleri ve pozisyon ağırlıklarından hesaplandı.`
        : "Demo veride bugün negatif hareket eden pozisyon görünmüyor.";
    } else if (l.includes("yoğun") || l.includes("fazla")) {
      const top = Object.entries(s.allocations).sort((a, b) => b[1] - a[1])[0];
      answer = `En yüksek yoğunlaşman ${top[0]} kategorisinde: portföyün %${((top[1] / s.value) * 100).toFixed(1)}'i. Tek kategoride %35 üzeri ağırlık çeşitlendirme riskini artırabilir.`;
    } else if (l.includes("ne kadar") || l.includes("bütçe")) {
      answer = `Bu ay güvenli seviye ${formatTRY(budget.safe, true)}, dengeli seviye ${formatTRY(budget.balanced, true)}, üst sınır ${formatTRY(budget.upper, true)}. Hesapta ${formatTRY(state.profile.income, true)} gelirden giderler, borç ödemeleri, acil fon katkısı, yaklaşan harcamalar ve güvenlik payı çıkarıldı.`;
    } else if (l.includes("kripto")) {
      const c = ((s.allocations.Kripto || 0) / s.value) * 100;
      answer = `Kripto ağırlığın %${c.toFixed(1)}. Risk profilin ${calculateRiskProfile(state.profile)}. Bu oranı değerlendirirken maksimum kabul edilebilir kaybın %${state.profile.maxLoss} ve kripto volatilitesinin yüksek olduğu birlikte düşünülmeli.`;
    } else if (l.includes("acil") || l.includes("fon")) {
      answer = `Acil durum fonun ${formatTRY(state.profile.cashSavings, true)} / ${formatTRY(state.profile.emergencyTarget, true)}; hedefin %${budget.emergencyPercent.toFixed(0)}'i tamamlandı. Açık ${formatTRY(budget.emergencyGap, true)}.`;
    } else if (l.includes("denge") || l.includes("iyileştir")) {
      answer = generateAiInsights(state).join(" ");
    }
    setMessages((m) => [
      ...m,
      { role: "user", text: q },
      { role: "ai", text: answer },
    ]);
    setInput("");
  };
  const quick = [
    "Portföyüm neden bugün düştü?",
    "Hangi varlıklarda fazla yoğunlaşmışım?",
    "Bu ay ne kadar yatırım yapabilirim?",
    "Acil durum fonum yeterli mi?",
  ];
  return (
    <div className="assistant-page">
      <div className="assistant-intro">
        <div className="assistant-orb">
          <Bot />
        </div>
        <span className="eyebrow">ÜCRETSİZ · KURAL TABANLI</span>
        <h1>FinPilot Asistan</h1>
        <p>
          Portföy ve finansal profilindeki gerçek rakamları açıklar. Tahminleri
          gerçeklerden ayırır.
        </p>
      </div>
      <div className="assistant-layout">
        <Card className="chat-card">
          <div className="chat-head">
            <div>
              <span className="online-dot" />
              <b>FinPilot Asistan</b>
              <small>Demo analiz motoru</small>
            </div>
            <Badge tone="success">API gerektirmez</Badge>
          </div>
          <div className="messages">
            {messages.map((m, i) => (
              <div key={i} className={`message ${m.role}`}>
                {m.role === "ai" && (
                  <span>
                    <Sparkles />
                  </span>
                )}
                <p>{m.text}</p>
              </div>
            ))}
          </div>
          <div className="quick-questions">
            {quick.map((q) => (
              <button key={q} onClick={() => reply(q)}>
                {q}
              </button>
            ))}
          </div>
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) reply(input.trim());
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Finansal durumun hakkında sor..."
            />
            <button>
              <Send />
            </button>
          </form>
        </Card>
        <Card className="context-card">
          <div className="card-title">
            <div>
              <span>KULLANILAN BAĞLAM</span>
              <h2>Asistan neyi biliyor?</h2>
            </div>
          </div>
          {[
            ["Portföy değeri", formatTRY(s.value, true)],
            ["Risk profili", calculateRiskProfile(state.profile)],
            ["Aylık bütçe", formatTRY(budget.balanced, true)],
            ["Acil fon", `%${budget.emergencyPercent.toFixed(0)}`],
            ["Pozisyonlar", `${s.holdings.length} varlık`],
          ].map(([a, b]) => (
            <div key={a}>
              <span>{a}</span>
              <b>{b}</b>
            </div>
          ))}
          <p>
            <ShieldCheck />
            Asistan yalnızca bu uygulamada bulunan verileri kullanır; eksik
            piyasa verisini uydurmaz.
          </p>
        </Card>
      </div>
    </div>
  );
}

export function ReportsPage() {
  const { state } = useStore();
  const s = portfolioSummary(state);
  const budget = calculateBudget(state.profile);
  const [active, setActive] = useState("Aylık Portföy Raporu");
  const reports = [
    "Haftalık Portföy Raporu",
    "Aylık Portföy Raporu",
    "Varlık Dağılım Raporu",
    "Risk Raporu",
    "Kâr / Zarar Raporu",
    "İşlem Raporu",
    "Finansal Sağlık Raporu",
  ];
  const exportReport = () => {
    const lines = [
      "FinPilot Aylık Rapor",
      `Portföy Değeri,${s.value}`,
      `Yatırılan,${s.invested}`,
      `Kâr/Zarar,${s.profit}`,
      `Risk Puanı,${s.riskScore}`,
      `Çeşitlendirme,${s.diversification}`,
    ];
    download("finpilot-aylik-rapor.csv", lines.join("\n"));
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="RAPOR MERKEZİ"
        title="Raporlar"
        text="Performans, risk ve hedef ilerlemesini anlaşılır raporlara dönüştür."
        actions={
          <>
            <Button variant="secondary" onClick={exportReport}>
              <FileDown /> CSV
            </Button>
            <Button onClick={() => window.print()}>
              <FileText /> Yazdır / PDF
            </Button>
          </>
        }
      />
      <div className="reports-layout">
        <Card className="report-list">
          {reports.map((r) => (
            <button
              className={active === r ? "active" : ""}
              onClick={() => setActive(r)}
              key={r}
            >
              <FileText />
              <span>
                {r}
                <small>14 Temmuz 2026</small>
              </span>
              <ArrowRight />
            </button>
          ))}
        </Card>
        <Card className="report-paper">
          <div className="report-brand">
            <span>
              <PieIcon /> FinPilot AI
            </span>
            <Badge tone="warning">Demo veriler</Badge>
          </div>
          <div className="report-title">
            <span>01 TEM — 14 TEM 2026</span>
            <h1>{active}</h1>
            <p>{state.userName} için hazırlanmıştır.</p>
          </div>
          <div className="report-kpis">
            <div>
              <span>Portföy değeri</span>
              <b>{formatTRY(s.value, true)}</b>
            </div>
            <div>
              <span>Toplam performans</span>
              <b className={s.profit >= 0 ? "positive" : "negative"}>
                {formatPct(s.profitPercent)}
              </b>
            </div>
            <div>
              <span>Günlük değişim</span>
              <b>{formatTRY(s.daily, true)}</b>
            </div>
          </div>
          <section>
            <h2>Yönetici özeti</h2>
            <p>
              Portföyün işlem kayıtlarına göre {formatTRY(s.invested, true)}{" "}
              maliyet üzerinden {formatTRY(s.value, true)} değere ulaştı.
              Gerçekleşmemiş sonuç {formatTRY(s.profit, true)}. Bu rapordaki
              piyasa fiyatları demo veridir.
            </p>
          </section>
          <section>
            <h2>Önemli gözlemler</h2>
            <ul>
              {generateAiInsights(state).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2>Nakit akışı ve hedefler</h2>
            <div className="report-table">
              <div>
                <span>Dengeli yatırım bütçesi</span>
                <b>{formatTRY(budget.balanced, true)}</b>
              </div>
              <div>
                <span>Acil fon tamamlanma</span>
                <b>%{budget.emergencyPercent.toFixed(0)}</b>
              </div>
              <div>
                <span>Aktif hedef sayısı</span>
                <b>{state.goals.length}</b>
              </div>
              <div>
                <span>Bu ay işlem sayısı</span>
                <b>
                  {
                    state.transactions.filter((t) =>
                      t.date.startsWith("2026-07"),
                    ).length
                  }
                </b>
              </div>
            </div>
          </section>
          <footer>
            Bu belge eğitim amaçlı karar desteğidir. Kişiselleştirilmiş yatırım
            tavsiyesi değildir.
          </footer>
        </Card>
      </div>
    </div>
  );
}

export function GoalsPage() {
  const store = useStore();
  const { state } = store;
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<Goal | null>(null);
  return (
    <div className="page">
      <PageHeader
        eyebrow="FİNANSAL HEDEFLER"
        title="Hedeflerin"
        text="Her hedef için ilerlemeyi ve gereken yaklaşık aylık katkıyı izle."
        actions={
          <Button onClick={() => setModal(true)}>
            <Plus /> Yeni hedef
          </Button>
        }
      />
      <div className="goals-grid">
        {state.goals.map((g, i) => {
          const pct = Math.min(100, (g.current / g.target) * 100);
          const months = Math.max(
            1,
            Math.ceil(
              (new Date(g.targetDate).getTime() - Date.now()) / 2629800000,
            ),
          );
          const required = Math.max(0, (g.target - g.current) / months);
          return (
            <Card className="goal-card" key={g.id}>
              <div className="goal-top">
                <span
                  className="goal-icon"
                  style={{
                    background: COLORS[i % COLORS.length] + "20",
                    color: COLORS[i % COLORS.length],
                  }}
                >
                  <Flag />
                </span>
                <Badge tone={g.priority === "Yüksek" ? "warning" : "neutral"}>
                  {g.priority} öncelik
                </Badge>
                <button onClick={() => setEdit(g)}>
                  <MoreHorizontal />
                </button>
              </div>
              <h2>{g.name}</h2>
              <p>
                {new Date(g.targetDate).toLocaleDateString("tr-TR", {
                  month: "long",
                  year: "numeric",
                })}{" "}
                hedefi
              </p>
              <div className="goal-amount">
                <b>{formatTRY(g.current, true)}</b>
                <span>/ {formatTRY(g.target, true)}</span>
              </div>
              <Progress value={pct} />
              <div className="goal-meta">
                <span>
                  <b>%{pct.toFixed(0)}</b> tamamlandı
                </span>
                <span>
                  <b>{formatTRY(required, true)}</b> gereken/ay
                </span>
              </div>
              <div className="goal-contribution">
                <span>Planlanan aylık katkı</span>
                <b>{formatTRY(g.monthlyContribution, true)}</b>
              </div>
              <small className="assumption">
                Yıllık %{g.assumedReturn} getiri varsayımı · garanti değildir
              </small>
            </Card>
          );
        })}
      </div>
      {!state.goals.length && (
        <Empty
          title="Henüz hedef yok"
          text="Acil durum fonu, işletme sermayesi veya uzun vadeli birikim hedefi ekle."
        />
      )}
      {modal && (
        <GoalModal
          onClose={() => setModal(false)}
          onSave={(g) => {
            store.addGoal(g);
            setModal(false);
          }}
        />
      )}
      {edit && (
        <GoalModal
          initial={edit}
          onClose={() => setEdit(null)}
          onSave={(g) => {
            store.updateGoal({ ...g, id: edit.id });
            setEdit(null);
          }}
          onDelete={() => {
            if (confirm("Hedef silinsin mi?")) {
              store.deleteGoal(edit.id);
              setEdit(null);
            }
          }}
        />
      )}
    </div>
  );
}

function GoalModal({
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  initial?: Goal;
  onClose: () => void;
  onSave: (g: Omit<Goal, "id">) => void;
  onDelete?: () => void;
}) {
  const [g, setG] = useState<Omit<Goal, "id">>(
    initial
      ? {
          name: initial.name,
          target: initial.target,
          current: initial.current,
          targetDate: initial.targetDate,
          monthlyContribution: initial.monthlyContribution,
          priority: initial.priority,
          assumedReturn: initial.assumedReturn,
        }
      : {
          name: "Acil durum fonu",
          target: 50000,
          current: 0,
          targetDate: "2027-07-01",
          monthlyContribution: 3000,
          priority: "Orta",
          assumedReturn: 0,
        },
  );
  const set = (k: keyof typeof g, v: string | number) =>
    setG((x) => ({ ...x, [k]: v }));
  return (
    <Modal
      title={initial ? "Hedefi düzenle" : "Yeni finansal hedef"}
      onClose={onClose}
    >
      <div className="form-grid">
        <Field label="Hedef adı">
          <Input value={g.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Hedef tutarı">
          <Input
            type="number"
            value={g.target}
            onChange={(e) => set("target", +e.target.value)}
          />
        </Field>
        <Field label="Mevcut tutar">
          <Input
            type="number"
            value={g.current}
            onChange={(e) => set("current", +e.target.value)}
          />
        </Field>
        <Field label="Hedef tarihi">
          <Input
            type="date"
            value={g.targetDate}
            onChange={(e) => set("targetDate", e.target.value)}
          />
        </Field>
        <Field label="Aylık katkı">
          <Input
            type="number"
            value={g.monthlyContribution}
            onChange={(e) => set("monthlyContribution", +e.target.value)}
          />
        </Field>
        <Field label="Öncelik">
          <Select
            value={g.priority}
            onChange={(e) => set("priority", e.target.value)}
          >
            <option>Yüksek</option>
            <option>Orta</option>
            <option>Düşük</option>
          </Select>
        </Field>
        <Field
          label="Varsayılan yıllık getiri (%)"
          hint="Bu yalnızca kullanıcı varsayımıdır; getiri vaadi değildir."
        >
          <Input
            type="number"
            min="0"
            max="100"
            value={g.assumedReturn}
            onChange={(e) => set("assumedReturn", +e.target.value)}
          />
        </Field>
        <div className="form-actions">
          {onDelete && (
            <Button variant="danger" onClick={onDelete}>
              <Trash2 /> Sil
            </Button>
          )}
          <span />
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={() => g.name && g.target > 0 && onSave(g)}>
            Kaydet
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function SettingsPage() {
  const store = useStore();
  const { state } = store;
  const [profile, setProfile] = useState(state.profile);
  const [name, setName] = useState(state.userName);
  const [saved, setSaved] = useState(false);
  const [section, setSection] = useState("Finansal profil");
  const sections = [
    "Profil",
    "Finansal profil",
    "Risk profili",
    "Görünüm",
    "Bildirimler",
    "AI sağlayıcı",
    "Veri sağlayıcı",
    "Gizlilik",
  ];
  const save = () => {
    store.setProfile(profile);
    store.setUserName(name.trim() || state.userName);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="HESAP AYARLARI"
        title="Ayarlar"
        text="Profil, sağlayıcı, bildirim ve gizlilik tercihlerini yönet."
      />
      <div className="settings-layout">
        <Card className="settings-nav">
          {sections.map((s) => (
            <button
              key={s}
              className={section === s ? "active" : ""}
              onClick={() => setSection(s)}
            >
              {s}
              <ArrowRight />
            </button>
          ))}
        </Card>
        <Card className="settings-content">
          <div className="card-title">
            <div>
              <span>AYARLAR</span>
              <h2>{section}</h2>
            </div>
            {["Profil", "Finansal profil", "Risk profili"].includes(section) && (
              <Button onClick={save}>
                {saved ? <Check /> : null}
                {saved ? "Kaydedildi" : "Kaydet"}
              </Button>
            )}
          </div>
          {section === "Finansal profil" && (
            <div className="form-grid two">
              {[
                ["income", "Aylık net gelir"],
                ["essentialExpenses", "Zorunlu giderler"],
                ["optionalExpenses", "İsteğe bağlı giderler"],
                ["cashSavings", "Nakit birikim"],
                ["creditCardDebt", "Kredi kartı borcu"],
                ["loanDebt", "Kredi borcu"],
                ["monthlyDebtPayments", "Aylık borç ödemesi"],
                ["emergencyTarget", "Acil fon hedefi"],
              ].map(([k, l]) => (
                <Field key={k} label={`${l} (₺)`}>
                  <Input
                    type="number"
                    value={Number(profile[k as keyof FinancialProfile])}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, [k]: +e.target.value }))
                    }
                  />
                </Field>
              ))}
            </div>
          )}
          {section === "Risk profili" && (
            <div className="settings-block">
              <Badge tone="success">{calculateRiskProfile(profile)}</Badge>
              <Field label={`Risk toleransı ${profile.riskTolerance}/5`}>
                <Input
                  type="range"
                  min="1"
                  max="5"
                  value={profile.riskTolerance}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      riskTolerance: +e.target.value,
                    }))
                  }
                />
              </Field>
              <Field
                label={`Maksimum kabul edilebilir kayıp %${profile.maxLoss}`}
              >
                <Input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={profile.maxLoss}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, maxLoss: +e.target.value }))
                  }
                />
              </Field>
              <Field label="Yatırım süresi (yıl)">
                <Input
                  type="number"
                  value={profile.horizon}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, horizon: +e.target.value }))
                  }
                />
              </Field>
            </div>
          )}
          {section === "Profil" && (
            <div className="settings-block">
              <Field label="Ad soyad">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="E-posta">
                <Input defaultValue="demo@finpilot.local" disabled />
              </Field>
              <p className="explain">
                <Info />
                Demo hesap bilgileri bu tarayıcıda tutulur.
              </p>
            </div>
          )}
          {section === "Görünüm" && (
            <div className="settings-block">
              <label className="toggle-row">
                <span>
                  <b>Koyu tema</b>
                  <small>FinPilot varsayılan görünümü</small>
                </span>
                <input type="checkbox" checked readOnly />
                <i />
              </label>
              <Field label="Para birimi">
                <Select defaultValue="TRY">
                  <option>TRY — Türk Lirası</option>
                  <option>USD — Amerikan Doları</option>
                  <option>EUR — Euro</option>
                </Select>
              </Field>
            </div>
          )}
          {section === "Bildirimler" && (
            <div className="settings-block">
              {[
                "Uygulama içi bildirimler",
                "Fiyat uyarıları",
                "Portföy yoğunlaşma uyarıları",
                "Aylık bütçe uyarıları",
              ].map((x, i) => (
                <label className="toggle-row" key={x}>
                  <span>
                    <b>{x}</b>
                    <small>{i === 0 ? "Aktif" : "Tercihini değiştir"}</small>
                  </span>
                  <input type="checkbox" defaultChecked />
                  <i />
                </label>
              ))}
              <label className="toggle-row disabled">
                <span>
                  <b>E-posta ve push</b>
                  <small>Sağlayıcı yapılandırılmadı</small>
                </span>
                <input type="checkbox" disabled />
                <i />
              </label>
            </div>
          )}
          {section === "AI sağlayıcı" && (
            <div className="provider-card">
              <Sparkles />
              <div>
                <Badge tone="success">Aktif</Badge>
                <h3>Ücretsiz demo analiz motoru</h3>
                <p>
                  API anahtarı istemez. Kişisel finans profilin ve portföy
                  matematiğin üzerinden açıklanabilir cevaplar üretir.
                </p>
              </div>
              <div className="provider-facts">
                <span>
                  <Check /> Ücretsiz
                </span>
                <span>
                  <Check /> Anahtarsız
                </span>
                <span>
                  <Check /> Kullanıcı verisine dayalı
                </span>
              </div>
            </div>
          )}
          {section === "Veri sağlayıcı" && (
            <div className="provider-card">
              <ChartNoAxesCombinedIcon />
              <div>
                <Badge tone="warning">Demo</Badge>
                <h3>Yerleşik piyasa veri sağlayıcısı</h3>
                <p>
                  Gerçekçi örnek veriler kullanır ve her ekranda demo olarak
                  etiketlenir. Gerçek zamanlı fiyat iddiasında bulunmaz.
                </p>
              </div>
            </div>
          )}
          {section === "Gizlilik" && (
            <div className="danger-zone">
              <h3>Verilerini dışa aktar</h3>
              <p>Tüm işlem verilerini CSV olarak indirebilirsin.</p>
              <Button
                variant="secondary"
                onClick={() =>
                  download("finpilot-veri.json", JSON.stringify(state, null, 2))
                }
              >
                <Download /> Veriyi indir
              </Button>
              <hr />
              <h3>Demo verisini sıfırla</h3>
              <p>
                Bu cihazdaki değişikliklerin tamamı silinir ve örnek hesap geri
                yüklenir.
              </p>
              <Button
                variant="danger"
                onClick={() =>
                  confirm("Tüm demo verisi sıfırlansın mı?") &&
                  store.resetDemo()
                }
              >
                <Trash2 /> Veriyi sıfırla
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ChartNoAxesCombinedIcon() {
  return <TrendingUp />;
}
function download(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
