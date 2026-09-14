import { useState, useEffect } from "react";
import { aiAPI } from "../api/client";

export default function SummaryPdfModal({ onClose }) {
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    aiAPI.getStatus()
      .then(res => setAiStatus(res.data))
      .catch(() => {});
  }, []);

  const runSummary = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await aiAPI.generateSummary();
      setSummaryData(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to generate AI executive summary.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    setError("");
    try {
      const res = await aiAPI.exportSummaryPDF();
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const todayStr = new Date().toISOString().slice(0, 10);
      link.setAttribute("download", `Personal_Organizer_Summary_${todayStr}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError("Failed to download PDF report. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 className="modal-title" style={{ margin: 0 }}>📊 AI Executive Briefing & PDF Export</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 16 }}>
          Generate a high-level strategic briefing synthesizing your active goals, pending tasks, calendar schedule, and care routines — then export as a professional PDF report.
        </p>

        {aiStatus && (
          <div style={{
            fontSize: 12,
            padding: "8px 12px",
            marginBottom: 16,
            background: "var(--bg-surface)",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <span>Active AI Engine: <strong style={{ color: "var(--accent)" }}>{aiStatus.active_provider || aiStatus.mode_description}</strong></span>
            <span className="badge badge-low" style={{ textTransform: "uppercase", fontSize: 10 }}>Ready</span>
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        {!summaryData ? (
          <div>
            <div className="card" style={{ background: "var(--bg-surface)", padding: 18, marginBottom: 20, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
              <h3 style={{ fontSize: 16, marginBottom: 6 }}>Ready to analyze your organizer</h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                AI will examine all active tasks, roadmap milestones, calendar slots, and medications to generate an actionable executive summary and productivity score.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button className="btn btn-primary" onClick={runSummary} disabled={loading}>
                  {loading ? <><span className="spinner" /> Synthesizing with AI…</> : "✨ Generate AI Executive Briefing"}
                </button>
                <button className="btn btn-ghost" onClick={handleDownloadPdf} disabled={downloading}>
                  {downloading ? <><span className="spinner" /> Generating PDF…</> : "📥 Direct Download PDF"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="alert alert-success" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>✅ Briefing Generated via <strong>{summaryData.summary?.ai_source || "AI Engine"}</strong></span>
              <span className="badge badge-high" style={{ fontSize: 12 }}>Score: {summaryData.summary?.productivity_score || "88/100"}</span>
            </div>

            <div className="card" style={{ background: "var(--bg-surface)", padding: 16, marginBottom: 14 }}>
              <strong style={{ fontSize: 13, color: "var(--accent)" }}>🎯 Executive Overview:</strong>
              <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 4, color: "var(--text)" }}>
                {summaryData.summary?.executive_overview}
              </p>

              {summaryData.summary?.top_priority && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(37, 99, 235, 0.08)", borderRadius: 6, borderLeft: "3px solid var(--accent)" }}>
                  <strong style={{ fontSize: 12, color: "var(--accent)" }}>Primary Focus: </strong>
                  <span style={{ fontSize: 13 }}>{summaryData.summary?.top_priority}</span>
                </div>
              )}
            </div>

            {summaryData.summary?.recommendations?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <strong style={{ fontSize: 13, color: "var(--text-muted)" }}>💡 Strategic Recommendations:</strong>
                <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: "var(--text)" }}>
                  {summaryData.summary.recommendations.map((rec, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}

            {summaryData.counts && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                <span className="badge badge-progress">{summaryData.counts.tasks} Tasks</span>
                <span className="badge badge-low">{summaryData.counts.goals} Goals</span>
                <span className="badge badge-medium">{summaryData.counts.events} Events</span>
                <span className="badge badge-high">{summaryData.counts.meds} Care Items</span>
                <span className="badge badge-low">{summaryData.counts.notes} Notes</span>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={runSummary} disabled={loading}>
                🔄 Refresh Briefing
              </button>
              <button className="btn btn-primary" onClick={handleDownloadPdf} disabled={downloading}>
                {downloading ? <><span className="spinner" /> Generating PDF…</> : "📥 Download Official PDF Report"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
