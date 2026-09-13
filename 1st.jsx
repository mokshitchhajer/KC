import React, {useState, useEffect, useMemo, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Plus, Pencil, Trash2, Search, RotateCcw, X, Check,
  LayoutGrid, Receipt, Boxes, Layers, AlertCircle, DatabaseBackup,
} from "lucide-react";

const COLORS = {
  indigoDeep: "#1F3049",
  indigoPanel: "#2B4160",
  cream: "#F4EFE0",
  creamSoft: "#EAE3CE",
  ink: "#2B2620",
  inkSoft: "#6B6154",
  madder: "#AE443C",
  turmeric: "#C6871F",
  green: "#4C7355",
  rule: "#D9CFB6",
};

const SALE_FIELDS = [
  { key: "date", label: "Date", type: "date", required: true },
  { key: "quality", label: "Quality / fabric", type: "text", required: true, suggest: "saleQualities" },
  { key: "meters", label: "Metres", type: "number", required: true },
  { key: "rate", label: "Rate per metre (₹)", type: "number", required: true },
  { key: "amountBeforeTax", label: "Amount before tax (₹)", type: "number", calculated: true },
  { key: "discountPercent", label: "Discount (%)", type: "number" },
  { key: "discountAmount", label: "Discount amount (₹)", type: "number", calculated: true },
  { key: "taxableAmount", label: "Taxable amount after discount (₹)", type: "number", calculated: true },
  { key: "cgstRate", label: "CGST (%)", type: "number" },
  { key: "sgstRate", label: "SGST (%)", type: "number" },
  { key: "igstRate", label: "IGST (%)", type: "number" },
  { key: "gstAmount", label: "Total GST (₹)", type: "number", calculated: true },
  { key: "total", label: "Invoice total incl. GST (₹)", type: "number", calculated: true },
  { key: "buyer", label: "Sold to", type: "text", required: true, suggest: "buyers" },
  { key: "location", label: "Location / market", type: "text", suggest: "saleLocations" },
  { key: "amountPaid", label: "Amount received (₹)", type: "number" },
  { key: "notes", label: "Notes", type: "textarea" },
];

const PURCHASE_FIELDS = [
  { key: "date", label: "Date", type: "date", required: true },
  { key: "firm", label: "Supplier / firm", type: "text", required: true, suggest: "firms" },
  { key: "material", label: "Quality / material", type: "text", required: true, suggest: "purchaseQualities" },
  { key: "meters", label: "Metres", type: "number", required: true },
  { key: "rate", label: "Rate per metre (₹)", type: "number", required: true },
  { key: "amountPaid", label: "Amount paid (₹)", type: "number" },
  { key: "notes", label: "Notes", type: "textarea" },
];

const FIRM_FIELDS = [
  { key: "name", label: "Business name", type: "text" },
  { key: "address", label: "Address", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "gstin", label: "GSTIN", type: "text" },
];

const SALES_KEY = "textile:sales";
const PURCHASES_KEY = "textile:purchases";
const FIRM_KEY = "textile:firm";
const EMPTY_FIRM = { name: "", address: "", phone: "", gstin: "" };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
function formatINR(n) {
  const v = Number(n) || 0;
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function formatMeters(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " m";
}
function saleAmounts(r) {
  const meters = Number(r.meters) || 0;
  const rate = Number(r.rate) || 0;
  const amountBeforeTax = meters * rate;
  const discountPercent = Math.max(Number(r.discountPercent) || 0, 0);
  const discountAmount = amountBeforeTax * discountPercent / 100;
  const taxableAmount = Math.max(amountBeforeTax - discountAmount, 0);
  const cgstRate = Math.max(Number(r.cgstRate) || 0, 0);
  const sgstRate = Math.max(Number(r.sgstRate) || 0, 0);
  const igstRate = Math.max(Number(r.igstRate) || 0, 0);
  const cgstAmount = taxableAmount * cgstRate / 100;
  const sgstAmount = taxableAmount * sgstRate / 100;
  const igstAmount = taxableAmount * igstRate / 100;
  const gstAmount = cgstAmount + sgstAmount + igstAmount;
  return { meters, rate, amountBeforeTax, discountPercent, discountAmount, taxableAmount, cgstRate, sgstRate, igstRate, cgstAmount, sgstAmount, igstAmount, gstAmount, total: taxableAmount + gstAmount };
}
function computeRecord(r) {
  const isSale = Object.prototype.hasOwnProperty.call(r, "quality");
  const sale = isSale ? saleAmounts(r) : null;
  const meters = sale ? sale.meters : Number(r.meters) || 0;
  const rate = sale ? sale.rate : Number(r.rate) || 0;
  const paid = Number(r.amountPaid) || 0;
  const total = sale ? sale.total : meters * rate;
  const balance = Math.max(total - paid, 0);
  let status = "Pending";
  if (balance <= 0.009 && total > 0) status = "Paid";
  else if (paid > 0) status = "Partial";
  return { ...r, ...sale, meters, rate, amountPaid: paid, total, balance, status };
}
function groupSum(arr, keyFn, valFn) {
  const map = new Map();
  arr.forEach((item) => {
    const k = keyFn(item) || "Unspecified";
    map.set(k, (map.get(k) || 0) + valFn(item));
  });
  return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
function matchesSearch(record, fields, term) {
  if (!term) return true;
  const t = term.toLowerCase();
  return fields.some((f) => String(record[f] || "").toLowerCase().includes(t));
}
function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}
function downloadFile(filename, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
function makeCsv(rows, columns) {
  return [
    columns.map((column) => csvCell(column.label)).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(",")),
  ].join("\n");
}

function StatusPill({ status }) {
  const cls =
    status === "Paid" ? "txl-pill txl-pill-paid" :
    status === "Partial" ? "txl-pill txl-pill-partial" : "txl-pill txl-pill-pending";
  return <span className={cls}>{status}</span>;
}

function StatTile({ label, value, sub, accent }) {
  return (
    <div className="txl-tile" style={{ borderLeftColor: accent }}>
      <div className="txl-tile-label">{label}</div>
      <div className="txl-tile-value">{value}</div>
      {sub && <div className="txl-tile-sub">{sub}</div>}
    </div>
  );
}

function PayBar({ label, received, outstanding }) {
  const total = received + outstanding || 1;
  const pct = Math.min((received / total) * 100, 100);
  return (
    <div className="txl-paybar">
      <div className="txl-paybar-top">
        <span>{label}</span>
        <span>{formatINR(received)} of {formatINR(total)}</span>
      </div>
      <div className="txl-paybar-track">
        <div className="txl-paybar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Suggestions({ id, options }) {
  if (!options || !options.length) return null;
  return (
    <datalist id={id}>
      {options.map((o) => <option key={o} value={o} />)}
    </datalist>
  );
}

function RecordForm({ fields, initial, suggestionsMap, onCancel, onSave, title }) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState("");

  useEffect(() => { setValues(initial); setError(""); }, [initial]);

  function set(key, val) {
    setValues((v) => ({ ...v, [key]: val }));
  }
  function submit(e) {
    e.preventDefault();
    for (const f of fields) {
      if (f.required && (values[f.key] === undefined || values[f.key] === "")) {
        setError(`Please fill in "${f.label}".`);
        return;
      }
    }
    setError("");
    onSave(values);
  }

  return (
    <form className="txl-form" onSubmit={submit}>
      <div className="txl-form-head">
        <h3>{title}</h3>
        <button type="button" className="txl-icon-btn" onClick={onCancel} aria-label="Close form">
          <X size={16} />
        </button>
      </div>
      <div className="txl-form-grid">
        {fields.map((f) => {
          const listId = f.suggest ? `dl-${f.suggest}` : undefined;
          const calculatedValue = f.calculated ? saleAmounts(values)[f.key] : values[f.key];
          return (
            <label key={f.key} className={f.type === "textarea" ? "txl-field txl-field-wide" : "txl-field"}>
              <span>{f.label}{f.required && <span className="txl-req"> *</span>}</span>
              {f.type === "textarea" ? (
                <textarea
                  rows={2}
                  value={values[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              ) : (
                <input
                  type={f.type}
                  step={f.type === "number" ? "0.01" : undefined}
                  min={f.type === "number" ? "0" : undefined}
                  list={listId}
                  readOnly={f.calculated}
                  value={calculatedValue ?? ""}
                  onChange={(e) => !f.calculated && set(f.key, e.target.value)}
                />
              )}
              {listId && <Suggestions id={listId} options={suggestionsMap[f.suggest]} />}
            </label>
          );
        })}
      </div>
      {error && <div className="txl-form-error">{error}</div>}
      <div className="txl-form-actions">
        <button type="button" className="txl-btn txl-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="txl-btn txl-btn-primary"><Check size={14} /> Save entry</button>
      </div>
    </form>
  );
}

function LedgerTable({ rows, columns, onEdit, onDelete, confirmId, onConfirmDelete, onCancelDelete, emptyLabel }) {
  if (!rows.length) {
    return <div className="txl-empty">{emptyLabel}</div>;
  }
  return (
    <div className="txl-table-wrap">
      <table className="txl-table">
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key} style={{ textAlign: c.align || "left" }}>{c.label}</th>)}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align || "left" }}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
              <td className="txl-row-actions">
                {confirmId === r.id ? (
                  <>
                    <button className="txl-icon-btn txl-icon-btn-danger" onClick={() => onConfirmDelete(r)} aria-label="Confirm delete">
                      <Check size={14} />
                    </button>
                    <button className="txl-icon-btn" onClick={onCancelDelete} aria-label="Cancel delete">
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <button className="txl-icon-btn" onClick={() => onEdit(r)} aria-label="Edit entry">
                      <Pencil size={14} />
                    </button>
                    <button className="txl-icon-btn txl-icon-btn-danger" onClick={() => onDelete(r.id)} aria-label="Delete entry">
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TextileLedger() {
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [firm, setFirm] = useState(EMPTY_FIRM);
  const [firmEditing, setFirmEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [formState, setFormState] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [banner, setBanner] = useState("");
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [lastFailed, setLastFailed] = useState(null); // { key, value }
  const [backupOpen, setBackupOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const savedTimerRef = useRef(null);

  async function loadKey(key, fallback) {
    try {
      const value = window.localStorage.getItem(key);
      if (!value) return fallback;
      try {
        return JSON.parse(value);
      } catch (e) {
        return fallback;
      }
    } catch (e) {
      return fallback;
    }
  }

  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) {
      setStorageAvailable(false);
      setLoading(false);
      return;
    }
    (async () => {
      const [s, p, f] = await Promise.all([
        loadKey(SALES_KEY, []),
        loadKey(PURCHASES_KEY, []),
        loadKey(FIRM_KEY, EMPTY_FIRM),
      ]);
      setSales(Array.isArray(s) ? s : []);
      setPurchases(Array.isArray(p) ? p : []);
      setFirm(f && typeof f === "object" ? { ...EMPTY_FIRM, ...f } : EMPTY_FIRM);
      setLoading(false);
    })();
  }, []);

  function flashBanner(msg) {
    setBanner(msg);
    setTimeout(() => setBanner(""), 4000);
  }

  async function saveKey(key, value) {
    if (!storageAvailable) return false;
    setSaveStatus("saving");
    try {
      window.localStorage.setItem(key, value);
      setSaveStatus("saved");
      setLastFailed(null);
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 2500);
      return true;
    } catch (e) {
      setSaveStatus("error");
      setLastFailed({ key, value });
      return false;
    }
  }

  function retrySave() {
    if (lastFailed) saveKey(lastFailed.key, lastFailed.value);
  }

  async function persist(kind, next) {
    if (kind === "sale") setSales(next); else setPurchases(next);
    await saveKey(kind === "sale" ? SALES_KEY : PURCHASES_KEY, JSON.stringify(next));
  }

  async function saveFirm(values) {
    setFirm(values);
    setFirmEditing(false);
    await saveKey(FIRM_KEY, JSON.stringify(values));
  }

  function openNew(type) {
    const base = type === "sale"
      ? { date: todayStr(), quality: "", meters: "", rate: "", discountPercent: "", cgstRate: "", sgstRate: "", igstRate: "", buyer: "", location: "", amountPaid: "", notes: "" }
      : { date: todayStr(), firm: "", material: "", meters: "", rate: "", amountPaid: "", notes: "" };
    setFormState({ type, record: { id: null, ...base } });
  }
  function openEdit(type, record) {
    setFormState({ type, record: { ...record } });
  }
  function closeForm() { setFormState(null); }

  function saveRecord(values) {
    const { type, record } = formState;
    const isNew = !record.id;
    const saved = { ...record, ...values, id: record.id || newId() };
    if (type === "sale") {
      const next = isNew ? [saved, ...sales] : sales.map((s) => (s.id === saved.id ? saved : s));
      persist("sale", next);
    } else {
      const next = isNew ? [saved, ...purchases] : purchases.map((p) => (p.id === saved.id ? saved : p));
      persist("purchase", next);
    }
    setFormState(null);
  }

  function requestDelete(type, id) { setConfirmDelete({ type, id }); }
  function cancelDelete() { setConfirmDelete(null); }
  function confirmDeleteRow() {
    const { type, id } = confirmDelete;
    if (type === "sale") persist("sale", sales.filter((s) => s.id !== id));
    else persist("purchase", purchases.filter((p) => p.id !== id));
    setConfirmDelete(null);
  }

  async function clearAll() {
    const ok = typeof window.confirm === "function"
      ? window.confirm("Clear all sales and purchase records? This cannot be undone.")
      : true;
    if (!ok) return;
    if (storageAvailable) {
      window.localStorage.removeItem(SALES_KEY);
      window.localStorage.removeItem(PURCHASES_KEY);
    }
    setSales([]);
    setPurchases([]);
    flashBanner("All records cleared.");
  }

  function exportData() {
    return JSON.stringify({ exportedAt: new Date().toISOString(), sales, purchases, firm }, null, 2);
  }

  function downloadBackup() {
    downloadFile(`textile-ledger-backup-${todayStr()}.json`, exportData(), "application/json");
    flashBanner("Full backup downloaded. Keep it somewhere safe.");
  }

  function downloadExcelFiles() {
    const salesColumns = [
      { key: "date", label: "Date" }, { key: "quality", label: "Quality / fabric" },
      { key: "meters", label: "Metres" }, { key: "rate", label: "Rate per metre (INR)" },
      { key: "amountBeforeTax", label: "Amount before tax (INR)" }, { key: "discountPercent", label: "Discount (%)" },
      { key: "discountAmount", label: "Discount amount (INR)" }, { key: "taxableAmount", label: "Taxable amount (INR)" },
      { key: "cgstRate", label: "CGST (%)" }, { key: "sgstRate", label: "SGST (%)" }, { key: "igstRate", label: "IGST (%)" },
      { key: "gstAmount", label: "GST amount (INR)" }, { key: "total", label: "Invoice total incl. GST (INR)" },
      { key: "buyer", label: "Sold to" }, { key: "location", label: "Location / market" },
      { key: "amountPaid", label: "Amount received (INR)" }, { key: "notes", label: "Notes" },
    ];
    const purchaseColumns = [
      { key: "date", label: "Date" }, { key: "firm", label: "Supplier / firm" },
      { key: "material", label: "Quality / material" }, { key: "meters", label: "Metres" },
      { key: "rate", label: "Rate per metre (INR)" }, { key: "amountPaid", label: "Amount paid (INR)" },
      { key: "notes", label: "Notes" },
    ];
    const stamp = todayStr();
    downloadFile(`textile-sales-${stamp}.csv`, makeCsv(salesComputed, salesColumns), "text/csv;charset=utf-8");
    downloadFile(`textile-purchases-${stamp}.csv`, makeCsv(purchases, purchaseColumns), "text/csv;charset=utf-8");
    flashBanner("Excel-compatible sales and purchase files downloaded.");
  }

  function importData() {
    setImportError("");
    let parsed;
    try {
      parsed = JSON.parse(importText);
    } catch (e) {
      setImportError("That doesn't look like valid backup text — check nothing was cut off when you pasted it.");
      return;
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sales) || !Array.isArray(parsed.purchases)) {
      setImportError("This backup is missing sales or purchases data, so it wasn't imported.");
      return;
    }
    persist("sale", parsed.sales);
    persist("purchase", parsed.purchases);
    if (parsed.firm && typeof parsed.firm === "object") saveFirm({ ...EMPTY_FIRM, ...parsed.firm });
    setImportText("");
    setBackupOpen(false);
    flashBanner("Backup restored.");
  }

  const salesComputed = useMemo(() => sales.map(computeRecord), [sales]);
  const purchasesComputed = useMemo(() => purchases.map(computeRecord), [purchases]);

  const filteredSales = useMemo(
    () => salesComputed.filter((r) => matchesSearch(r, ["quality", "buyer", "location"], search)),
    [salesComputed, search]
  );
  const filteredPurchases = useMemo(
    () => purchasesComputed.filter((r) => matchesSearch(r, ["firm", "material"], search)),
    [purchasesComputed, search]
  );

  const suggestionsMap = useMemo(() => ({
    saleQualities: [...new Set(sales.map((s) => s.quality).filter(Boolean))],
    saleLocations: [...new Set(sales.map((s) => s.location).filter(Boolean))],
    buyers: [...new Set(sales.map((s) => s.buyer).filter(Boolean))],
    firms: [...new Set(purchases.map((p) => p.firm).filter(Boolean))],
    purchaseQualities: [...new Set(purchases.map((p) => p.material).filter(Boolean))],
  }), [sales, purchases]);

  const totals = useMemo(() => {
    const sMeters = salesComputed.reduce((a, r) => a + r.meters, 0);
    const sRevenue = salesComputed.reduce((a, r) => a + r.total, 0);
    const sReceived = salesComputed.reduce((a, r) => a + r.amountPaid, 0);
    const sReceivable = salesComputed.reduce((a, r) => a + r.balance, 0);
    const pMeters = purchasesComputed.reduce((a, r) => a + r.meters, 0);
    const pSpend = purchasesComputed.reduce((a, r) => a + r.total, 0);
    const pPaid = purchasesComputed.reduce((a, r) => a + r.amountPaid, 0);
    const pPayable = purchasesComputed.reduce((a, r) => a + r.balance, 0);
    const profit = sRevenue - pSpend;
    return { sMeters, sRevenue, sReceived, sReceivable, pMeters, pSpend, pPaid, pPayable, profit };
  }, [salesComputed, purchasesComputed]);

  const stockByQuality = useMemo(() => {
    const purchasedMap = new Map();
    purchasesComputed.forEach((r) => {
      const label = (r.material || "Unspecified").trim() || "Unspecified";
      const key = label.toLowerCase();
      const existing = purchasedMap.get(key) || { label, purchased: 0, spend: 0 };
      existing.purchased += r.meters;
      existing.spend += r.total;
      purchasedMap.set(key, existing);
    });
    const soldMap = new Map();
    salesComputed.forEach((r) => {
      const label = (r.quality || "Unspecified").trim() || "Unspecified";
      const key = label.toLowerCase();
      const existing = soldMap.get(key) || { label, sold: 0 };
      existing.sold += r.meters;
      soldMap.set(key, existing);
    });
    const keys = new Set([...purchasedMap.keys(), ...soldMap.keys()]);
    const rows = [];
    keys.forEach((key) => {
      const p = purchasedMap.get(key);
      const s = soldMap.get(key);
      const purchased = p ? p.purchased : 0;
      const sold = s ? s.sold : 0;
      const avgRate = p && p.purchased > 0 ? p.spend / p.purchased : 0;
      const inStock = purchased - sold;
      rows.push({
        quality: (p && p.label) || (s && s.label) || key,
        purchased,
        sold,
        inStock,
        estValue: inStock > 0 ? inStock * avgRate : 0,
      });
    });
    return rows.sort((a, b) => b.inStock - a.inStock);
  }, [purchasesComputed, salesComputed]);

  const stockSummary = useMemo(() => {
    const netStock = stockByQuality.reduce((a, r) => a + r.inStock, 0);
    const stockValue = stockByQuality.reduce((a, r) => a + (r.inStock > 0 ? r.estValue : 0), 0);
    return { qualities: stockByQuality.length, netStock, stockValue };
  }, [stockByQuality]);

  const stockChartData = useMemo(
    () => stockByQuality.filter((r) => r.inStock > 0).slice(0, 8).map((r) => ({ name: r.quality, value: r.inStock })),
    [stockByQuality]
  );

  const revenueByQuality = useMemo(
    () => groupSum(salesComputed, (r) => r.quality, (r) => r.total).slice(0, 8),
    [salesComputed]
  );
  const spendByFirm = useMemo(
    () => groupSum(purchasesComputed, (r) => r.firm, (r) => r.total).slice(0, 8),
    [purchasesComputed]
  );

  const recent = useMemo(() => {
    const combined = [
      ...salesComputed.map((r) => ({ ...r, kind: "sale" })),
      ...purchasesComputed.map((r) => ({ ...r, kind: "purchase" })),
    ];
    return combined
      .filter((r) => r.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 8);
  }, [salesComputed, purchasesComputed]);

  const saleColumns = [
    { key: "date", label: "Date" },
    { key: "quality", label: "Quality" },
    { key: "meters", label: "Metres", align: "right", render: (r) => <span className="txl-mono">{formatMeters(r.meters)}</span> },
    { key: "rate", label: "Rate/m", align: "right", render: (r) => <span className="txl-mono">{formatINR(r.rate)}</span> },
    { key: "amountBeforeTax", label: "Before tax", align: "right", render: (r) => <span className="txl-mono">{formatINR(r.amountBeforeTax)}</span> },
    { key: "discountPercent", label: "Discount", align: "right", render: (r) => <span className="txl-mono">{r.discountPercent || 0}%</span> },
    { key: "gstAmount", label: "GST", align: "right", render: (r) => <span className="txl-mono">{formatINR(r.gstAmount)}</span> },
    { key: "buyer", label: "Sold to" },
    { key: "location", label: "Location" },
    { key: "total", label: "Invoice total", align: "right", render: (r) => <span className="txl-mono">{formatINR(r.total)}</span> },
    { key: "balance", label: "Balance", align: "right", render: (r) => <span className="txl-mono">{formatINR(r.balance)}</span> },
    { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
  ];
  const purchaseColumns = [
    { key: "date", label: "Date" },
    { key: "firm", label: "Firm" },
    { key: "material", label: "Quality" },
    { key: "meters", label: "Metres", align: "right", render: (r) => <span className="txl-mono">{formatMeters(r.meters)}</span> },
    { key: "rate", label: "Rate/m", align: "right", render: (r) => <span className="txl-mono">{formatINR(r.rate)}</span> },
    { key: "total", label: "Total", align: "right", render: (r) => <span className="txl-mono">{formatINR(r.total)}</span> },
    { key: "balance", label: "Balance", align: "right", render: (r) => <span className="txl-mono">{formatINR(r.balance)}</span> },
    { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
  ];

  return (
    <div className="txl-root">
      <style>{`
        .txl-root {
          font-family: 'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif;
          background: ${COLORS.indigoDeep};
          color: ${COLORS.ink};
          border-radius: 14px;
          overflow: hidden;
          max-width: 1080px;
          margin: 0 auto;
        }
        .txl-header {
          background: linear-gradient(180deg, ${COLORS.indigoDeep}, ${COLORS.indigoPanel});
          padding: 24px 24px 0 24px;
          color: ${COLORS.cream};
        }
        .txl-header-top { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; flex-wrap:wrap; }
        .txl-title-row { display:flex; align-items:center; gap: 10px; flex-wrap: wrap; }
        .txl-title { font-family: 'Lora', Georgia, serif; font-size: 30px; font-weight: 600; margin: 0; letter-spacing: 0.2px; line-height: 1.15; }
        .txl-icon-btn-onDark { color: ${COLORS.creamSoft}; }
        .txl-icon-btn-onDark:hover { background: rgba(244,239,224,0.15); color: ${COLORS.cream}; }
        .txl-subtitle { margin: 6px 0 18px 0; font-size: 13px; color: ${COLORS.creamSoft}; opacity: 0.85; }
        .txl-header-actions { display:flex; align-items:center; gap: 8px; flex-wrap: wrap; }
        .txl-save-status { font-size: 11.5px; color: ${COLORS.creamSoft}; opacity: 0.8; white-space: nowrap; }
        .txl-utility-btn { background: none; border: 1px solid rgba(244,239,224,0.35); color: ${COLORS.creamSoft}; border-radius: 8px; padding: 6px 10px; font-size: 12px; display:flex; align-items:center; gap:6px; cursor:pointer; }
        .txl-utility-btn:hover { border-color: rgba(244,239,224,0.7); }
        .txl-tabs { display:flex; gap:4px; }
        .txl-tab { background:none; border:none; color: ${COLORS.creamSoft}; padding: 10px 16px; font-size: 13.5px; cursor:pointer; border-radius: 8px 8px 0 0; display:flex; align-items:center; gap:6px; }
        .txl-tab.active { background: ${COLORS.cream}; color: ${COLORS.ink}; font-weight: 600; }
        .txl-body { background: ${COLORS.cream}; padding: 22px 24px 26px 24px; }
        .txl-banner { background: ${COLORS.turmeric}; color: #fff; padding: 8px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 14px; }
        .txl-banner-error { background: ${COLORS.madder}; color: #fff; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 14px; display:flex; align-items:center; justify-content:space-between; gap: 10px; flex-wrap: wrap; }
        .txl-banner-error-msg { display:flex; align-items:center; gap: 8px; }
        .txl-banner-retry { background: rgba(255,255,255,0.2); border: none; color:#fff; border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor:pointer; font-weight:600; }
        .txl-banner-retry:hover { background: rgba(255,255,255,0.32); }
        .txl-grid { display:grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
        @media (max-width: 720px) { .txl-grid { grid-template-columns: repeat(2, 1fr); } }
        .txl-tile { background: #fff; border-left: 4px solid; border-radius: 8px; padding: 12px 14px; box-shadow: 0 1px 2px rgba(43,38,32,0.08); }
        .txl-tile-label { font-size: 11.5px; color: ${COLORS.inkSoft}; text-transform: uppercase; letter-spacing: 0.4px; }
        .txl-tile-value { font-family:'IBM Plex Mono', monospace; font-size: 19px; font-weight: 600; margin-top: 4px; }
        .txl-tile-sub { font-size: 11.5px; color: ${COLORS.inkSoft}; margin-top: 2px; }
        .txl-charts { display:grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
        @media (max-width: 780px) { .txl-charts { grid-template-columns: 1fr; } }
        .txl-panel { background: #fff; border-radius: 10px; padding: 14px 16px; box-shadow: 0 1px 2px rgba(43,38,32,0.08); }
        .txl-panel h4 { margin: 0 0 8px 0; font-size: 13.5px; font-family: 'Lora', Georgia, serif; }
        .txl-paybars { display:flex; flex-direction:column; gap: 14px; }
        .txl-paybar-top { display:flex; justify-content:space-between; font-size: 12px; margin-bottom: 4px; color: ${COLORS.inkSoft}; }
        .txl-paybar-track { background: ${COLORS.creamSoft}; border-radius: 6px; height: 8px; overflow:hidden; }
        .txl-paybar-fill { background: ${COLORS.green}; height: 100%; }
        .txl-recent { list-style:none; margin:0; padding:0; font-size: 13px; }
        .txl-recent li { display:flex; justify-content:space-between; gap:10px; padding: 8px 0; border-bottom: 1px solid ${COLORS.rule}; }
        .txl-recent li:last-child { border-bottom:none; }
        .txl-recent-desc { color: ${COLORS.ink}; }
        .txl-recent-amt { font-family:'IBM Plex Mono', monospace; color: ${COLORS.inkSoft}; white-space:nowrap; }
        .txl-toolbar { display:flex; justify-content:space-between; align-items:center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
        .txl-search { display:flex; align-items:center; gap:6px; background:#fff; border:1px solid ${COLORS.rule}; border-radius: 8px; padding: 7px 10px; flex: 1; min-width: 180px; max-width: 320px; }
        .txl-search input { border:none; outline:none; font-size: 13px; flex:1; background:transparent; }
        .txl-btn { border:none; border-radius: 8px; padding: 9px 14px; font-size: 13px; cursor:pointer; display:flex; align-items:center; gap:6px; font-weight: 600; }
        .txl-btn-primary { background: ${COLORS.indigoPanel}; color: #fff; }
        .txl-btn-primary:hover { background: ${COLORS.indigoDeep}; }
        .txl-btn-ghost { background: transparent; color: ${COLORS.inkSoft}; border: 1px solid ${COLORS.rule}; }
        .txl-table-wrap { overflow-x: auto; background:#fff; border-radius: 10px; box-shadow: 0 1px 2px rgba(43,38,32,0.08); }
        .txl-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 720px; }
        .txl-table th { text-align:left; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.3px; color: ${COLORS.inkSoft}; padding: 10px 12px; border-bottom: 1px solid ${COLORS.rule}; }
        .txl-table td { padding: 9px 12px; border-bottom: 1px solid ${COLORS.rule}; vertical-align: middle; }
        .txl-table tr:last-child td { border-bottom: none; }
        .txl-mono { font-family: 'IBM Plex Mono', monospace; }
        .txl-row-actions { display:flex; gap:4px; justify-content:flex-end; white-space:nowrap; }
        .txl-icon-btn { background:none; border:none; cursor:pointer; color: ${COLORS.inkSoft}; padding: 5px; border-radius: 6px; display:flex; }
        .txl-icon-btn:hover { background: ${COLORS.creamSoft}; color: ${COLORS.ink}; }
        .txl-icon-btn-danger:hover { background: #f6dedd; color: ${COLORS.madder}; }
        .txl-pill { font-size: 11px; padding: 3px 9px; border-radius: 999px; font-weight: 600; }
        .txl-pill-paid { background: #e3ede4; color: ${COLORS.green}; }
        .txl-pill-partial { background: #f5e8d3; color: ${COLORS.turmeric}; }
        .txl-pill-pending { background: #f5dedc; color: ${COLORS.madder}; }
        .txl-empty { background:#fff; border-radius: 10px; padding: 30px; text-align:center; color: ${COLORS.inkSoft}; font-size: 13.5px; }
        .txl-form { background:#fff; border: 1px solid ${COLORS.rule}; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
        .txl-form-head { display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px; }
        .txl-form-head h3 { margin:0; font-size: 15px; font-family: 'Lora', Georgia, serif; }
        .txl-form-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px 14px; }
        @media (max-width: 720px) { .txl-form-grid { grid-template-columns: 1fr 1fr; } }
        .txl-field { display:flex; flex-direction:column; font-size: 12px; color: ${COLORS.inkSoft}; gap: 4px; }
        .txl-field-wide { grid-column: 1 / -1; }
        .txl-field input, .txl-field textarea { font-size: 13px; padding: 7px 9px; border: 1px solid ${COLORS.rule}; border-radius: 6px; font-family: inherit; color: ${COLORS.ink}; }
        .txl-field input[readonly] { background: ${COLORS.creamSoft}; color: ${COLORS.inkSoft}; font-family: 'IBM Plex Mono', monospace; }
        .txl-field input:focus, .txl-field textarea:focus { outline: 2px solid ${COLORS.turmeric}; outline-offset: 1px; }
        .txl-req { color: ${COLORS.madder}; }
        .txl-form-error { color: ${COLORS.madder}; font-size: 12.5px; margin-top: 8px; }
        .txl-form-actions { display:flex; justify-content:flex-end; gap: 8px; margin-top: 12px; }
        .txl-loading { padding: 60px 20px; text-align:center; color: ${COLORS.creamSoft}; }
        .txl-backup textarea { width: 100%; font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; border: 1px solid ${COLORS.rule}; border-radius: 6px; padding: 8px; color: ${COLORS.ink}; }
        .txl-backup-row { display:flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
      `}</style>

      <div className="txl-header">
        <div className="txl-header-top">
          <div>
            <div className="txl-title-row">
              <p className="txl-title">{firm.name || "Textile Ledger"}</p>
              {!loading && (
                <button className="txl-icon-btn txl-icon-btn-onDark" onClick={() => setFirmEditing(true)} aria-label="Edit business details">
                  <Pencil size={14} />
                </button>
              )}
            </div>
            <p className="txl-subtitle">
              {[firm.address, firm.phone, firm.gstin ? `GSTIN ${firm.gstin}` : null].filter(Boolean).join(" · ")
                || "Sales, purchases and payment status in one place"}
            </p>
          </div>
          <div className="txl-header-actions">
            {saveStatus === "saving" && <span className="txl-save-status">Saving…</span>}
            {saveStatus === "saved" && <span className="txl-save-status">All changes saved</span>}
            <button className="txl-utility-btn" onClick={downloadExcelFiles}>Download for Excel</button>
            <button className="txl-utility-btn" onClick={() => setBackupOpen((v) => !v)}>
              <DatabaseBackup size={13} /> Backup
            </button>
            <button className="txl-utility-btn" onClick={clearAll}><RotateCcw size={13} /> Clear all data</button>
          </div>
        </div>
        <div className="txl-tabs">
          <button className={`txl-tab ${tab === "dashboard" ? "active" : ""}`} onClick={() => setTab("dashboard")}>
            <LayoutGrid size={14} /> Dashboard
          </button>
          <button className={`txl-tab ${tab === "sales" ? "active" : ""}`} onClick={() => setTab("sales")}>
            <Receipt size={14} /> Sales
          </button>
          <button className={`txl-tab ${tab === "purchases" ? "active" : ""}`} onClick={() => setTab("purchases")}>
            <Boxes size={14} /> Purchases
          </button>
          <button className={`txl-tab ${tab === "stock" ? "active" : ""}`} onClick={() => setTab("stock")}>
            <Layers size={14} /> Stock
          </button>
        </div>
      </div>

      <div className="txl-body">
        {!storageAvailable && (
          <div className="txl-banner-error">
            <span className="txl-banner-error-msg"><AlertCircle size={15} /> Saved storage isn't reachable here, so entries won't carry over once you leave this view.</span>
          </div>
        )}
        {saveStatus === "error" && (
          <div className="txl-banner-error">
            <span className="txl-banner-error-msg"><AlertCircle size={15} /> Your last change is showing here but didn't save. Try again before you close this.</span>
            <button className="txl-banner-retry" onClick={retrySave}>Retry save</button>
          </div>
        )}
        {banner && <div className="txl-banner">{banner}</div>}

        {backupOpen && (
          <div className="txl-form txl-backup">
            <div className="txl-form-head">
              <h3>Backup your data</h3>
              <button type="button" className="txl-icon-btn" onClick={() => setBackupOpen(false)} aria-label="Close backup panel">
                <X size={16} />
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 0 }}>
              Copy the text below and save it somewhere safe (a note, an email to yourself). If anything ever goes wrong with saving, you can paste it back in to restore everything.
            </p>
            <textarea rows={5} readOnly value={exportData()} onFocus={(e) => e.target.select()} />
            <div className="txl-backup-row">
              <button type="button" className="txl-btn txl-btn-ghost" onClick={downloadBackup}>Download full backup</button>
              <button
                type="button"
                className="txl-btn txl-btn-ghost"
                onClick={() => {
                  if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(exportData()).then(() => flashBanner("Backup copied to clipboard."));
                  }
                }}
              >
                Copy backup text
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 14, marginBottom: 4 }}>Restore from a backup you saved earlier:</p>
            <textarea rows={5} placeholder="Paste backup text here…" value={importText} onChange={(e) => setImportText(e.target.value)} />
            {importError && <div className="txl-form-error">{importError}</div>}
            <div className="txl-backup-row">
              <button type="button" className="txl-btn txl-btn-primary" onClick={importData} disabled={!importText.trim()}>Restore from backup</button>
            </div>
          </div>
        )}

        {firmEditing && (
          <RecordForm
            fields={FIRM_FIELDS}
            initial={firm}
            suggestionsMap={{}}
            onCancel={() => setFirmEditing(false)}
            onSave={saveFirm}
            title="Business details"
          />
        )}

        {loading ? (
          <div className="txl-loading">Loading your ledger…</div>
        ) : tab === "dashboard" ? (
          <>
            <div className="txl-grid">
              <StatTile label="Metres sold" value={formatMeters(totals.sMeters)} accent={COLORS.indigoPanel} />
              <StatTile label="Metres purchased" value={formatMeters(totals.pMeters)} accent={COLORS.indigoPanel} />
              <StatTile label="Sales amount" value={formatINR(totals.sRevenue)} sub={`${formatINR(totals.sReceivable)} outstanding`} accent={COLORS.turmeric} />
              <StatTile
                label="Profit"
                value={formatINR(totals.profit)}
                sub="Sales amount − procurement spend"
                accent={totals.profit >= 0 ? COLORS.green : COLORS.madder}
              />
            </div>

            <div className="txl-charts">
              <div className="txl-panel">
                <h4>Revenue by quality</h4>
                {revenueByQuality.length ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={revenueByQuality} margin={{ top: 6, right: 6, left: 0, bottom: 34 }}>
                      <CartesianGrid stroke={COLORS.rule} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: COLORS.inkSoft }} angle={-25} textAnchor="end" interval={0} height={50} />
                      <YAxis tick={{ fontSize: 11, fill: COLORS.inkSoft }} width={44} />
                      <Tooltip formatter={(v) => formatINR(v)} />
                      <Bar dataKey="value" fill={COLORS.turmeric} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="txl-empty">No sales recorded yet.</div>}
              </div>
              <div className="txl-panel">
                <h4>Spend by supplier</h4>
                {spendByFirm.length ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={spendByFirm} margin={{ top: 6, right: 6, left: 0, bottom: 34 }}>
                      <CartesianGrid stroke={COLORS.rule} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: COLORS.inkSoft }} angle={-25} textAnchor="end" interval={0} height={50} />
                      <YAxis tick={{ fontSize: 11, fill: COLORS.inkSoft }} width={44} />
                      <Tooltip formatter={(v) => formatINR(v)} />
                      <Bar dataKey="value" fill={COLORS.madder} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="txl-empty">No purchases recorded yet.</div>}
              </div>
            </div>

            <div className="txl-charts">
              <div className="txl-panel">
                <h4>Payment status</h4>
                <div className="txl-paybars">
                  <PayBar label="Sales received" received={totals.sReceived} outstanding={totals.sReceivable} />
                  <PayBar label="Purchases paid" received={totals.pPaid} outstanding={totals.pPayable} />
                </div>
              </div>
              <div className="txl-panel">
                <h4>Recent activity</h4>
                {recent.length ? (
                  <ul className="txl-recent">
                    {recent.map((r) => (
                      <li key={r.kind + r.id}>
                        <span className="txl-recent-desc">
                          {r.kind === "sale"
                            ? <>Sold {formatMeters(r.meters)} {r.quality || "fabric"} to {r.buyer || "buyer"}</>
                            : <>Bought {formatMeters(r.meters)} {r.material || "material"} from {r.firm || "firm"}</>}
                          {" — "}<StatusPill status={r.status} />
                        </span>
                        <span className="txl-recent-amt">{formatINR(r.total)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <div className="txl-empty">Nothing logged yet — add a sale or purchase to see it here.</div>}
              </div>
            </div>
          </>
        ) : tab === "sales" ? (
          <>
            <div className="txl-toolbar">
              <div className="txl-search">
                <Search size={14} color={COLORS.inkSoft} />
                <input placeholder="Search quality, buyer, location…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button className="txl-btn txl-btn-primary" onClick={() => openNew("sale")}><Plus size={14} /> Add sale</button>
            </div>
            {formState?.type === "sale" && (
              <RecordForm
                fields={SALE_FIELDS}
                initial={formState.record}
                suggestionsMap={suggestionsMap}
                onCancel={closeForm}
                onSave={saveRecord}
                title={formState.record.id ? "Edit sale" : "New sale"}
              />
            )}
            <LedgerTable
              rows={filteredSales}
              columns={saleColumns}
              onEdit={(r) => openEdit("sale", r)}
              onDelete={(id) => requestDelete("sale", id)}
              confirmId={confirmDelete?.type === "sale" ? confirmDelete.id : null}
              onConfirmDelete={confirmDeleteRow}
              onCancelDelete={cancelDelete}
              emptyLabel="No sales match your search yet."
            />
          </>
        ) : tab === "purchases" ? (
          <>
            <div className="txl-toolbar">
              <div className="txl-search">
                <Search size={14} color={COLORS.inkSoft} />
                <input placeholder="Search firm, quality…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button className="txl-btn txl-btn-primary" onClick={() => openNew("purchase")}><Plus size={14} /> Add purchase</button>
            </div>
            {formState?.type === "purchase" && (
              <RecordForm
                fields={PURCHASE_FIELDS}
                initial={formState.record}
                suggestionsMap={suggestionsMap}
                onCancel={closeForm}
                onSave={saveRecord}
                title={formState.record.id ? "Edit purchase" : "New purchase"}
              />
            )}
            <LedgerTable
              rows={filteredPurchases}
              columns={purchaseColumns}
              onEdit={(r) => openEdit("purchase", r)}
              onDelete={(id) => requestDelete("purchase", id)}
              confirmId={confirmDelete?.type === "purchase" ? confirmDelete.id : null}
              onConfirmDelete={confirmDeleteRow}
              onCancelDelete={cancelDelete}
              emptyLabel="No purchases match your search yet."
            />
          </>
        ) : (
          <>
            <div className="txl-grid">
              <StatTile label="Fabric qualities tracked" value={stockSummary.qualities} accent={COLORS.indigoPanel} />
              <StatTile
                label="Net metres in stock"
                value={formatMeters(stockSummary.netStock)}
                sub={stockSummary.netStock < 0 ? "Sold more than recorded purchases" : "Purchased minus sold"}
                accent={stockSummary.netStock < 0 ? COLORS.madder : COLORS.green}
              />
              <StatTile label="Estimated stock value" value={formatINR(stockSummary.stockValue)} sub="At average purchase rate" accent={COLORS.turmeric} />
            </div>

            <div className="txl-panel" style={{ marginBottom: 16 }}>
              <h4>In-stock metres by quality</h4>
              {stockChartData.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stockChartData} margin={{ top: 6, right: 6, left: 0, bottom: 34 }}>
                    <CartesianGrid stroke={COLORS.rule} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: COLORS.inkSoft }} angle={-25} textAnchor="end" interval={0} height={50} />
                    <YAxis tick={{ fontSize: 11, fill: COLORS.inkSoft }} width={44} />
                    <Tooltip formatter={(v) => formatMeters(v)} />
                    <Bar dataKey="value" fill={COLORS.green} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="txl-empty">No fabric currently in stock.</div>}
            </div>

            {stockByQuality.length ? (
              <div className="txl-table-wrap">
                <table className="txl-table">
                  <thead>
                    <tr>
                      <th>Quality</th>
                      <th style={{ textAlign: "right" }}>Purchased</th>
                      <th style={{ textAlign: "right" }}>Sold</th>
                      <th style={{ textAlign: "right" }}>In stock</th>
                      <th style={{ textAlign: "right" }}>Est. value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockByQuality.map((r) => (
                      <tr key={r.quality}>
                        <td>{r.quality}</td>
                        <td className="txl-mono" style={{ textAlign: "right" }}>{formatMeters(r.purchased)}</td>
                        <td className="txl-mono" style={{ textAlign: "right" }}>{formatMeters(r.sold)}</td>
                        <td className="txl-mono" style={{ textAlign: "right", color: r.inStock < 0 ? COLORS.madder : COLORS.ink }}>
                          {formatMeters(r.inStock)}
                        </td>
                        <td className="txl-mono" style={{ textAlign: "right" }}>{formatINR(r.estValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="txl-empty">No stock movements yet — add purchases and sales to see fabric-wise inventory here.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

