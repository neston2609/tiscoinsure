import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CloudUpload,
  DatabaseBackup,
  FileText,
  Filter,
  Globe2,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  useEffect,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";
import { api } from "./lib/api";
import type {
  CampaignFilters,
  CampaignList,
  Customer,
  Inquiry,
  Policy,
  Product,
} from "../server/domain/types";
import { App as GenesysSettings } from "./App";

type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
type PolicyRow = Policy & {
  daysUntilExpiry: number;
  customer?: Customer;
  product?: Product;
};
type SyncResult = { policyId: string; status: string; message: string };
async function syncInBatches(
  policyIds: string[],
  campaignListId: string | undefined,
  onProgress: (processed: number, total: number) => void,
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (let index = 0; index < policyIds.length; index += 5) {
    const batch = policyIds.slice(index, index + 5);
    const response = await api<{ results: SyncResult[] }>(
      `${base}/genesys/sync/bulk`,
      {
        method: "POST",
        body: JSON.stringify({ policyIds: batch, campaignListId }),
      },
    );
    results.push(...response.results);
    onProgress(results.length, policyIds.length);
  }
  return results;
}
const base = "/api/admin";
const TH = new Intl.NumberFormat("th-TH");
const money = (value: number) => `฿${TH.format(value)}`;
const dateText = (value?: string | null) =>
  value
    ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
const channels = ["VOICE", "SMS", "EMAIL", "LINE", "DIGITAL"];
const statuses = [
  "NOT_STARTED",
  "CONTACT_PENDING",
  "CONTACTED",
  "INTERESTED",
  "CALLBACK_REQUESTED",
  "NOT_INTERESTED",
  "RENEWED",
  "EXPIRED",
  "CANCELLED",
];
const statusTH: Record<string, string> = {
  NOT_STARTED: "ยังไม่เริ่ม",
  CONTACT_PENDING: "รอติดต่อ",
  CONTACTED: "ติดต่อแล้ว",
  INTERESTED: "สนใจ",
  CALLBACK_REQUESTED: "ขอโทรกลับ",
  NOT_INTERESTED: "ไม่สนใจ",
  RENEWED: "ต่ออายุแล้ว",
  EXPIRED: "หมดอายุ",
  CANCELLED: "ยกเลิก",
  NOT_SYNCED: "ยังไม่ซิงก์",
  SYNCED: "ซิงก์แล้ว",
  OUTDATED: "ข้อมูลเปลี่ยน",
  FAILED: "ผิดพลาด",
  SKIPPED_DNC: "DNC",
  INVALID_PHONE: "เบอร์ไม่ถูกต้อง",
  SCHEMA_MISMATCH: "คอลัมน์ไม่ตรง",
  NEW: "ใหม่",
  CLOSED: "ปิดแล้ว",
  CONVERTED: "สำเร็จ",
};
const titleFor: Record<string, string> = {
  dashboard: "ภาพรวมธุรกิจ",
  customers: "ลูกค้า",
  products: "สินค้า",
  policies: "กรมธรรม์",
  renewals: "ติดตามต่ออายุ",
  campaigns: "แคมเปญ",
  inquiries: "คำขอติดต่อกลับ",
  genesys: "Genesys Cloud",
  audit: "บันทึกกิจกรรม",
  settings: "ตั้งค่าระบบ",
};
const nav = [
  { key: "dashboard", label: "ภาพรวม", icon: LayoutDashboard },
  { key: "customers", label: "ลูกค้า", icon: Users },
  { key: "products", label: "สินค้า", icon: ShieldCheck },
  { key: "policies", label: "กรมธรรม์", icon: FileText },
  { key: "renewals", label: "ต่ออายุ", icon: RefreshCw },
  { key: "campaigns", label: "แคมเปญ", icon: Filter },
  { key: "inquiries", label: "คำขอติดต่อกลับ", icon: ClipboardList },
  { key: "genesys", label: "Genesys Cloud", icon: CloudUpload },
  { key: "audit", label: "บันทึกกิจกรรม", icon: Activity },
  { key: "settings", label: "ตั้งค่า", icon: Settings },
];

export function Root() {
  const path = window.location.pathname;
  const [session, setSession] = useState<{
    authenticated: boolean;
    username: string;
  } | null>(null);
  useEffect(() => {
    if (path.startsWith("/backend"))
      api<{ authenticated: boolean; username: string }>(`${base}/auth/session`)
        .then(setSession)
        .catch(() => setSession({ authenticated: false, username: "" }));
  }, [path]);
  if (!path.startsWith("/backend")) return <PublicEntry />;
  if (!session) return <div className="admin-loading">กำลังโหลด...</div>;
  if (!session.authenticated) return <Login onLogin={setSession} />;
  if (path === "/backend/login")
    window.history.replaceState({}, "", "/backend");
  return <AdminPortal username={session.username} />;
}

function PublicEntry() {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  useEffect(() => {
    import("./PublicSite").then((module) =>
      setComponent(() => module.PublicSite),
    );
  }, []);
  return Component ? <Component /> : null;
}

function Login({
  onLogin,
}: {
  onLogin: (value: { authenticated: boolean; username: string }) => void;
}) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ authenticated: boolean; username: string }>(
        `${base}/auth/login`,
        { method: "POST", body: JSON.stringify({ username, password }) },
      );
      window.history.replaceState({}, "", "/backend");
      onLogin(result);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "เข้าสู่ระบบไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-login">
      <div className="login-brand">
        <span>
          <ShieldCheck size={27} />
        </span>
        <b>MFEC Insurrance</b>
        <small>Management Portal</small>
      </div>
      <form onSubmit={submit}>
        <h1>เข้าสู่ระบบ</h1>
        <p>จัดการข้อมูลประกันภัยและการต่ออายุ</p>
        <label>
          ชื่อผู้ใช้
          <input
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          รหัสผ่าน
          <input
            autoComplete="current-password"
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <div className="admin-error" role="alert">
            {error}
          </div>
        )}
        <button className="admin-primary" disabled={busy}>
          {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          <ArrowRight size={18} />
        </button>
      </form>
      <a href="/">← กลับเว็บไซต์</a>
    </div>
  );
}

function AdminPortal({ username }: { username: string }) {
  const key = window.location.pathname.split("/")[2] || "dashboard";
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<{
    customers: Customer[];
    policies: Policy[];
  } | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim().length >= 2)
        api<{ customers: Customer[]; policies: Policy[] }>(
          `${base}/search?q=${encodeURIComponent(search)}`,
        )
          .then(setSearchResult)
          .catch(() => setSearchResult(null));
      else setSearchResult(null);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  async function logout() {
    await api(`${base}/auth/logout`, { method: "POST" });
    window.location.href = "/backend/login";
  }
  if (key === "genesys")
    return (
      <div className="genesys-admin">
        <div className="genesys-exit">
          <a href="/backend">← กลับแดชบอร์ด</a>
          <button onClick={logout}>
            <LogOut size={15} /> ออกจากระบบ
          </button>
        </div>
        <GenesysSettings />
      </div>
    );
  return (
    <div className="admin-shell">
      <aside className={menuOpen ? "admin-sidebar open" : "admin-sidebar"}>
        <div className="admin-sidebar-brand">
          <span>
            <ShieldCheck size={21} />
          </span>
          <b>
            MFEC <strong>Insurrance</strong>
          </b>
          <small>MANAGEMENT</small>
        </div>
        <nav>
          {nav.map(({ key: itemKey, label, icon: Icon }) => (
            <a
              key={itemKey}
              className={key === itemKey ? "active" : ""}
              href={
                itemKey === "dashboard" ? "/backend" : `/backend/${itemKey}`
              }
            >
              <Icon size={18} />
              {label}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a href="/" target="_blank" rel="noreferrer">
            <Globe2 size={17} /> เปิดหน้าเว็บไซต์
          </a>
          <button onClick={logout}>
            <LogOut size={17} /> ออกจากระบบ
          </button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <button
            className="admin-menu-button"
            aria-label="เมนู"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Menu size={20} />
          </button>
          <div className="admin-breadcrumb">
            MFEC Insurrance <ChevronRight size={14} />{" "}
            <b>{titleFor[key] || "จัดการ"}</b>
          </div>
          <div className="admin-global-search">
            <Search size={17} />
            <input
              aria-label="ค้นหาในระบบ"
              placeholder="ค้นหาลูกค้า กรมธรรม์ ทะเบียนรถ"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {searchResult && (
              <div className="search-popover">
                <b>ลูกค้า</b>
                {searchResult.customers.map((item) => (
                  <a
                    key={item.customerId}
                    href={`/backend/customers/${item.customerId}`}
                  >
                    {item.firstName} {item.lastName}
                    <small>{item.customerId}</small>
                  </a>
                ))}
                <b>กรมธรรม์</b>
                {searchResult.policies.map((item) => (
                  <a
                    key={item.policyId}
                    href={`/backend/policies/${item.policyId}`}
                  >
                    {item.policyNumber}
                    <small>{item.vehicle.licensePlate}</small>
                  </a>
                ))}
                {!searchResult.customers.length &&
                  !searchResult.policies.length && <span>ไม่พบข้อมูล</span>}
              </div>
            )}
          </div>
          <div className="admin-user">
            <span>{username.slice(0, 1).toUpperCase()}</span>
            {username}
          </div>
        </header>
        <main className="admin-content">
          {key === "dashboard" ? (
            <Dashboard />
          ) : key === "customers" ? (
            <Customers />
          ) : key === "products" ? (
            <Products />
          ) : key === "policies" ? (
            <Policies />
          ) : key === "renewals" ? (
            <Policies renewal />
          ) : key === "campaigns" ? (
            <Campaigns />
          ) : key === "inquiries" ? (
            <Inquiries />
          ) : key === "audit" ? (
            <Audit />
          ) : key === "settings" ? (
            <SystemSettings />
          ) : (
            <div className="empty-state">ไม่พบหน้านี้</div>
          )}
        </main>
      </div>
    </div>
  );
}

function PageHead({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="admin-page-head">
      <div>
        {eyebrow && <span>{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="admin-page-action">{action}</div>}
    </div>
  );
}
function Badge({ value }: { value: string }) {
  return (
    <span
      className={`admin-badge ${value.toLowerCase().replace(/[^a-z]/g, "-")}`}
    >
      {statusTH[value] || value}
    </span>
  );
}
function Empty({ text = "ไม่พบข้อมูล" }: { text?: string }) {
  return <div className="admin-empty">{text}</div>;
}
function ErrorNotice({ error }: { error: string }) {
  return error ? (
    <div className="admin-error" role="alert">
      {error}
    </div>
  ) : null;
}
function Pager({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="admin-pager">
      <span>
        {total
          ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}`
          : "0"}{" "}
        จาก {total} รายการ
      </span>
      <div>
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="หน้าก่อน"
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          aria-label="หน้าถัดไป"
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="admin-modal-backdrop" onMouseDown={onClose}>
      <div
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head">
          <h2>{title}</h2>
          <button aria-label="ปิด" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function useList<T>(url: string) {
  const [data, setData] = useState<Page<T>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, refresh] = useState(0);
  useEffect(() => {
    setLoading(true);
    api<Page<T>>(url)
      .then(setData)
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [url, version]);
  return { data, error, loading, refresh: () => refresh((v) => v + 1) };
}

function Dashboard() {
  const [data, setData] = useState<{
    kpis: Record<string, number>;
    charts: Record<string, { label: string; value: number }[]>;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<typeof data>(`${base}/dashboard`)
      .then(setData)
      .catch((reason) => setError(reason.message));
  }, []);
  const kpis = data?.kpis;
  return (
    <>
      <PageHead
        eyebrow="แดชบอร์ด"
        title="ภาพรวมธุรกิจ"
        description="ข้อมูลลูกค้า กรมธรรม์ และงานต่ออายุในระบบ"
      />
      <ErrorNotice error={error} />
      {!data ? (
        <div className="admin-loading">กำลังโหลด...</div>
      ) : (
        <>
          <div className="kpi-grid">
            {[
              ["ลูกค้าทั้งหมด", kpis?.totalCustomers, "customers"],
              ["กรมธรรม์ที่ใช้งาน", kpis?.activePolicies, "policies"],
              ["เบี้ยประกันรวม", money(kpis?.totalPremium || 0), "policies"],
              ["หมดอายุใน 30 วัน", kpis?.expiring30, "renewals"],
              ["รอติดต่อ", kpis?.contactPending, "renewals"],
              ["ขอโทรกลับ", kpis?.callbackRequested, "renewals"],
              ["ต่ออายุแล้ว", kpis?.renewed, "renewals"],
              ["คำขอใหม่", kpis?.newInquiries, "inquiries"],
            ].map(([label, value, link]) => (
              <a
                className="kpi-tile"
                key={String(label)}
                href={`/backend/${link}`}
              >
                <span>{label}</span>
                <strong>
                  {typeof value === "number" ? TH.format(value) : value}
                </strong>
                <ArrowRight size={16} />
              </a>
            ))}
          </div>
          <div className="dashboard-row">
            <div className="admin-panel">
              <div className="panel-head">
                <h2>กรมธรรม์ใกล้หมดอายุ</h2>
                <a href="/backend/renewals">
                  ดูรายการ <ArrowRight size={15} />
                </a>
              </div>
              <div className="expiry-bars">
                {[
                  ["7 วัน", kpis?.expiring7],
                  ["30 วัน", kpis?.expiring30],
                  ["60 วัน", kpis?.expiring60],
                  ["90 วัน", kpis?.expiring90],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <span>{label}</span>
                    <div>
                      <i
                        style={{
                          width: `${Math.max(3, (Number(value) / Math.max(1, kpis?.expiring90 || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <b>{value}</b>
                  </div>
                ))}
              </div>
            </div>
            <div className="admin-panel">
              <div className="panel-head">
                <h2>สถานะการต่ออายุ</h2>
              </div>
              <div className="dashboard-status-list">
                {data.charts.byRenewal.map((item) => (
                  <div key={item.label}>
                    <Badge value={item.label} />
                    <b>{item.value}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="dashboard-row">
            <div className="admin-panel">
              <div className="panel-head">
                <h2>กรมธรรม์ตามสินค้า</h2>
              </div>
              <div className="mini-bars">
                {data.charts.byProduct.map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <div>
                      <i
                        style={{
                          width: `${(item.value / Math.max(...data.charts.byProduct.map((v) => v.value), 1)) * 100}%`,
                        }}
                      />
                    </div>
                    <b>{item.value}</b>
                  </div>
                ))}
              </div>
            </div>
            <div className="admin-panel">
              <div className="panel-head">
                <h2>Genesys Sync</h2>
                <a href="/backend/genesys">
                  ตั้งค่าการเชื่อมต่อ <ArrowRight size={15} />
                </a>
              </div>
              <div className="dashboard-status-list">
                {data.charts.byGenesys.map((item) => (
                  <div key={item.label}>
                    <Badge value={item.label} />
                    <b>{item.value}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

const blankCustomer = (): Customer => ({
  customerId: "",
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  preferredChannel: "VOICE",
  province: "",
  dnc: false,
  createdAt: "",
  updatedAt: "",
});
function Customers() {
  const id = window.location.pathname.split("/")[3];
  if (id) return <Customer360 id={id} />;
  return <CustomerList />;
}
function CustomerList() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [channel, setChannel] = useState("");
  const [dnc, setDnc] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [error, setError] = useState("");
  const url = `${base}/customers?search=${encodeURIComponent(search)}&channel=${channel}&dnc=${dnc}&page=${page}`;
  const { data, loading, refresh } = useList<Customer>(url);
  async function remove(item: Customer) {
    if (!window.confirm(`ลบลูกค้า ${item.firstName} ${item.lastName}?`)) return;
    try {
      await api(`${base}/customers/${item.customerId}`, { method: "DELETE" });
      refresh();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  return (
    <>
      <PageHead
        eyebrow="ข้อมูลหลัก"
        title="ลูกค้า"
        description="ค้นหาและจัดการข้อมูลผู้เอาประกัน"
        action={
          <button
            className="admin-primary"
            onClick={() => setEditing(blankCustomer())}
          >
            <Plus size={17} /> เพิ่มลูกค้า
          </button>
        }
      />
      <ErrorNotice error={error} />
      <div className="admin-toolbar">
        <div className="admin-search">
          <Search size={17} />
          <input
            placeholder="ชื่อ เบอร์โทร หรือรหัสลูกค้า"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          value={channel}
          onChange={(event) => {
            setChannel(event.target.value);
            setPage(1);
          }}
        >
          <option value="">ทุกช่องทาง</option>
          {channels.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          value={dnc}
          onChange={(event) => {
            setDnc(event.target.value);
            setPage(1);
          }}
        >
          <option value="">ทั้งหมด</option>
          <option value="true">DNC</option>
          <option value="false">ติดต่อได้</option>
        </select>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>รหัส</th>
              <th>ชื่อ-นามสกุล</th>
              <th>เบอร์โทร</th>
              <th>จังหวัด</th>
              <th>ช่องทาง</th>
              <th>DNC</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.customerId}>
                <td>
                  <a
                    href={`/backend/customers/${item.customerId}`}
                    className="table-link"
                  >
                    {item.customerId}
                  </a>
                </td>
                <td>
                  <b>
                    {item.firstName} {item.lastName}
                  </b>
                </td>
                <td>{item.phone}</td>
                <td>{item.province || "—"}</td>
                <td>{item.preferredChannel}</td>
                <td>{item.dnc ? <Badge value="SKIPPED_DNC" /> : "—"}</td>
                <td className="row-actions">
                  <button aria-label="แก้ไข" onClick={() => setEditing(item)}>
                    แก้ไข
                  </button>
                  <button
                    className="danger-link"
                    aria-label="ลบ"
                    onClick={() => remove(item)}
                  >
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.items.length && !loading && <Empty />}
        <Pager
          page={page}
          pageSize={20}
          total={data.total}
          onChange={setPage}
        />
      </div>
      {editing && (
        <CustomerForm
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}
function CustomerForm({
  item,
  onClose,
  onSaved,
}: {
  item: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(item);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        `${base}/customers${item.customerId ? `/${item.customerId}` : ""}`,
        {
          method: item.customerId ? "PUT" : "POST",
          body: JSON.stringify(form),
        },
      );
      onSaved();
      onClose();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={item.customerId ? `แก้ไข ${item.customerId}` : "เพิ่มลูกค้า"}
      onClose={onClose}
    >
      <form className="admin-form" onSubmit={save}>
        <div className="admin-form-grid">
          <label>
            ชื่อ
            <input
              required
              value={form.firstName}
              onChange={(event) =>
                setForm({ ...form, firstName: event.target.value })
              }
            />
          </label>
          <label>
            นามสกุล
            <input
              required
              value={form.lastName}
              onChange={(event) =>
                setForm({ ...form, lastName: event.target.value })
              }
            />
          </label>
          <label>
            โทรศัพท์
            <input
              required
              type="tel"
              value={form.phone}
              onChange={(event) =>
                setForm({ ...form, phone: event.target.value })
              }
            />
          </label>
          <label>
            อีเมล
            <input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
            />
          </label>
          <label>
            จังหวัด
            <input
              value={form.province}
              onChange={(event) =>
                setForm({ ...form, province: event.target.value })
              }
            />
          </label>
          <label>
            ช่องทางที่สะดวก
            <select
              value={form.preferredChannel}
              onChange={(event) =>
                setForm({
                  ...form,
                  preferredChannel: event.target
                    .value as Customer["preferredChannel"],
                })
              }
            >
              {channels.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={form.dnc}
            onChange={(event) =>
              setForm({ ...form, dnc: event.target.checked })
            }
          />{" "}
          ไม่ประสงค์รับการติดต่อ (DNC)
        </label>
        <ErrorNotice error={error} />
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="admin-primary" disabled={busy}>
            <Save size={16} /> บันทึก
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Customer360({ id }: { id: string }) {
  const [data, setData] = useState<{
    customer: Customer;
    policies: PolicyRow[];
    inquiries: Inquiry[];
  } | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const load = () =>
    api<typeof data>(`${base}/customers/${id}/360`)
      .then(setData)
      .catch((reason) => setError(reason.message));
  useEffect(() => {
    void load();
  }, [id]);
  return (
    <>
      <a className="admin-back" href="/backend/customers">
        <ArrowLeft size={16} /> กลับรายการลูกค้า
      </a>
      <PageHead
        eyebrow="Customer 360"
        title={
          data ? `${data.customer.firstName} ${data.customer.lastName}` : id
        }
        description={id}
        action={
          data && (
            <button
              className="admin-secondary"
              onClick={() => setEditing(true)}
            >
              แก้ไขลูกค้า
            </button>
          )
        }
      />
      <ErrorNotice error={error} />
      {data && (
        <>
          <div className="admin-panel customer-profile">
            <div>
              <small>โทรศัพท์</small>
              <b>{data.customer.phone}</b>
            </div>
            <div>
              <small>อีเมล</small>
              <b>{data.customer.email || "—"}</b>
            </div>
            <div>
              <small>จังหวัด</small>
              <b>{data.customer.province || "—"}</b>
            </div>
            <div>
              <small>ช่องทาง</small>
              <b>{data.customer.preferredChannel}</b>
            </div>
            <div>
              <small>การติดต่อ</small>
              <b>
                {data.customer.dnc ? (
                  <Badge value="SKIPPED_DNC" />
                ) : (
                  "ติดต่อได้"
                )}
              </b>
            </div>
          </div>
          <div className="admin-panel">
            <div className="panel-head">
              <h2>กรมธรรม์ ({data.policies.length})</h2>
              <a href="/backend/policies">ดูทั้งหมด</a>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>เลขกรมธรรม์</th>
                    <th>สินค้า</th>
                    <th>ทะเบียน</th>
                    <th>วันหมดอายุ</th>
                    <th>เบี้ย</th>
                    <th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.policies.map((item) => (
                    <tr key={item.policyId}>
                      <td>
                        <a
                          className="table-link"
                          href={`/backend/policies/${item.policyId}`}
                        >
                          {item.policyNumber}
                        </a>
                      </td>
                      <td>{item.product?.productName}</td>
                      <td>{item.vehicle.licensePlate}</td>
                      <td>{dateText(item.expiryDate)}</td>
                      <td>{money(item.premium)}</td>
                      <td>
                        <Badge value={item.renewalStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.policies.length && <Empty />}
            </div>
          </div>
          <div className="admin-panel">
            <div className="panel-head">
              <h2>คำขอติดต่อกลับ ({data.inquiries.length})</h2>
            </div>
            {data.inquiries.length ? (
              data.inquiries.map((item) => (
                <div className="activity-row" key={item.inquiryId}>
                  {item.inquiryId}
                  <Badge value={item.status} />
                  <span>{dateText(item.createdAt)}</span>
                </div>
              ))
            ) : (
              <Empty />
            )}
          </div>
          {editing && (
            <CustomerForm
              item={data.customer}
              onClose={() => setEditing(false)}
              onSaved={load}
            />
          )}
        </>
      )}
    </>
  );
}

const blankCoverage = () => ({
  thirdPartyProperty: true,
  thirdPartyInjury: true,
  ownVehicleCollision: true,
  vehicleTheft: true,
  fire: true,
  flood: false,
  personalAccident: true,
  medicalExpense: true,
  driverBail: true,
});
const coverageTH: Record<string, string> = {
  thirdPartyProperty: "ทรัพย์สินคู่กรณี",
  thirdPartyInjury: "ชีวิต/ร่างกายคู่กรณี",
  ownVehicleCollision: "รถชน",
  vehicleTheft: "รถสูญหาย",
  fire: "ไฟไหม้",
  flood: "น้ำท่วม",
  personalAccident: "อุบัติเหตุส่วนบุคคล",
  medicalExpense: "ค่ารักษาพยาบาล",
  driverBail: "ประกันตัวผู้ขับขี่",
};
function blankProduct(): Product {
  return {
    productId: "",
    productCode: "",
    slug: "",
    productName: "",
    productType: "MOTOR",
    vehicleType: "CAR",
    insuranceClass: "1",
    shortDescription: "",
    description: "",
    insurerName: "MFEC Demo Insurance",
    startingPremium: 0,
    coverage: blankCoverage(),
    coverageLimits: {},
    features: [],
    terms: [],
    eligibleVehicleTypes: ["รถยนต์ส่วนบุคคล"],
    minVehicleAge: 0,
    maxVehicleAge: 20,
    active: true,
    featured: false,
    displayOrder: 99,
    createdAt: "",
    updatedAt: "",
  };
}
function Products() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [active, setActive] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const { data, refresh } = useList<Product>(
    `${base}/products?search=${encodeURIComponent(search)}&active=${active}&page=${page}`,
  );
  async function remove(item: Product) {
    if (!window.confirm(`ลบสินค้า ${item.productName}?`)) return;
    try {
      await api(`${base}/products/${item.productId}`, { method: "DELETE" });
      refresh();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  return (
    <>
      <PageHead
        eyebrow="ข้อมูลหลัก"
        title="สินค้าและแบบประกัน"
        description="จัดการแผนที่แสดงบนเว็บไซต์และใช้ในกรมธรรม์"
        action={
          <button
            className="admin-primary"
            onClick={() => setEditing(blankProduct())}
          >
            <Plus size={17} /> เพิ่มสินค้า
          </button>
        }
      />
      <ErrorNotice error={error} />
      <div className="admin-toolbar">
        <div className="admin-search">
          <Search size={17} />
          <input
            placeholder="ค้นหาชื่อหรือรหัสสินค้า"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          value={active}
          onChange={(event) => {
            setActive(event.target.value);
            setPage(1);
          }}
        >
          <option value="">ทุกสถานะ</option>
          <option value="true">เผยแพร่</option>
          <option value="false">ไม่เผยแพร่</option>
        </select>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>รหัสสินค้า</th>
              <th>ชื่อแผน</th>
              <th>ประเภทรถ</th>
              <th>ชั้น</th>
              <th>เบี้ยเริ่มต้น</th>
              <th>เผยแพร่</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.productId}>
                <td className="mono">{item.productCode}</td>
                <td>
                  <b>{item.productName}</b>
                  <small>{item.shortDescription}</small>
                </td>
                <td>{item.vehicleType}</td>
                <td>{item.insuranceClass}</td>
                <td>{money(item.startingPremium)}</td>
                <td>
                  {item.active ? (
                    <span className="dot-live">ใช้งาน</span>
                  ) : (
                    "ปิด"
                  )}
                </td>
                <td className="row-actions">
                  <button onClick={() => setEditing(item)}>แก้ไข</button>
                  <button className="danger-link" onClick={() => remove(item)}>
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.items.length && <Empty />}
        <Pager
          page={page}
          pageSize={20}
          total={data.total}
          onChange={setPage}
        />
      </div>
      {editing && (
        <ProductForm
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}
function ProductForm({
  item,
  onClose,
  onSaved,
}: {
  item: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(item);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        `${base}/products${item.productId ? `/${item.productId}` : ""}`,
        { method: item.productId ? "PUT" : "POST", body: JSON.stringify(form) },
      );
      onSaved();
      onClose();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={item.productId ? `แก้ไข ${item.productName}` : "เพิ่มสินค้า"}
      onClose={onClose}
    >
      <form className="admin-form" onSubmit={save}>
        <div className="admin-form-grid">
          <label>
            รหัสสินค้า
            <input
              required
              value={form.productCode}
              onChange={(event) =>
                setForm({ ...form, productCode: event.target.value })
              }
            />
          </label>
          <label>
            Slug (URL)
            <input
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={form.slug}
              onChange={(event) =>
                setForm({ ...form, slug: event.target.value })
              }
            />
          </label>
          <label className="wide">
            ชื่อแผน
            <input
              required
              value={form.productName}
              onChange={(event) =>
                setForm({ ...form, productName: event.target.value })
              }
            />
          </label>
          <label>
            ประเภทสินค้า
            <input
              required
              value={form.productType}
              onChange={(event) =>
                setForm({ ...form, productType: event.target.value })
              }
            />
          </label>
          <label>
            ประเภทรถ
            <select
              value={form.vehicleType}
              onChange={(event) =>
                setForm({
                  ...form,
                  vehicleType: event.target.value as Product["vehicleType"],
                })
              }
            >
              <option value="CAR">รถยนต์</option>
              <option value="MOTORCYCLE">รถจักรยานยนต์</option>
              <option value="ADDON">ความคุ้มครองเสริม</option>
            </select>
          </label>
          <label>
            ชั้นประกัน
            <input
              required
              value={form.insuranceClass}
              onChange={(event) =>
                setForm({ ...form, insuranceClass: event.target.value })
              }
            />
          </label>
          <label>
            บริษัทประกัน
            <input
              required
              value={form.insurerName}
              onChange={(event) =>
                setForm({ ...form, insurerName: event.target.value })
              }
            />
          </label>
          <label>
            เบี้ยเริ่มต้น
            <input
              required
              type="number"
              min="0"
              value={form.startingPremium}
              onChange={(event) =>
                setForm({
                  ...form,
                  startingPremium: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            ลำดับแสดง
            <input
              type="number"
              value={form.displayOrder}
              onChange={(event) =>
                setForm({ ...form, displayOrder: Number(event.target.value) })
              }
            />
          </label>
          <label>
            อายุรถต่ำสุด
            <input
              type="number"
              min="0"
              value={form.minVehicleAge}
              onChange={(event) =>
                setForm({ ...form, minVehicleAge: Number(event.target.value) })
              }
            />
          </label>
          <label>
            อายุรถสูงสุด
            <input
              type="number"
              min="0"
              value={form.maxVehicleAge}
              onChange={(event) =>
                setForm({ ...form, maxVehicleAge: Number(event.target.value) })
              }
            />
          </label>
          <label className="wide">
            คำอธิบายสั้น
            <input
              required
              value={form.shortDescription}
              onChange={(event) =>
                setForm({ ...form, shortDescription: event.target.value })
              }
            />
          </label>
          <label className="wide">
            รายละเอียด
            <textarea
              required
              rows={3}
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </label>
          <label className="wide">
            จุดเด่น (หนึ่งบรรทัดต่อข้อ)
            <textarea
              rows={3}
              value={form.features.join("\n")}
              onChange={(event) =>
                setForm({
                  ...form,
                  features: event.target.value.split("\n").filter(Boolean),
                })
              }
            />
          </label>
          <label className="wide">
            เงื่อนไข (หนึ่งบรรทัดต่อข้อ)
            <textarea
              rows={3}
              value={form.terms.join("\n")}
              onChange={(event) =>
                setForm({
                  ...form,
                  terms: event.target.value.split("\n").filter(Boolean),
                })
              }
            />
          </label>
          <label className="wide">
            ประเภทรถที่รับ (หนึ่งบรรทัดต่อข้อ)
            <textarea
              rows={2}
              value={form.eligibleVehicleTypes.join("\n")}
              onChange={(event) =>
                setForm({
                  ...form,
                  eligibleVehicleTypes: event.target.value
                    .split("\n")
                    .filter(Boolean),
                })
              }
            />
          </label>
        </div>
        <div className="form-section-label">ความคุ้มครอง</div>
        <div className="checkbox-grid">
          {Object.entries(coverageTH).map(([key, label]) => (
            <label key={key} className="admin-check">
              <input
                type="checkbox"
                checked={form.coverage[key as keyof Product["coverage"]]}
                onChange={(event) =>
                  setForm({
                    ...form,
                    coverage: { ...form.coverage, [key]: event.target.checked },
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
        <div className="form-section-label">วงเงินความคุ้มครอง</div>
        <div className="admin-form-grid">
          {Object.entries(coverageTH)
            .filter(([key]) => form.coverage[key as keyof Product["coverage"]])
            .map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  value={form.coverageLimits[key] || ""}
                  placeholder="เช่น สูงสุด 1,000,000 บาท"
                  onChange={(event) =>
                    setForm({
                      ...form,
                      coverageLimits: {
                        ...form.coverageLimits,
                        [key]: event.target.value,
                      },
                    })
                  }
                />
              </label>
            ))}
        </div>
        <div className="checkbox-grid">
          <label className="admin-check">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) =>
                setForm({ ...form, active: event.target.checked })
              }
            />
            เผยแพร่บนเว็บไซต์
          </label>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(event) =>
                setForm({ ...form, featured: event.target.checked })
              }
            />
            แผนแนะนำ
          </label>
        </div>
        <ErrorNotice error={error} />
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="admin-primary" disabled={busy}>
            <Save size={16} /> บันทึก
          </button>
        </div>
      </form>
    </Modal>
  );
}

function blankPolicy(): Policy {
  return {
    policyId: "",
    policyNumber: "",
    customerId: "",
    productId: "",
    purchaseDate: new Date().toISOString().slice(0, 10),
    effectiveDate: new Date().toISOString().slice(0, 10),
    expiryDate: new Date(Date.now() + 365 * 86400000)
      .toISOString()
      .slice(0, 10),
    premium: 0,
    sumInsured: 0,
    insurerName: "MFEC Demo Insurance",
    vehicle: {
      vehicleType: "CAR",
      brand: "",
      model: "",
      year: new Date().getFullYear(),
      licensePlate: "",
      province: "",
    },
    coverageSnapshot: blankCoverage(),
    renewalStatus: "NOT_STARTED",
    preferredChannel: "VOICE",
    digitalSent: false,
    voiceCalled: false,
    customerIntent: "UNKNOWN",
    callbackDateTime: null,
    genesys: {
      contactListId: "",
      contactId: "",
      syncStatus: "NOT_SYNCED",
      lastSyncAt: "",
      lastSyncError: null,
      lastPayloadHash: "",
      lastSyncedBy: "",
    },
    createdAt: "",
    updatedAt: "",
  };
}
function Policies({ renewal = false }: { renewal?: boolean }) {
  const id = window.location.pathname.split("/")[3];
  if (id && !renewal) return <PolicyDetail id={id} />;
  return <PolicyList renewal={renewal} />;
}
function PolicyList({ renewal }: { renewal: boolean }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [days, setDays] = useState(renewal ? "90" : "");
  const [channel, setChannel] = useState("");
  const [genesysStatus, setGenesysStatus] = useState("");
  const [excludeDnc, setExcludeDnc] = useState(renewal);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState("");
  const [progress, setProgress] = useState("");
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const { data, refresh } = useList<PolicyRow>(
    `${base}/${renewal ? "renewals" : "policies"}?search=${encodeURIComponent(search)}&renewalStatus=${status}&channel=${channel}&genesysStatus=${genesysStatus}&excludeDnc=${excludeDnc}&${days ? `daysTo=${days}&` : ""}page=${page}`,
  );
  async function remove(item: Policy) {
    if (!window.confirm(`ลบกรมธรรม์ ${item.policyNumber}?`)) return;
    try {
      await api(`${base}/policies/${item.policyId}`, { method: "DELETE" });
      refresh();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  async function bulkSync(ids = selected) {
    if (!window.confirm(`ซิงก์ ${ids.length} กรมธรรม์ไป Genesys?`)) return;
    setSyncing(true);
    setResult("");
    setError("");
    setFailedIds([]);
    setProgress(`กำลังซิงก์ 0 / ${ids.length}`);
    try {
      const output = await syncInBatches(ids, undefined, (processed, total) =>
        setProgress(`กำลังซิงก์ ${processed} / ${total}`),
      );
      const successful = output.filter((item) =>
        ["SYNCED", "ALREADY_SYNCED"].includes(item.status),
      ).length;
      const failed = output.filter(
        (item) => !["SYNCED", "ALREADY_SYNCED"].includes(item.status),
      );
      setResult(
        `ประมวลผล ${output.length} · สำเร็จ ${successful} · ผิดพลาด ${failed.length}`,
      );
      setFailedIds(failed.map((item) => item.policyId));
      setSelected([]);
      refresh();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSyncing(false);
      setProgress("");
    }
  }
  async function singleSync(item: PolicyRow) {
    if (!window.confirm(`ส่งกรมธรรม์ ${item.policyNumber} ไป Genesys?`)) return;
    setSyncing(true);
    setError("");
    try {
      const output = await api<{ message: string }>(
        `${base}/genesys/sync/policies/${item.policyId}`,
        { method: "POST" },
      );
      setResult(output.message);
      refresh();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSyncing(false);
    }
  }
  return (
    <>
      <PageHead
        eyebrow={renewal ? "งานต่ออายุ" : "ข้อมูลหลัก"}
        title={renewal ? "ติดตามการต่ออายุ" : "กรมธรรม์"}
        description={
          renewal
            ? "เฝ้าดูวันหมดอายุและสถานะการติดต่อลูกค้า"
            : "จัดการข้อมูลกรมธรรม์และรถที่เอาประกัน"
        }
        action={
          !renewal && (
            <button
              className="admin-primary"
              onClick={() => setEditing(blankPolicy())}
            >
              <Plus size={17} /> เพิ่มกรมธรรม์
            </button>
          )
        }
      />
      <ErrorNotice error={error} />
      {result && <div className="admin-success">{result}</div>}
      {progress && <div className="admin-progress">{progress}</div>}
      {failedIds.length > 0 && (
        <div className="admin-error">
          รายการที่ผิดพลาด: {failedIds.join(", ")}{" "}
          <button
            className="admin-secondary"
            disabled={syncing}
            onClick={() => bulkSync(failedIds)}
          >
            ลองอีกครั้ง
          </button>
        </div>
      )}
      <div className="admin-toolbar">
        <div className="admin-search">
          <Search size={17} />
          <input
            placeholder="เลขกรมธรรม์ ชื่อ เบอร์โทร หรือทะเบียน"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">ทุกสถานะ</option>
          {statuses.map((item) => (
            <option key={item} value={item}>
              {statusTH[item]}
            </option>
          ))}
        </select>
        <select
          value={days}
          onChange={(event) => {
            setDays(event.target.value);
            setPage(1);
          }}
        >
          <option value="">ทุกวันหมดอายุ</option>
          <option value="7">ใน 7 วัน</option>
          <option value="30">ใน 30 วัน</option>
          <option value="60">ใน 60 วัน</option>
          <option value="90">ใน 90 วัน</option>
        </select>
        {renewal && (
          <>
            <select
              aria-label="ช่องทาง"
              value={channel}
              onChange={(event) => {
                setChannel(event.target.value);
                setPage(1);
              }}
            >
              <option value="">ทุกช่องทาง</option>
              {channels.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              aria-label="สถานะ Genesys"
              value={genesysStatus}
              onChange={(event) => {
                setGenesysStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">ทุกสถานะ Genesys</option>
              {["NOT_SYNCED", "SYNCED", "OUTDATED", "FAILED"].map((value) => (
                <option key={value} value={value}>
                  {statusTH[value]}
                </option>
              ))}
            </select>
            <label className="admin-check">
              <input
                type="checkbox"
                checked={excludeDnc}
                onChange={(event) => {
                  setExcludeDnc(event.target.checked);
                  setPage(1);
                }}
              />{" "}
              ตัด DNC
            </label>
          </>
        )}
        {renewal && (
          <button
            className="admin-secondary"
            disabled={!selected.length || syncing}
            onClick={() => bulkSync()}
          >
            <CloudUpload size={16} /> ซิงก์ที่เลือก ({selected.length})
          </button>
        )}
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {renewal && (
                <th>
                  <input
                    type="checkbox"
                    aria-label="เลือกทั้งหมด"
                    checked={
                      data.items.length > 0 &&
                      data.items.every((item) =>
                        selected.includes(item.policyId),
                      )
                    }
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? data.items.map((item) => item.policyId)
                          : [],
                      )
                    }
                  />
                </th>
              )}
              <th>เลขกรมธรรม์</th>
              <th>ลูกค้า</th>
              <th>สินค้า / รถ</th>
              <th>หมดอายุ</th>
              <th>คงเหลือ</th>
              <th>สถานะ</th>
              {renewal && (
                <>
                  <th>ช่องทาง</th>
                  <th>DNC</th>
                </>
              )}
              <th>Genesys</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.policyId}>
                {renewal && (
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.includes(item.policyId)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, item.policyId]
                            : current.filter((id) => id !== item.policyId),
                        )
                      }
                    />
                  </td>
                )}
                <td>
                  <a
                    className="table-link"
                    href={`/backend/policies/${item.policyId}`}
                  >
                    {item.policyNumber}
                  </a>
                </td>
                <td>
                  {item.customer ? (
                    <a
                      href={`/backend/customers/${item.customerId}`}
                      className="table-link"
                    >
                      {item.customer.firstName} {item.customer.lastName}
                    </a>
                  ) : (
                    item.customerId
                  )}
                  <small>{item.customer?.phone}</small>
                </td>
                <td>
                  {item.product?.productName || item.productId}
                  <small>
                    {item.vehicle.brand} {item.vehicle.model} ·{" "}
                    {item.vehicle.licensePlate}
                  </small>
                </td>
                <td>{dateText(item.expiryDate)}</td>
                <td className={item.daysUntilExpiry <= 7 ? "urgent" : ""}>
                  {item.daysUntilExpiry < 0
                    ? `เลย ${-item.daysUntilExpiry} วัน`
                    : `${item.daysUntilExpiry} วัน`}
                </td>
                <td>
                  <Badge value={item.renewalStatus} />
                </td>
                {renewal && (
                  <>
                    <td>{item.preferredChannel}</td>
                    <td>
                      {item.customer?.dnc ? <Badge value="SKIPPED_DNC" /> : "—"}
                    </td>
                  </>
                )}
                <td>
                  <Badge value={item.genesys.syncStatus} />
                </td>
                <td className="row-actions">
                  <button onClick={() => setEditing(item)}>แก้ไข</button>
                  {renewal && (
                    <button
                      disabled={syncing || item.customer?.dnc}
                      onClick={() => singleSync(item)}
                    >
                      {item.genesys.syncStatus === "OUTDATED"
                        ? "อัปเดต Genesys"
                        : "Push"}
                    </button>
                  )}
                  {!renewal && (
                    <button
                      className="danger-link"
                      onClick={() => remove(item)}
                    >
                      ลบ
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.items.length && <Empty />}
        <Pager
          page={page}
          pageSize={20}
          total={data.total}
          onChange={setPage}
        />
      </div>
      {editing && (
        <PolicyForm
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}
function PolicyForm({
  item,
  onClose,
  onSaved,
}: {
  item: Policy;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(item);
  const [meta, setMeta] = useState<{
    customers: Customer[];
    products: Product[];
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ customers: Customer[]; products: Product[] }>(`${base}/meta`)
      .then(setMeta)
      .catch((reason) => setError(reason.message));
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`${base}/policies${item.policyId ? `/${item.policyId}` : ""}`, {
        method: item.policyId ? "PUT" : "POST",
        body: JSON.stringify(form),
      });
      onSaved();
      onClose();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const vehicle = (field: keyof Policy["vehicle"], value: string | number) =>
    setForm({ ...form, vehicle: { ...form.vehicle, [field]: value } });
  return (
    <Modal
      title={item.policyId ? `แก้ไข ${item.policyNumber}` : "เพิ่มกรมธรรม์"}
      onClose={onClose}
    >
      <form className="admin-form" onSubmit={save}>
        <div className="form-section-label">ข้อมูลกรมธรรม์</div>
        <div className="admin-form-grid">
          <label>
            ลูกค้า
            <select
              required
              value={form.customerId}
              onChange={(event) =>
                setForm({ ...form, customerId: event.target.value })
              }
            >
              <option value="">เลือกลูกค้า</option>
              {meta?.customers.map((value) => (
                <option key={value.customerId} value={value.customerId}>
                  {value.customerId} · {value.firstName} {value.lastName}
                </option>
              ))}
            </select>
          </label>
          <label>
            สินค้า
            <select
              required
              value={form.productId}
              onChange={(event) =>
                setForm({ ...form, productId: event.target.value })
              }
            >
              <option value="">เลือกสินค้า</option>
              {meta?.products.map((value) => (
                <option key={value.productId} value={value.productId}>
                  {value.productName}
                </option>
              ))}
            </select>
          </label>
          <label>
            วันที่ซื้อ
            <input
              required
              type="date"
              value={form.purchaseDate}
              onChange={(event) =>
                setForm({ ...form, purchaseDate: event.target.value })
              }
            />
          </label>
          <label>
            วันที่เริ่มคุ้มครอง
            <input
              required
              type="date"
              value={form.effectiveDate}
              onChange={(event) =>
                setForm({ ...form, effectiveDate: event.target.value })
              }
            />
          </label>
          <label>
            วันหมดอายุ
            <input
              required
              type="date"
              value={form.expiryDate}
              onChange={(event) =>
                setForm({ ...form, expiryDate: event.target.value })
              }
            />
          </label>
          <label>
            บริษัทประกัน
            <input
              required
              value={form.insurerName}
              onChange={(event) =>
                setForm({ ...form, insurerName: event.target.value })
              }
            />
          </label>
          <label>
            เบี้ยประกัน
            <input
              required
              type="number"
              min="0"
              value={form.premium}
              onChange={(event) =>
                setForm({ ...form, premium: Number(event.target.value) })
              }
            />
          </label>
          <label>
            ทุนประกัน
            <input
              required
              type="number"
              min="0"
              value={form.sumInsured}
              onChange={(event) =>
                setForm({ ...form, sumInsured: Number(event.target.value) })
              }
            />
          </label>
        </div>
        <div className="form-section-label">ข้อมูลรถ</div>
        <div className="admin-form-grid">
          <label>
            ประเภทรถ
            <select
              value={form.vehicle.vehicleType}
              onChange={(event) => vehicle("vehicleType", event.target.value)}
            >
              <option value="CAR">รถยนต์</option>
              <option value="MOTORCYCLE">รถจักรยานยนต์</option>
              <option value="ADDON">อื่น ๆ</option>
            </select>
          </label>
          <label>
            ยี่ห้อ
            <input
              required
              value={form.vehicle.brand}
              onChange={(event) => vehicle("brand", event.target.value)}
            />
          </label>
          <label>
            รุ่น
            <input
              required
              value={form.vehicle.model}
              onChange={(event) => vehicle("model", event.target.value)}
            />
          </label>
          <label>
            ปีรถ
            <input
              required
              type="number"
              min="1950"
              max="2100"
              value={form.vehicle.year}
              onChange={(event) => vehicle("year", Number(event.target.value))}
            />
          </label>
          <label>
            ทะเบียน
            <input
              required
              value={form.vehicle.licensePlate}
              onChange={(event) => vehicle("licensePlate", event.target.value)}
            />
          </label>
          <label>
            จังหวัด
            <input
              required
              value={form.vehicle.province}
              onChange={(event) => vehicle("province", event.target.value)}
            />
          </label>
        </div>
        <div className="form-section-label">การติดตามต่ออายุ</div>
        <div className="admin-form-grid">
          <label>
            สถานะ
            <select
              value={form.renewalStatus}
              onChange={(event) =>
                setForm({
                  ...form,
                  renewalStatus: event.target.value as Policy["renewalStatus"],
                })
              }
            >
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {statusTH[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            ช่องทางที่สะดวก
            <select
              value={form.preferredChannel}
              onChange={(event) =>
                setForm({
                  ...form,
                  preferredChannel: event.target
                    .value as Policy["preferredChannel"],
                })
              }
            >
              {channels.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            ความสนใจของลูกค้า
            <select
              value={form.customerIntent}
              onChange={(event) =>
                setForm({ ...form, customerIntent: event.target.value })
              }
            >
              {[
                "UNKNOWN",
                "INTERESTED",
                "NOT_INTERESTED",
                "CALLBACK",
                "RENEWED",
                "WRONG_NUMBER",
                "NO_ANSWER",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            วันเวลาให้โทรกลับ
            <input
              type="datetime-local"
              value={form.callbackDateTime?.slice(0, 16) || ""}
              onChange={(event) =>
                setForm({
                  ...form,
                  callbackDateTime: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : null,
                })
              }
            />
          </label>
        </div>
        <div className="checkbox-grid">
          <label className="admin-check">
            <input
              type="checkbox"
              checked={form.digitalSent}
              onChange={(event) =>
                setForm({ ...form, digitalSent: event.target.checked })
              }
            />{" "}
            ส่งข้อมูลดิจิทัลแล้ว
          </label>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={form.voiceCalled}
              onChange={(event) =>
                setForm({ ...form, voiceCalled: event.target.checked })
              }
            />{" "}
            โทรหาแล้ว
          </label>
        </div>
        <ErrorNotice error={error} />
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="admin-primary" disabled={busy}>
            <Save size={16} /> บันทึก
          </button>
        </div>
      </form>
    </Modal>
  );
}
function PolicyDetail({ id }: { id: string }) {
  const [policy, setPolicy] = useState<PolicyRow | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () =>
    api<PolicyRow>(`${base}/policies/${id}`)
      .then(setPolicy)
      .catch((reason) => setError(reason.message));
  useEffect(() => {
    void load();
  }, [id]);
  async function sync() {
    if (!policy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ message: string }>(
        `${base}/genesys/sync/policies/${id}`,
        { method: "POST" },
      );
      setMessage(result.message || "ซิงก์สำเร็จ");
      await load();
    } catch (reason) {
      setError((reason as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function viewPayload() {
    try {
      setPayload(
        await api<Record<string, unknown>>(
          `${base}/genesys/sync/policies/${id}/payload`,
        ),
      );
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  return (
    <>
      <a className="admin-back" href="/backend/policies">
        <ArrowLeft size={16} /> กลับรายการกรมธรรม์
      </a>
      <PageHead
        eyebrow="รายละเอียดกรมธรรม์"
        title={policy?.policyNumber || id}
        description={
          policy
            ? `${policy.customer?.firstName || ""} ${policy.customer?.lastName || ""} · ${policy.vehicle.licensePlate}`
            : ""
        }
        action={
          policy && (
            <>
              <button
                className="admin-secondary"
                onClick={() => setEditing(true)}
              >
                แก้ไข
              </button>
              <button className="admin-secondary" onClick={viewPayload}>
                ดู Genesys Payload
              </button>
              <button className="admin-primary" disabled={busy} onClick={sync}>
                <CloudUpload size={16} />
                {policy.genesys.syncStatus === "OUTDATED"
                  ? "อัปเดต Genesys"
                  : "Push to Genesys"}
              </button>
            </>
          )
        }
      />
      <ErrorNotice error={error} />
      {message && <div className="admin-success">{message}</div>}
      {payload && (
        <Modal title="Genesys Payload" onClose={() => setPayload(null)}>
          <pre className="payload-preview">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </Modal>
      )}
      {policy && (
        <div className="detail-admin-grid">
          <div className="admin-panel">
            <h2>ข้อมูลกรมธรรม์</h2>
            <div className="info-grid">
              {[
                [
                  "ลูกค้า",
                  policy.customer
                    ? `${policy.customer.firstName} ${policy.customer.lastName}`
                    : policy.customerId,
                ],
                ["สินค้า", policy.product?.productName || policy.productId],
                ["รถ", `${policy.vehicle.brand} ${policy.vehicle.model}`],
                ["ทะเบียน", policy.vehicle.licensePlate],
                ["วันที่เริ่ม", dateText(policy.effectiveDate)],
                ["วันหมดอายุ", dateText(policy.expiryDate)],
                ["เหลือเวลา", `${policy.daysUntilExpiry} วัน`],
                ["เบี้ยประกัน", money(policy.premium)],
                ["ทุนประกัน", money(policy.sumInsured)],
                ["ช่องทาง", policy.preferredChannel],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <b>{value}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="admin-panel">
            <h2>สถานะ</h2>
            <div className="status-stack">
              <div>
                การต่ออายุ <Badge value={policy.renewalStatus} />
              </div>
              <div>
                Genesys <Badge value={policy.genesys.syncStatus} />
              </div>
              <div>
                โทรแล้ว <b>{policy.voiceCalled ? "ใช่" : "ยัง"}</b>
              </div>
              <div>
                ส่งดิจิทัลแล้ว <b>{policy.digitalSent ? "ใช่" : "ยัง"}</b>
              </div>
              <div>
                ซิงก์ล่าสุด{" "}
                <b>
                  {policy.genesys.lastSyncAt
                    ? dateText(policy.genesys.lastSyncAt)
                    : "—"}
                </b>
              </div>
              {policy.genesys.lastSyncError && (
                <p className="admin-error">{policy.genesys.lastSyncError}</p>
              )}
            </div>
          </div>
        </div>
      )}
      {editing && policy && (
        <PolicyForm
          item={policy}
          onClose={() => setEditing(false)}
          onSaved={load}
        />
      )}
    </>
  );
}

type Preview = {
  rows: {
    contact: Record<string, string>;
    policy: Policy;
    customer: Customer;
    eligibility: string;
  }[];
  summary: Record<string, number>;
};
const blankFilters: CampaignFilters = { excludeDnc: true };
function Campaigns() {
  const [campaigns, setCampaigns] = useState<CampaignList[]>([]);
  const [meta, setMeta] = useState<{ products: Product[] } | null>(null);
  const [selected, setSelected] = useState<CampaignList | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [filters, setFilters] = useState<CampaignFilters>(blankFilters);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [failedResults, setFailedResults] = useState<SyncResult[]>([]);
  const load = () =>
    api<{ items: CampaignList[] }>(`${base}/campaigns`)
      .then((value) => setCampaigns(value.items))
      .catch((reason) => setError(reason.message));
  useEffect(() => {
    void load();
    api<{ products: Product[] }>(`${base}/meta`)
      .then(setMeta)
      .catch(() => undefined);
  }, []);
  function select(item: CampaignList | null) {
    setSelected(item);
    setName(item?.name || "");
    setDescription(item?.description || "");
    setFilters(item?.filters || blankFilters);
    setPreview(null);
    setSelectedIds([]);
    setError("");
    setMessage("");
  }
  function filter<K extends keyof CampaignFilters>(
    key: K,
    value: CampaignFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPreview(null);
  }
  async function showPreview() {
    setBusy(true);
    setError("");
    try {
      const result = await api<Preview>(`${base}/campaigns/preview`, {
        method: "POST",
        body: JSON.stringify({ filters }),
      });
      setPreview(result);
      setSelectedIds(
        result.rows
          .filter((row) => row.eligibility === "ELIGIBLE")
          .map((row) => row.policy.policyId),
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!name.trim()) {
      setError("กรุณาระบุชื่อแคมเปญ");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const item = await api<CampaignList>(
        `${base}/campaigns${selected ? `/${selected.campaignListId}` : ""}`,
        {
          method: selected ? "PUT" : "POST",
          body: JSON.stringify({ name, description, filters }),
        },
      );
      setSelected(item);
      setMessage("บันทึกแคมเปญแล้ว");
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!selected || !window.confirm(`ลบแคมเปญ ${selected.name}?`)) return;
    try {
      await api(`${base}/campaigns/${selected.campaignListId}`, {
        method: "DELETE",
      });
      select(null);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  async function exportCsv() {
    if (!selected) {
      setError("บันทึกแคมเปญก่อน export");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `${base}/campaigns/${selected.campaignListId}/export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedIds }),
        },
      );
      if (!response.ok)
        throw new Error((await response.json()).message || "Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] || "genesys-contacts.csv";
      link.click();
      URL.revokeObjectURL(url);
      setMessage("ดาวน์โหลด CSV แล้ว");
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function sync(ids = selectedIds) {
    if (!ids.length || !window.confirm(`ซิงก์ ${ids.length} รายการไป Genesys?`))
      return;
    setBusy(true);
    setProgress(`กำลังซิงก์ 0 / ${ids.length}`);
    setError("");
    setFailedResults([]);
    try {
      const result = await syncInBatches(
        ids,
        selected?.campaignListId,
        (processed, total) => setProgress(`กำลังซิงก์ ${processed} / ${total}`),
      );
      const successful = result.filter((item) =>
        ["SYNCED", "ALREADY_SYNCED"].includes(item.status),
      ).length;
      const failed = result.filter(
        (item) => !["SYNCED", "ALREADY_SYNCED"].includes(item.status),
      );
      setFailedResults(failed);
      setMessage(
        `ประมวลผล ${result.length} · สำเร็จ ${successful} · ผิดพลาด ${failed.length}`,
      );
      await showPreview();
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  return (
    <>
      <PageHead
        eyebrow="Renewal & Campaign"
        title="แคมเปญลูกค้า"
        description="แบ่งกลุ่มลูกค้า ตรวจความพร้อม และส่งรายชื่อไป Genesys"
        action={
          <button className="admin-primary" onClick={() => select(null)}>
            <Plus size={17} /> สร้างแคมเปญ
          </button>
        }
      />
      <ErrorNotice error={error} />
      {message && <div className="admin-success">{message}</div>}
      {progress && <div className="admin-progress">{progress}</div>}
      {failedResults.length > 0 && (
        <div className="admin-error">
          <b>รายการที่ผิดพลาด</b>
          {failedResults.map((item) => (
            <div key={item.policyId}>
              {item.policyId}: {item.message}
            </div>
          ))}
          <button
            className="admin-secondary"
            disabled={busy}
            onClick={() => sync(failedResults.map((item) => item.policyId))}
          >
            ลองอีกครั้ง
          </button>
        </div>
      )}
      <div className="campaign-layout">
        <aside className="campaign-list">
          <h2>รายการแคมเปญ</h2>
          {campaigns.map((item) => (
            <button
              key={item.campaignListId}
              className={
                selected?.campaignListId === item.campaignListId ? "active" : ""
              }
              onClick={() => select(item)}
            >
              <b>{item.name}</b>
              <small>
                {item.recordCount} รายการ · {dateText(item.updatedAt)}
              </small>
            </button>
          ))}
          {!campaigns.length && <Empty />}
        </aside>
        <div className="campaign-editor">
          <div className="admin-panel">
            <div className="panel-head">
              <h2>{selected ? "แก้ไขแคมเปญ" : "แคมเปญใหม่"}</h2>
              {selected && (
                <button className="danger-link" onClick={remove}>
                  <Trash2 size={15} /> ลบ
                </button>
              )}
            </div>
            <div className="admin-form-grid">
              <label className="wide">
                ชื่อแคมเปญ
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="เช่น กรมธรรม์หมดอายุใน 30 วัน"
                />
              </label>
              <label className="wide">
                รายละเอียด
                <textarea
                  rows={2}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
            </div>
            <div className="form-section-label">ตัวกรอง</div>
            <div className="admin-form-grid">
              <label>
                สินค้า
                <select
                  value={filters.productId || ""}
                  onChange={(event) =>
                    filter("productId", event.target.value || undefined)
                  }
                >
                  <option value="">สินค้าทั้งหมด</option>
                  {meta?.products.map((item) => (
                    <option key={item.productId} value={item.productId}>
                      {item.productName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                ประเภทรถ
                <select
                  value={filters.vehicleType || ""}
                  onChange={(event) =>
                    filter("vehicleType", event.target.value || undefined)
                  }
                >
                  <option value="">ทั้งหมด</option>
                  <option value="CAR">รถยนต์</option>
                  <option value="MOTORCYCLE">รถจักรยานยนต์</option>
                </select>
              </label>
              <label>
                ชั้นประกัน
                <select
                  value={filters.insuranceClass || ""}
                  onChange={(event) =>
                    filter("insuranceClass", event.target.value || undefined)
                  }
                >
                  <option value="">ทุกชั้น</option>
                  {[
                    ...new Set(
                      meta?.products.map((item) => item.insuranceClass) || [],
                    ),
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                ยี่ห้อรถ
                <input
                  value={filters.vehicleBrand || ""}
                  onChange={(event) =>
                    filter("vehicleBrand", event.target.value || undefined)
                  }
                />
              </label>
              <label>
                บริษัทประกัน
                <input
                  value={filters.insurerName || ""}
                  onChange={(event) =>
                    filter("insurerName", event.target.value || undefined)
                  }
                />
              </label>
              <label>
                สถานะต่ออายุ
                <select
                  value={filters.renewalStatus || ""}
                  onChange={(event) =>
                    filter("renewalStatus", event.target.value || undefined)
                  }
                >
                  <option value="">ทุกสถานะ</option>
                  {statuses.map((item) => (
                    <option key={item} value={item}>
                      {statusTH[item]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                ช่องทาง
                <select
                  value={filters.preferredChannel || ""}
                  onChange={(event) =>
                    filter("preferredChannel", event.target.value || undefined)
                  }
                >
                  <option value="">ทุกช่องทาง</option>
                  {channels.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                วันหมดอายุตั้งแต่
                <input
                  type="date"
                  value={filters.expiryFrom || ""}
                  onChange={(event) =>
                    filter("expiryFrom", event.target.value || undefined)
                  }
                />
              </label>
              <label>
                ถึงวันที่
                <input
                  type="date"
                  value={filters.expiryTo || ""}
                  onChange={(event) =>
                    filter("expiryTo", event.target.value || undefined)
                  }
                />
              </label>
              <label>
                จำนวนวันจาก
                <input
                  type="number"
                  value={filters.daysFrom ?? ""}
                  onChange={(event) =>
                    filter(
                      "daysFrom",
                      event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    )
                  }
                />
              </label>
              <label>
                ถึง
                <input
                  type="number"
                  value={filters.daysTo ?? ""}
                  onChange={(event) =>
                    filter(
                      "daysTo",
                      event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    )
                  }
                />
              </label>
              <label>
                เบี้ยขั้นต่ำ
                <input
                  type="number"
                  value={filters.premiumFrom ?? ""}
                  onChange={(event) =>
                    filter(
                      "premiumFrom",
                      event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    )
                  }
                />
              </label>
              <label>
                เบี้ยสูงสุด
                <input
                  type="number"
                  value={filters.premiumTo ?? ""}
                  onChange={(event) =>
                    filter(
                      "premiumTo",
                      event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    )
                  }
                />
              </label>
              <label>
                จังหวัด
                <input
                  value={filters.province || ""}
                  onChange={(event) =>
                    filter("province", event.target.value || undefined)
                  }
                />
              </label>
              <label>
                สถานะ Genesys
                <select
                  value={filters.genesysStatus || ""}
                  onChange={(event) =>
                    filter("genesysStatus", event.target.value || undefined)
                  }
                >
                  <option value="">ทุกสถานะ</option>
                  {["NOT_SYNCED", "SYNCED", "OUTDATED", "FAILED"].map(
                    (item) => (
                      <option key={item}>{item}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                ส่งดิจิทัลแล้ว
                <select
                  value={
                    filters.digitalSent === undefined
                      ? ""
                      : String(filters.digitalSent)
                  }
                  onChange={(event) =>
                    filter(
                      "digitalSent",
                      event.target.value === ""
                        ? undefined
                        : event.target.value === "true",
                    )
                  }
                >
                  <option value="">ทั้งหมด</option>
                  <option value="true">ใช่</option>
                  <option value="false">ยัง</option>
                </select>
              </label>
              <label>
                โทรแล้ว
                <select
                  value={
                    filters.voiceCalled === undefined
                      ? ""
                      : String(filters.voiceCalled)
                  }
                  onChange={(event) =>
                    filter(
                      "voiceCalled",
                      event.target.value === ""
                        ? undefined
                        : event.target.value === "true",
                    )
                  }
                >
                  <option value="">ทั้งหมด</option>
                  <option value="true">ใช่</option>
                  <option value="false">ยัง</option>
                </select>
              </label>
              <label>
                ความสนใจลูกค้า
                <select
                  value={filters.customerIntent || ""}
                  onChange={(event) =>
                    filter("customerIntent", event.target.value || undefined)
                  }
                >
                  <option value="">ทั้งหมด</option>
                  {[
                    "UNKNOWN",
                    "INTERESTED",
                    "NOT_INTERESTED",
                    "CALLBACK",
                    "RENEWED",
                    "WRONG_NUMBER",
                    "NO_ANSWER",
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="admin-check">
              <input
                type="checkbox"
                checked={filters.excludeDnc !== false}
                onChange={(event) => filter("excludeDnc", event.target.checked)}
              />{" "}
              ตัดลูกค้า DNC ออก
            </label>
            <div className="form-actions">
              <button
                className="admin-secondary"
                disabled={busy}
                onClick={showPreview}
              >
                <Search size={16} /> ดูตัวอย่าง
              </button>
              <button className="admin-primary" disabled={busy} onClick={save}>
                <Save size={16} /> บันทึกแคมเปญ
              </button>
            </div>
          </div>
          {preview && (
            <div className="admin-panel campaign-preview">
              <div className="panel-head">
                <h2>ตัวอย่างรายชื่อ</h2>
                <span>เลือก {selectedIds.length} รายการ</span>
              </div>
              <div className="preview-stats">
                {[
                  ["ตรงเงื่อนไข", preview.summary.matched],
                  ["ส่งได้", preview.summary.eligible],
                  ["DNC", preview.summary.dncExcluded],
                  ["เบอร์ไม่ถูกต้อง", preview.summary.invalidPhone],
                  ["เบอร์ซ้ำ", preview.summary.duplicatePhone],
                  ["ซิงก์แล้ว", preview.summary.alreadySynced],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <b>{value}</b>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>เลือก</th>
                      <th>ลูกค้า</th>
                      <th>เลขกรมธรรม์</th>
                      <th>โทรศัพท์</th>
                      <th>วันหมดอายุ</th>
                      <th>ผลตรวจ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.policy.policyId}>
                        <td>
                          <input
                            type="checkbox"
                            disabled={row.eligibility !== "ELIGIBLE"}
                            checked={selectedIds.includes(row.policy.policyId)}
                            onChange={(event) =>
                              setSelectedIds((current) =>
                                event.target.checked
                                  ? [...current, row.policy.policyId]
                                  : current.filter(
                                      (id) => id !== row.policy.policyId,
                                    ),
                              )
                            }
                          />
                        </td>
                        <td>
                          {row.customer.firstName} {row.customer.lastName}
                        </td>
                        <td>{row.policy.policyNumber}</td>
                        <td>{row.contact.phone}</td>
                        <td>{dateText(row.policy.expiryDate)}</td>
                        <td>
                          <Badge value={row.eligibility} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-actions">
                <button
                  className="admin-secondary"
                  disabled={!selectedIds.length || busy || !selected}
                  onClick={exportCsv}
                >
                  <ArrowDownToLine size={16} /> Export CSV
                </button>
                <button
                  className="admin-primary"
                  disabled={!selectedIds.length || busy}
                  onClick={() => sync()}
                >
                  <CloudUpload size={16} /> Sync to Genesys
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Inquiries() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const { data, refresh } = useList<Inquiry>(
    `${base}/inquiries?search=${encodeURIComponent(search)}&status=${status}&page=${page}`,
  );
  async function change(item: Inquiry, value: string) {
    try {
      await api(`${base}/inquiries/${item.inquiryId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: value }),
      });
      refresh();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  return (
    <>
      <PageHead
        eyebrow="ลีดจากเว็บไซต์"
        title="คำขอติดต่อกลับ"
        description="ติดตามผู้สนใจจากเว็บไซต์"
      />
      <ErrorNotice error={error} />
      <div className="admin-toolbar">
        <div className="admin-search">
          <Search size={17} />
          <input
            placeholder="ค้นหาชื่อหรือเบอร์โทร"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">ทุกสถานะ</option>
          {["NEW", "CONTACTED", "CONVERTED", "CLOSED"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>รหัส</th>
              <th>ผู้สนใจ</th>
              <th>เบอร์โทร</th>
              <th>สินค้า</th>
              <th>ช่องทาง / เวลา</th>
              <th>วันที่ส่ง</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.inquiryId}>
                <td>{item.inquiryId}</td>
                <td>
                  <b>
                    {item.firstName} {item.lastName}
                  </b>
                </td>
                <td>{item.phone}</td>
                <td>{item.productId}</td>
                <td>
                  {item.preferredChannel}
                  <small>{item.preferredContactTime}</small>
                </td>
                <td>{dateText(item.createdAt)}</td>
                <td>
                  <select
                    aria-label={`สถานะ ${item.inquiryId}`}
                    value={item.status}
                    onChange={(event) => change(item, event.target.value)}
                  >
                    {["NEW", "CONTACTED", "CONVERTED", "CLOSED"].map(
                      (value) => (
                        <option key={value}>{value}</option>
                      ),
                    )}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.items.length && <Empty />}
        <Pager
          page={page}
          pageSize={20}
          total={data.total}
          onChange={setPage}
        />
      </div>
    </>
  );
}

function Audit() {
  const [records, setRecords] = useState<{
    business: {
      id: string;
      action: string;
      actor: string;
      target: string;
      timestamp: string;
    }[];
    genesys: unknown[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<typeof records>(`${base}/audit`)
      .then(setRecords)
      .catch((reason) => setError(reason.message));
  }, []);
  return (
    <>
      <PageHead
        eyebrow="ระบบ"
        title="บันทึกกิจกรรม"
        description="ประวัติการแก้ไขข้อมูลและการตั้งค่า"
      />
      <ErrorNotice error={error} />
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>วันเวลา</th>
              <th>กิจกรรม</th>
              <th>ผู้ดำเนินการ</th>
              <th>รายการ</th>
            </tr>
          </thead>
          <tbody>
            {records?.business.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.timestamp).toLocaleString("th-TH")}</td>
                <td>{item.action}</td>
                <td>{item.actor}</td>
                <td>{item.target || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!records?.business.length && <Empty />}
      </div>
    </>
  );
}
function SystemSettings() {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [backup, setBackup] = useState<{
    directory: string;
    files: string[];
    downloadUrl: string;
  } | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  async function makeBackup() {
    setBusy(true);
    setError("");
    try {
      const result = await api<typeof backup>(`${base}/settings/backup`, {
        method: "POST",
      });
      setBackup(result);
      setMessage("สร้างข้อมูลสำรองแล้ว");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    if (
      confirm !== "RESET" ||
      !window.confirm("ยืนยันรีเซ็ตข้อมูลสาธิต? ระบบจะสำรองข้อมูลก่อน")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`${base}/settings/reset-demo`, {
        method: "POST",
        body: JSON.stringify({ confirmation: "RESET" }),
      });
      setMessage("รีเซ็ตข้อมูลสาธิตแล้ว");
      setConfirm("");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        eyebrow="ระบบ"
        title="ตั้งค่าระบบ"
        description="สำรองข้อมูลและจัดการชุดข้อมูลสาธิต"
      />
      <ErrorNotice error={error} />
      {message && <div className="admin-success">{message}</div>}
      <div className="settings-grid">
        <section className="admin-panel">
          <DatabaseBackup size={28} />
          <h2>สำรองข้อมูล</h2>
          <p>
            สร้างสำเนาไฟล์ JSON ปัจจุบัน รวมข้อมูลลูกค้า กรมธรรม์ แคมเปญ
            และการตั้งค่า
          </p>
          <button
            className="admin-primary"
            disabled={busy}
            onClick={makeBackup}
          >
            <DatabaseBackup size={16} /> สร้าง Backup
          </button>
          {backup && (
            <div className="backup-result">
              <b>{backup.directory}</b>
              <small>{backup.files.length} ไฟล์</small>
              <a href={backup.downloadUrl}>
                <ArrowDownToLine size={16} /> ดาวน์โหลด JSON
              </a>
            </div>
          )}
        </section>
        <section className="admin-panel">
          <RefreshCw size={28} />
          <h2>รีเซ็ตข้อมูลสาธิต</h2>
          <p>
            ระบบจะสำรองข้อมูลเดิมก่อน แล้วแทนที่ข้อมูลธุรกิจด้วยตัวอย่างเริ่มต้น
            การตั้งค่า Genesys จะคงอยู่
          </p>
          <label>
            พิมพ์ RESET เพื่อยืนยัน
            <input
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </label>
          <button
            className="admin-danger"
            disabled={confirm !== "RESET" || busy}
            onClick={reset}
          >
            <Trash2 size={16} /> รีเซ็ตข้อมูล
          </button>
        </section>
      </div>
    </>
  );
}
