import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  Globe2,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  ConfigResponse,
  EndpointResult,
  GenesysConfig,
  GenesysRegion,
  RegionHistoryRecord,
  RegionResponse,
} from "./lib/api";
import { api } from "./lib/api";

type Tab = "integration" | "regions";
type EditorMode = "edit" | "create";
type ContactList = { id: string; name: string; columnNames?: string[] };
type SchemaResult = {
  valid: boolean;
  message: string;
  mapping: {
    applicationField: string;
    genesysColumn: string;
    status: string;
  }[];
  unexpectedColumns: string[];
  phoneColumnValid: boolean;
};

type RegionEditor = {
  mode: EditorMode;
  region: GenesysRegion;
  history: RegionHistoryRecord[];
  testResults?: Record<string, EndpointResult>;
};

const emptyCustomRegion: GenesysRegion = {
  id: "",
  name: "",
  domain: "",
  applicationUrl: "",
  apiBaseUrl: "",
  authBaseUrl: "",
  defaultApplicationUrl: "",
  defaultApiBaseUrl: "",
  defaultAuthBaseUrl: "",
  systemRegion: false,
  enabled: true,
  modified: false,
  createdAt: "",
  updatedAt: "",
  updatedBy: "",
};

export function App() {
  const [tab, setTab] = useState<Tab>("integration");
  const [configResponse, setConfigResponse] = useState<ConfigResponse | null>(
    null,
  );
  const [regions, setRegions] = useState<GenesysRegion[]>([]);
  const [editor, setEditor] = useState<RegionEditor | null>(null);
  const [configDraft, setConfigDraft] = useState<
    Partial<GenesysConfig> & { clientSecret?: string }
  >({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [schemaResult, setSchemaResult] = useState<SchemaResult | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [configData, regionData] = await Promise.all([
        api<ConfigResponse>("/api/admin/genesys/config"),
        api<{ regions: GenesysRegion[] }>("/api/admin/genesys/regions"),
      ]);
      setConfigResponse(configData);
      setConfigDraft(configData.config);
      setRegions(regionData.regions);
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load Genesys settings",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const activeRegionPreview = useMemo(() => {
    const draftRegionId =
      configDraft.regionId ?? configResponse?.config.regionId;
    return (
      regions.find((region) => region.id === draftRegionId) ??
      configResponse?.activeRegion
    );
  }, [
    configDraft.regionId,
    configResponse?.activeRegion,
    configResponse?.config.regionId,
    regions,
  ]);

  async function saveConfig(event: FormEvent) {
    event.preventDefault();
    await run("save-config", async () => {
      const body = JSON.stringify(configDraft);
      const result = await api<ConfigResponse>("/api/admin/genesys/config", {
        method: "PUT",
        body,
      });
      setConfigResponse(result);
      setConfigDraft(result.config);
      setToast("Genesys configuration saved.");
    });
  }

  async function openEditor(regionId: string) {
    await run(`edit-${regionId}`, async () => {
      const result = await api<RegionResponse>(
        `/api/admin/genesys/regions/${regionId}`,
      );
      setEditor({
        mode: "edit",
        region: result.region,
        history: result.history,
      });
    });
  }

  async function saveRegion(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    await run("save-region", async () => {
      const method = editor.mode === "create" ? "POST" : "PUT";
      const path =
        editor.mode === "create"
          ? "/api/admin/genesys/regions"
          : `/api/admin/genesys/regions/${editor.region.id}`;
      const result = await api<{ region: GenesysRegion }>(path, {
        method,
        body: JSON.stringify(editor.region),
      });
      setToast("Region saved.");
      setEditor(null);
      await loadAll();
      if (configResponse?.config.regionId === result.region.id) {
        setConfigDraft((draft) => ({ ...draft, regionId: result.region.id }));
      }
    });
  }

  async function testRegionUrls() {
    if (!editor) return;
    await run("test-region", async () => {
      const result = await api<{ results: Record<string, EndpointResult> }>(
        `/api/admin/genesys/regions/${editor.region.id}/test`,
        { method: "POST", body: JSON.stringify(editor.region) },
      );
      setEditor({ ...editor, testResults: result.results });
    });
  }

  async function resetRegion() {
    if (!editor) return;
    if (
      !window.confirm(
        `Reset ${editor.region.name} Genesys endpoints to system defaults?`,
      )
    )
      return;
    await run("reset-region", async () => {
      const result = await api<{ region: GenesysRegion }>(
        `/api/admin/genesys/regions/${editor.region.id}/reset`,
        { method: "POST" },
      );
      const detail = await api<RegionResponse>(
        `/api/admin/genesys/regions/${result.region.id}`,
      );
      setEditor({
        mode: "edit",
        region: detail.region,
        history: detail.history,
      });
      setToast("Region reset to system defaults.");
      await loadAll();
    });
  }

  async function deleteRegion(region: GenesysRegion) {
    if (!window.confirm(`Delete custom region ${region.name}?`)) return;
    await run(`delete-${region.id}`, async () => {
      await api<null>(`/api/admin/genesys/regions/${region.id}`, {
        method: "DELETE",
      });
      setToast("Region deleted.");
      await loadAll();
    });
  }

  async function testConnection() {
    await run("test-connection", async () => {
      const draft =
        configDraft.regionId !== configResponse?.config.regionId ||
        configDraft.clientId !== configResponse?.config.clientId ||
        Boolean(configDraft.clientSecret)
          ? {
              regionId: configDraft.regionId,
              clientId: configDraft.clientId,
              clientSecret: configDraft.clientSecret,
            }
          : {};
      const result = await api<{
        ok: boolean;
        config: GenesysConfig;
        message?: string;
      }>("/api/admin/genesys/test-connection", {
        method: "POST",
        body: JSON.stringify(draft),
      });
      if (!result.ok) throw new Error(result.message || "Connection failed");
      if (!Object.values(draft).some(Boolean)) await loadAll();
      setToast(result.message || "Genesys connection verified.");
    });
  }

  async function validateSchema() {
    await run("validate-schema", async () => {
      const result = await api<{
        ok: boolean;
        schema: SchemaResult;
        message: string;
      }>("/api/admin/genesys/validate-schema", { method: "POST" });
      setSchemaResult(result.schema);
      await loadAll();
      if (!result.ok) throw new Error(result.message);
      setToast("Schema validated.");
    });
  }

  async function loadContactLists() {
    await run("load-contact-lists", async () => {
      const result = await api<{ entities?: ContactList[]; total?: number }>(
        "/api/admin/genesys/load-contact-lists",
        {
          method: "POST",
        },
      );
      setContactLists(result.entities || []);
      const count = result.total ?? result.entities?.length ?? 0;
      setToast(
        `${count} contact list${count === 1 ? "" : "s"} loaded from Genesys.`,
      );
    });
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Action failed");
    } finally {
      setBusy("");
    }
  }

  if (!loading && !configResponse) {
    return (
      <main className="center-screen">
        <div className="alert error">
          {error || "Unable to load Genesys settings"}
          <button onClick={loadAll}>Retry</button>
        </div>
      </main>
    );
  }
  if (loading || !configResponse) {
    return (
      <main className="center-screen">
        <Loader2 className="spin" />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span>MFEC Insurrance</span>
          <strong>Genesys Cloud</strong>
        </div>
        <nav>
          <button
            className={tab === "integration" ? "active" : ""}
            onClick={() => setTab("integration")}
          >
            <ShieldCheck size={18} />
            Integration
          </button>
          <button
            className={tab === "regions" ? "active" : ""}
            onClick={() => setTab("regions")}
          >
            <Globe2 size={18} />
            Regions
          </button>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Admin / Settings</span>
            <h1>Genesys Cloud Settings</h1>
          </div>
          <StatusPill status={configResponse.config.lastConnectionStatus} />
        </header>

        {error && (
          <div className="alert error">
            <X size={16} />
            {error}
          </div>
        )}
        {toast && (
          <div className="alert success" onAnimationEnd={() => setToast("")}>
            <CheckCircle2 size={16} />
            {toast}
          </div>
        )}

        {tab === "integration" ? (
          <form className="content-grid" onSubmit={saveConfig}>
            <section className="summary-band">
              <SummaryItem
                label="Status"
                value={configResponse.config.lastConnectionStatus.replace(
                  "_",
                  " ",
                )}
              />
              <SummaryItem
                label="Region"
                value={activeRegionPreview?.name || "-"}
              />
              <SummaryItem
                label="Region Code"
                value={activeRegionPreview?.id || "-"}
              />
              <SummaryItem
                label="Schema"
                value={configResponse.config.schemaStatus.replace("_", " ")}
              />
              <SummaryItem
                label="Last Sync"
                value={formatDate(configResponse.config.lastSyncAt)}
              />
            </section>

            <section className="settings-panel">
              <SectionTitle title="Integration" />
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={configDraft.enabled ?? false}
                  onChange={(event) =>
                    setConfigDraft({
                      ...configDraft,
                      enabled: event.target.checked,
                    })
                  }
                />
                <span>Enabled</span>
              </label>
            </section>

            <section className="settings-panel">
              <SectionTitle title="Region" />
              <div className="field-grid">
                <label>
                  <span>Genesys Region</span>
                  <select
                    value={configDraft.regionId}
                    onChange={(event) =>
                      setConfigDraft({
                        ...configDraft,
                        regionId: event.target.value,
                      })
                    }
                  >
                    {configResponse.enabledRegions.map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.name}
                      </option>
                    ))}
                  </select>
                </label>
                <ReadOnly label="Region Code" value={activeRegionPreview?.id} />
                <ReadOnly
                  label="Application"
                  value={activeRegionPreview?.applicationUrl}
                />
                <ReadOnly label="API" value={activeRegionPreview?.apiBaseUrl} />
                <ReadOnly
                  label="OAuth"
                  value={activeRegionPreview?.authBaseUrl}
                />
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    activeRegionPreview && openEditor(activeRegionPreview.id)
                  }
                >
                  <Pencil size={16} />
                  Edit Region URLs
                </button>
                {activeRegionPreview && (
                  <a
                    className="secondary link-button"
                    href={activeRegionPreview.applicationUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={16} />
                    Open Genesys Cloud
                  </a>
                )}
              </div>
            </section>

            <section className="settings-panel">
              <SectionTitle title="OAuth" />
              <div className="field-grid">
                <label>
                  <span>Client ID</span>
                  <input
                    value={configDraft.clientId ?? ""}
                    onChange={(event) =>
                      setConfigDraft({
                        ...configDraft,
                        clientId: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  <span>Client Secret</span>
                  <input
                    type="password"
                    placeholder={
                      configResponse.config.secretConfigured
                        ? "Secret configured"
                        : ""
                    }
                    value={configDraft.clientSecret ?? ""}
                    onChange={(event) =>
                      setConfigDraft({
                        ...configDraft,
                        clientSecret: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            </section>

            <section className="settings-panel">
              <SectionTitle title="Outbound" />
              <div className="field-grid">
                <label>
                  <span>Contact List Name</span>
                  <select
                    value={configDraft.contactListId ?? ""}
                    onChange={(event) => {
                      const item = contactLists.find(
                        (list) => list.id === event.target.value,
                      );
                      setConfigDraft({
                        ...configDraft,
                        contactListId: item?.id || "",
                        contactListName: item?.name || "",
                      });
                      setSchemaResult(null);
                    }}
                  >
                    <option value="">Select contact list</option>
                    {configDraft.contactListId &&
                      !contactLists.some(
                        (list) => list.id === configDraft.contactListId,
                      ) && (
                        <option value={configDraft.contactListId}>
                          {configDraft.contactListName ||
                            configDraft.contactListId}{" "}
                          (saved)
                        </option>
                      )}
                    {contactLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Contact List ID</span>
                  <input
                    value={configDraft.contactListId ?? ""}
                    onChange={(event) =>
                      setConfigDraft({
                        ...configDraft,
                        contactListId: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  <span>Phone Column</span>
                  <input
                    value={configDraft.phoneColumn ?? ""}
                    onChange={(event) =>
                      setConfigDraft({
                        ...configDraft,
                        phoneColumn: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            </section>

            <section className="settings-panel">
              <SectionTitle title="Connection" />
              <div className="status-grid">
                <StatusRow
                  label="OAuth"
                  done={
                    configResponse.config.lastConnectionStatus === "SUCCESS"
                  }
                />
                <StatusRow
                  label="Platform API"
                  done={
                    configResponse.config.lastConnectionStatus === "SUCCESS"
                  }
                />
                <StatusRow
                  label="Contact List"
                  done={Boolean(configResponse.config.contactListId)}
                />
                <StatusRow
                  label="Schema"
                  done={configResponse.config.schemaStatus === "VALID"}
                />
              </div>
              {schemaResult && (
                <div className="schema-report">
                  <h3>Contact List Schema</h3>
                  <p>{schemaResult.message}</p>
                  <div className="schema-table">
                    <div>
                      <b>Application field</b>
                      <b>Genesys column</b>
                      <b>Status</b>
                    </div>
                    {schemaResult.mapping.map((row) => (
                      <div key={row.applicationField}>
                        <span>{row.applicationField}</span>
                        <span>{row.genesysColumn || "—"}</span>
                        <strong
                          className={
                            row.status === "OK" ? "schema-ok" : "schema-bad"
                          }
                        >
                          {row.status}
                        </strong>
                      </div>
                    ))}
                  </div>
                  {schemaResult.unexpectedColumns.length > 0 && (
                    <p>
                      Extra Genesys columns:{" "}
                      {schemaResult.unexpectedColumns.join(", ")}
                    </p>
                  )}
                </div>
              )}
              <p className="muted">
                Last tested:{" "}
                {formatDate(configResponse.config.lastConnectionAt)}
              </p>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary"
                  onClick={testConnection}
                  disabled={Boolean(busy)}
                >
                  <RefreshCcw size={16} />
                  Test Connection
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={loadContactLists}
                  disabled={Boolean(busy)}
                >
                  <RefreshCcw size={16} />
                  Load Contact Lists
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={validateSchema}
                  disabled={Boolean(busy)}
                >
                  <CheckCircle2 size={16} />
                  Validate Schema
                </button>
                <button className="primary" disabled={Boolean(busy)}>
                  <Save size={16} />
                  Save Configuration
                </button>
              </div>
            </section>
          </form>
        ) : (
          <section className="regions-view">
            <div className="table-actions">
              <h2>Genesys Cloud Regions</h2>
              <button
                className="primary"
                onClick={() =>
                  setEditor({
                    mode: "create",
                    region: emptyCustomRegion,
                    history: [],
                  })
                }
              >
                <Plus size={16} />
                Add Custom Region
              </button>
            </div>
            <div className="region-table">
              {regions.map((region) => (
                <article key={region.id} className="region-row">
                  <div>
                    <strong>{region.name}</strong>
                    <span>{region.domain}</span>
                  </div>
                  <code>{region.id}</code>
                  <StatusBadge enabled={region.enabled} />
                  <span
                    className={region.modified ? "badge modified" : "badge"}
                  >
                    {region.modified ? "Modified" : "Default"}
                  </span>
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      title="Edit"
                      onClick={() => openEditor(region.id)}
                    >
                      <Pencil size={17} />
                    </button>
                    {!region.systemRegion && (
                      <button
                        className="icon-button danger"
                        title="Delete"
                        onClick={() => deleteRegion(region)}
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </section>

      {editor && (
        <RegionModal
          editor={editor}
          setEditor={setEditor}
          onSave={saveRegion}
          onTest={testRegionUrls}
          onReset={resetRegion}
          busy={busy}
        />
      )}
    </main>
  );
}

function RegionModal({
  editor,
  setEditor,
  onSave,
  onTest,
  onReset,
  busy,
}: {
  editor: RegionEditor;
  setEditor: (editor: RegionEditor | null) => void;
  onSave: (event: FormEvent) => void;
  onTest: () => void;
  onReset: () => void;
  busy: string;
}) {
  const region = editor.region;
  const setRegion = (next: Partial<GenesysRegion>) =>
    setEditor({ ...editor, region: { ...region, ...next } });

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={onSave}>
        <header>
          <div>
            <span className="eyebrow">
              {editor.mode === "create" ? "Custom Region" : region.id}
            </span>
            <h2>
              {editor.mode === "create"
                ? "Add Genesys Region"
                : "Edit Genesys Region"}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={() => setEditor(null)}
          >
            <X size={18} />
          </button>
        </header>

        <div className="field-grid">
          <label>
            <span>Region Name</span>
            <input
              value={region.name}
              onChange={(event) => setRegion({ name: event.target.value })}
            />
          </label>
          <label>
            <span>Region Code</span>
            <input
              value={region.id}
              disabled={editor.mode === "edit" && region.systemRegion}
              onChange={(event) => setRegion({ id: event.target.value })}
            />
          </label>
          <label>
            <span>Application URL</span>
            <input
              value={region.applicationUrl}
              onChange={(event) =>
                setRegion({ applicationUrl: event.target.value })
              }
            />
          </label>
          <label>
            <span>API Base URL</span>
            <input
              value={region.apiBaseUrl}
              onChange={(event) =>
                setRegion({ apiBaseUrl: event.target.value })
              }
            />
          </label>
          <label>
            <span>OAuth / Login URL</span>
            <input
              value={region.authBaseUrl}
              onChange={(event) =>
                setRegion({ authBaseUrl: event.target.value })
              }
            />
          </label>
          <label className="toggle-row inline">
            <input
              type="checkbox"
              checked={region.enabled}
              onChange={(event) => setRegion({ enabled: event.target.checked })}
            />
            <span>Enabled</span>
          </label>
        </div>

        {editor.mode === "edit" && (
          <section className="defaults-box">
            <SectionTitle title="System Defaults" />
            <ReadOnly
              label="Application"
              value={region.defaultApplicationUrl}
            />
            <ReadOnly label="API" value={region.defaultApiBaseUrl} />
            <ReadOnly label="OAuth" value={region.defaultAuthBaseUrl} />
          </section>
        )}

        {editor.testResults && (
          <section className="test-results">
            {Object.entries(editor.testResults).map(([field, result]) => (
              <StatusRow
                key={field}
                label={field.replace("Base", " ")}
                done={result.reachable}
                detail={result.status ? `HTTP ${result.status}` : result.error}
              />
            ))}
          </section>
        )}

        {editor.history.length > 0 && (
          <details className="history-box">
            <summary>
              <History size={16} />
              View Change History
            </summary>
            {editor.history.slice(0, 8).map((item) => (
              <div
                key={`${item.timestamp}-${Object.keys(item.changes).join("-")}`}
              >
                <Clock3 size={14} />
                <span>{formatDate(item.timestamp)}</span>
                <code>{Object.keys(item.changes).join(", ")}</code>
              </div>
            ))}
          </details>
        )}

        <footer className="button-row right">
          <button
            type="button"
            className="secondary"
            onClick={() => setEditor(null)}
          >
            Cancel
          </button>
          {editor.mode === "edit" && (
            <button
              type="button"
              className="secondary"
              onClick={onTest}
              disabled={Boolean(busy)}
            >
              <RefreshCcw size={16} />
              Test URLs
            </button>
          )}
          {editor.mode === "edit" && region.systemRegion && (
            <button
              type="button"
              className="secondary warning"
              onClick={onReset}
              disabled={Boolean(busy)}
            >
              Reset to Default
            </button>
          )}
          <button className="primary" disabled={Boolean(busy)}>
            <Save size={16} />
            Save Changes
          </button>
        </footer>
      </form>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="section-title">{title}</h2>;
}

function SummaryItem({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value?: string }) {
  return (
    <label>
      <span>{label}</span>
      <input value={value || ""} readOnly />
    </label>
  );
}

function StatusRow({
  label,
  done,
  detail,
}: {
  label: string;
  done: boolean;
  detail?: string;
}) {
  return (
    <div className="status-row">
      <CheckCircle2 className={done ? "ok" : "muted-icon"} size={18} />
      <span>{label}</span>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`status-pill ${status.toLowerCase()}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span className={enabled ? "badge enabled" : "badge disabled"}>
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
