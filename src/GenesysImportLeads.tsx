import {
  CheckCircle2,
  CloudUpload,
  Loader2,
  RefreshCcw,
  Search,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, type GenesysConfig } from "./lib/api";

type Campaign = {
  campaignListId: string;
  name: string;
  description: string;
  recordCount: number;
  updatedAt: string;
  lastGenesysSyncAt: string;
};

type PreviewRow = {
  contact: {
    firstName: string;
    lastName: string;
    phone: string;
    policyNumber: string;
    productName: string;
    expiryDate: string;
    daysUntilExpiry: string;
    renewalStatus: string;
  };
  policy: { policyId: string };
  eligibility: string;
};

type ContactPreview = {
  rows: PreviewRow[];
  summary: {
    matched: number;
    eligible: number;
    dncExcluded: number;
    invalidPhone: number;
    duplicatePhone: number;
    alreadySynced: number;
  };
};

type SyncResult = { policyId: string; status: string; message: string };

const dateTime = (value?: string) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Never";

export function GenesysImportLeads({ config }: { config: GenesysConfig }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [preview, setPreview] = useState<ContactPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "preview" | "load">("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [failed, setFailed] = useState<SyncResult[]>([]);

  const selected = campaigns.find(
    (campaign) => campaign.campaignListId === selectedId,
  );
  const readyRows = useMemo(
    () => preview?.rows.filter((row) => row.eligibility === "ELIGIBLE") ?? [],
    [preview],
  );
  const integrationReady =
    config.enabled &&
    Boolean(config.contactListId) &&
    config.schemaStatus === "VALID";

  async function loadCampaigns(silent = false) {
    if (!silent) setLoading(true);
    try {
      const result = await api<{ items: Campaign[] }>("/api/admin/campaigns");
      setCampaigns(result.items);
      setSelectedId((current) =>
        result.items.some((item) => item.campaignListId === current)
          ? current
          : result.items[0]?.campaignListId || "",
      );
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to load campaigns",
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadCampaigns();
  }, []);

  function chooseCampaign(id: string) {
    setSelectedId(id);
    setPreview(null);
    setMessage("");
    setError("");
    setFailed([]);
  }

  async function previewCampaign(id = selectedId) {
    if (!id) {
      setError("Select a source campaign first.");
      return;
    }
    setBusy("preview");
    setSelectedId(id);
    setError("");
    setMessage("");
    setFailed([]);
    try {
      const result = await api<ContactPreview>(
        `/api/admin/campaigns/${encodeURIComponent(id)}/preview`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setPreview(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Preview failed");
    } finally {
      setBusy("");
    }
  }

  async function loadLeads() {
    if (!selected || !readyRows.length || !integrationReady) return;
    if (
      !window.confirm(
        `Load ${readyRows.length} leads from ${selected.name} into ${config.contactListName || config.contactListId}?`,
      )
    )
      return;

    setBusy("load");
    setError("");
    setMessage("");
    setFailed([]);
    setProgress({ processed: 0, total: readyRows.length });
    const results: SyncResult[] = [];
    try {
      const policyIds = readyRows.map((row) => row.policy.policyId);
      for (let index = 0; index < policyIds.length; index += 5) {
        const batch = policyIds.slice(index, index + 5);
        const response = await api<{ results: SyncResult[] }>(
          "/api/admin/genesys/sync/bulk",
          {
            method: "POST",
            body: JSON.stringify({
              policyIds: batch,
              campaignListId: selected.campaignListId,
            }),
          },
        );
        results.push(...response.results);
        setProgress({ processed: results.length, total: policyIds.length });
      }

      const failures = results.filter(
        (result) => !["SYNCED", "ALREADY_SYNCED"].includes(result.status),
      );
      const completed = results.length - failures.length;
      setFailed(failures);
      setMessage(
        `Load completed: ${completed} successful, ${failures.length} failed.`,
      );
      const refreshed = await api<ContactPreview>(
        `/api/admin/campaigns/${encodeURIComponent(selected.campaignListId)}/preview`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setPreview(refreshed);
      await loadCampaigns(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Lead import failed");
    } finally {
      setBusy("");
      setProgress({ processed: 0, total: 0 });
    }
  }

  if (loading)
    return (
      <div className="lead-import-loading">
        <Loader2 className="spin" /> Loading campaigns...
      </div>
    );

  return (
    <div className="lead-import-view">
      {error && (
        <div className="alert error" role="alert">
          <X size={16} /> {error}
        </div>
      )}
      {message && (
        <div className="alert success" role="status">
          <CheckCircle2 size={16} /> {message}
        </div>
      )}

      <section className="summary-band lead-import-summary">
        <div>
          <span>Destination list</span>
          <strong>{config.contactListName || "Not configured"}</strong>
        </div>
        <div>
          <span>Campaigns</span>
          <strong>{campaigns.length}</strong>
        </div>
        <div>
          <span>Selected campaign</span>
          <strong>{selected?.name || "-"}</strong>
        </div>
        <div>
          <span>Ready to load</span>
          <strong>{preview?.summary.eligible ?? "-"}</strong>
        </div>
        <div>
          <span>Integration</span>
          <strong>
            {integrationReady ? "Ready" : "Configuration required"}
          </strong>
        </div>
      </section>

      {!integrationReady && (
        <div className="lead-import-readiness">
          Configure and enable the integration, select a Contact List, and
          validate its schema before loading leads.
          <a href="/genesys">Open Integration</a>
        </div>
      )}

      <section className="settings-panel lead-campaign-panel">
        <div className="lead-panel-head">
          <div>
            <h2>Source campaigns</h2>
            <p className="muted">
              Preview the eligible contacts in a saved insurance campaign.
            </p>
          </div>
          <button
            className="secondary"
            onClick={() => loadCampaigns()}
            disabled={Boolean(busy)}
          >
            <RefreshCcw size={16} /> Refresh
          </button>
        </div>
        {campaigns.length ? (
          <div className="lead-table-wrap">
            <table className="lead-campaign-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Eligible leads</th>
                  <th>Last loaded</th>
                  <th>Updated</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr
                    key={campaign.campaignListId}
                    className={
                      selectedId === campaign.campaignListId ? "active" : ""
                    }
                  >
                    <td>
                      <strong>{campaign.name}</strong>
                      <small>
                        {campaign.description || campaign.campaignListId}
                      </small>
                    </td>
                    <td>{campaign.recordCount}</td>
                    <td>{dateTime(campaign.lastGenesysSyncAt)}</td>
                    <td>{dateTime(campaign.updatedAt)}</td>
                    <td>
                      <button
                        className="secondary lead-preview-button"
                        onClick={() => {
                          chooseCampaign(campaign.campaignListId);
                          void previewCampaign(campaign.campaignListId);
                        }}
                        disabled={Boolean(busy)}
                      >
                        {busy === "preview" &&
                        selectedId === campaign.campaignListId ? (
                          <Loader2 className="spin" size={16} />
                        ) : (
                          <Search size={16} />
                        )}
                        Preview
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="lead-import-empty">
            <Users size={25} />
            <strong>No campaigns available</strong>
            <span>Create a campaign in Insurance Management first.</span>
            <a className="secondary" href="/manage/campaigns">
              Open Campaigns
            </a>
          </div>
        )}
      </section>

      {preview && selected && (
        <section className="settings-panel lead-preview-panel">
          <div className="lead-panel-head">
            <div>
              <h2>Ready contacts</h2>
              <p className="muted">{selected.name}</p>
            </div>
            <button
              className="primary"
              onClick={loadLeads}
              disabled={
                busy === "load" || !readyRows.length || !integrationReady
              }
            >
              {busy === "load" ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <CloudUpload size={16} />
              )}
              Load Lead ({readyRows.length})
            </button>
          </div>

          <div className="review-counts lead-preview-counts">
            <div>
              <span>Matched</span>
              <strong>{preview.summary.matched}</strong>
            </div>
            <div>
              <span>Ready</span>
              <strong>{preview.summary.eligible}</strong>
            </div>
            <div>
              <span>DNC excluded</span>
              <strong>{preview.summary.dncExcluded}</strong>
            </div>
            <div>
              <span>Invalid phone</span>
              <strong>{preview.summary.invalidPhone}</strong>
            </div>
            <div>
              <span>Duplicate phone</span>
              <strong>{preview.summary.duplicatePhone}</strong>
            </div>
            <div>
              <span>Already synced</span>
              <strong>{preview.summary.alreadySynced}</strong>
            </div>
          </div>

          {progress.total > 0 && (
            <div className="lead-load-progress">
              <div>
                <span>Loading leads</span>
                <strong>
                  {progress.processed} / {progress.total}
                </strong>
              </div>
              <progress value={progress.processed} max={progress.total} />
            </div>
          )}

          {failed.length > 0 && (
            <div className="lead-failures">
              <strong>Failed records</strong>
              {failed.map((result) => (
                <span key={result.policyId}>
                  {result.policyId}: {result.message}
                </span>
              ))}
            </div>
          )}

          {readyRows.length ? (
            <div className="lead-table-wrap lead-contact-table-wrap">
              <table className="lead-contact-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Policy number</th>
                    <th>Product</th>
                    <th>Expiry date</th>
                    <th>Days left</th>
                    <th>Renewal status</th>
                  </tr>
                </thead>
                <tbody>
                  {readyRows.map((row) => (
                    <tr key={row.policy.policyId}>
                      <td>
                        {row.contact.firstName} {row.contact.lastName}
                      </td>
                      <td>{row.contact.phone}</td>
                      <td>{row.contact.policyNumber}</td>
                      <td>{row.contact.productName}</td>
                      <td>{row.contact.expiryDate}</td>
                      <td>{row.contact.daysUntilExpiry}</td>
                      <td>
                        <span className="lead-status">
                          {row.contact.renewalStatus.replaceAll("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="lead-import-empty compact">
              <CheckCircle2 size={25} />
              <strong>No contacts are waiting to load</strong>
              <span>
                Matched contacts are excluded when they are DNC, invalid,
                duplicated, or already synchronized.
              </span>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
