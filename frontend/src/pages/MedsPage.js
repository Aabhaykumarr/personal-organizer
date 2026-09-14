import { useState, useEffect, useRef } from "react";
import { medsAPI, aiAPI } from "../api/client";

export default function MedsPage() {
  const [meds,       setMeds]       = useState([]);
  const [due,        setDue]        = useState([]);
  const [modal,      setModal]      = useState(false);       // manual med
  const [aiModal,    setAiModal]    = useState(false);       // AI care planner
  const [aiResult,   setAiResult]   = useState(null);
  const [aiBusy,     setAiBusy]     = useState(false);
  const [aiError,    setAiError]    = useState("");

  const [form, setForm] = useState({
    patient_name: "", medication_name: "", dosage: "",
    frequency: "daily", times: "08:00", start_date: "", end_date: "", notes: ""
  });
  const [aiForm, setAiForm] = useState({ patient_name: "", condition: "", notes: "", create_all: true });
  const pollRef = useRef();

  const load = async () => {
    const { data } = await medsAPI.list();
    setMeds(data);
  };

  const checkDue = async () => {
    try {
      const { data } = await medsAPI.dueNow(30);
      setDue(data);
      if (data.length > 0 && "Notification" in window && Notification.permission === "granted") {
        data.forEach(m => {
          new Notification(`💊 Medication Reminder`, {
            body: `${m.patient_name}: ${m.medication_name} ${m.dosage} at ${m.due_at}`,
            icon: "/favicon.ico",
          });
        });
      }
    } catch {}
  };

  useEffect(() => {
    load();
    checkDue();
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    pollRef.current = setInterval(checkDue, 60_000);
    return () => clearInterval(pollRef.current);
  }, []);

  const saveMed = async (e) => {
    e.preventDefault();
    await medsAPI.create(form);
    setModal(false);
    setForm({ patient_name:"", medication_name:"", dosage:"", frequency:"daily", times:"08:00", start_date:"", end_date:"", notes:"" });
    load();
  };

  const runAICarePlanner = async (e) => {
    e.preventDefault();
    setAiBusy(true); setAiError(""); setAiResult(null);
    try {
      const { data } = await aiAPI.suggestMedSchedule(aiForm);
      setAiResult(data);
      if (aiForm.create_all) {
        load();
      }
    } catch (err) {
      setAiError(err.response?.data?.detail || "AI care plan generation failed");
    } finally {
      setAiBusy(false);
    }
  };

  const addAllAIMeds = async () => {
    if (!aiResult?.medications) return;
    for (const m of aiResult.medications) {
      await medsAPI.create({
        patient_name: aiForm.patient_name || aiResult.patient_name || "Patient",
        medication_name: m.medication_name,
        dosage: m.dosage,
        frequency: m.frequency || "daily",
        times: m.times || "08:00",
        start_date: new Date().toISOString().slice(0, 10),
        notes: m.notes || "",
      });
    }
    setAiModal(false);
    setAiResult(null);
    load();
  };

  const deleteMed = async (id) => {
    if (!window.confirm("Remove this medication?")) return;
    await medsAPI.delete(id);
    load();
  };

  const sf = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const FREQ_LABELS = { daily: "Once daily", twice_daily: "Twice daily", weekly: "Weekly", custom: "Custom" };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Care & Reminders</h1>
          <p className="page-subtitle">Medication schedules, elderly care alerts, and AI routine planning</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => setModal(true)}>+ Add Medication</button>
          <button className="btn btn-primary" onClick={() => { setAiModal(true); setAiResult(null); }}>✨ AI Care Planner</button>
        </div>
      </div>

      {/* Active reminders banner */}
      {due.length > 0 && (
        <div className="alert alert-info reminder-alert" style={{ marginBottom: 24 }}>
          <strong>💊 Medication Due Now</strong>
          <ul style={{ marginTop: 8, paddingLeft: 20, fontSize: 14 }}>
            {due.map((m, i) => (
              <li key={i}>{m.patient_name}: <strong>{m.medication_name}</strong> {m.dosage} — scheduled at {m.due_at}</li>
            ))}
          </ul>
        </div>
      )}

      {meds.length === 0
        ? <div className="card" style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>💊</div>
            <p style={{ fontSize: 16, marginBottom: 12 }}>No medications tracked yet.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn btn-primary" onClick={() => setAiModal(true)}>✨ Plan Care Routine with AI</button>
              <button className="btn btn-ghost" onClick={() => setModal(true)}>Add manually</button>
            </div>
          </div>
        : <div className="grid-2">
            {meds.map(med => {
              const isDue = due.some(d => d.med_id === med.med_id);
              return (
                <div key={med.med_id} className={`card ${isDue ? "reminder-alert" : ""}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{med.medication_name}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2 }}>
                        Patient: <strong style={{ color: "var(--text)" }}>{med.patient_name}</strong>
                      </div>
                    </div>
                    {isDue && <span className="badge badge-high" style={{ animation: "pulse-ring 2s infinite" }}>DUE NOW</span>}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14, fontSize: 13 }}>
                    <div>
                      <div className="form-label">Dosage</div>
                      <div>{med.dosage}</div>
                    </div>
                    <div>
                      <div className="form-label">Frequency</div>
                      <div>{FREQ_LABELS[med.frequency] || med.frequency}</div>
                    </div>
                    <div>
                      <div className="form-label">Scheduled times</div>
                      <div>{Array.isArray(med.times) ? med.times.join(", ") : med.times}</div>
                    </div>
                    {med.start_date && (
                      <div>
                        <div className="form-label">Period</div>
                        <div>{med.start_date}{med.end_date ? ` → ${med.end_date}` : " (ongoing)"}</div>
                      </div>
                    )}
                  </div>

                  {med.notes && (
                    <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 12, padding: "8px 12px",
                      background: "var(--bg-surface)", borderRadius: 6 }}>{med.notes}</p>
                  )}

                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteMed(med.med_id)}>Remove</button>
                  </div>
                </div>
              );
            })}
          </div>
      }

      {/* Manual Medication Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <h2 className="modal-title">Add Medication</h2>
            <form onSubmit={saveMed}>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Patient Name</label>
                  <input className="form-input" placeholder="e.g. Grandma Rose" value={form.patient_name} onChange={sf("patient_name")} required /></div>
                <div className="form-group"><label className="form-label">Medication Name</label>
                  <input className="form-input" placeholder="e.g. Metformin" value={form.medication_name} onChange={sf("medication_name")} required /></div>
              </div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Dosage</label>
                  <input className="form-input" placeholder="e.g. 500mg" value={form.dosage} onChange={sf("dosage")} required /></div>
                <div className="form-group"><label className="form-label">Frequency</label>
                  <select className="form-select" value={form.frequency} onChange={sf("frequency")}>
                    <option value="daily">Once daily</option>
                    <option value="twice_daily">Twice daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="custom">Custom</option>
                  </select></div>
              </div>
              <div className="form-group">
                <label className="form-label">Times (pipe-separated, 24h format)</label>
                <input className="form-input" placeholder="08:00|13:00|20:00" value={form.times} onChange={sf("times")} />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Reminders fire 30 min before each time</span>
              </div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Start Date</label>
                  <input type="date" className="form-input" value={form.start_date} onChange={sf("start_date")} /></div>
                <div className="form-group"><label className="form-label">End Date (optional)</label>
                  <input type="date" className="form-input" value={form.end_date} onChange={sf("end_date")} /></div>
              </div>
              <div className="form-group"><label className="form-label">Notes</label>
                <textarea className="form-textarea" placeholder="Take with food, avoid grapefruit..." value={form.notes} onChange={sf("notes")} /></div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Medication</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Care Routine Planner Modal */}
      {aiModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAiModal(false)}>
          <div className="modal" style={{ maxWidth: 620 }}>
            <h2 className="modal-title">✨ AI Care & Medication Routine Planner</h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 20 }}>
              Input patient condition, prescription details, or supplement goals. AI will generate an optimal timing schedule and safety instructions.
            </p>

            {!aiResult ? (
              <form onSubmit={runAICarePlanner}>
                {aiError && <div className="alert alert-error">{aiError}</div>}

                <div className="form-group">
                  <label className="form-label">Patient Name</label>
                  <input className="form-input" placeholder="e.g. Grandma Rose, Dad, Self"
                    value={aiForm.patient_name} onChange={e => setAiForm(f => ({ ...f, patient_name: e.target.value }))} required />
                </div>

                <div className="form-group">
                  <label className="form-label">Condition, Prescription, or Health Regimen</label>
                  <input className="form-input" placeholder="e.g. Type 2 Diabetes & Hypertension, Post-Surgery Recovery, Daily Vitamins"
                    value={aiForm.condition} onChange={e => setAiForm(f => ({ ...f, condition: e.target.value }))} required />
                </div>

                <div className="form-group">
                  <label className="form-label">Doctor's Instructions / Dietary Constraints (Optional)</label>
                  <textarea className="form-textarea" placeholder="e.g. Must take with breakfast, avoid nighttime doses..."
                    value={aiForm.notes} onChange={e => setAiForm(f => ({ ...f, notes: e.target.value }))} />
                </div>

                <div className="form-group">
                  <label className="form-label">Auto-Add to Care Tracker</label>
                  <select className="form-select" value={aiForm.create_all ? "yes" : "no"} onChange={e => setAiForm(f => ({ ...f, create_all: e.target.value === "yes" }))}>
                    <option value="yes">Yes, Add All Medications Directly</option>
                    <option value="no">Preview First</option>
                  </select>
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setAiModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={aiBusy}>
                    {aiBusy ? <><span className="spinner" /> Planning routine…</> : "✨ Generate Care Plan"}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div className="alert alert-success">
                  ✅ Care plan created for {aiResult.patient_name}! ({aiResult.ai_source || "AI Engine"})
                </div>

                {aiResult.ai_notice && (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                    💡 {aiResult.ai_notice}
                  </p>
                )}

                {aiResult.summary && <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>{aiResult.summary}</p>}

                <h4 style={{ marginBottom: 8, fontSize: 14 }}>Generated Medication Schedule:</h4>
                <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 16 }}>
                  {aiResult.medications?.map((m, idx) => (
                    <div key={idx} className="card" style={{ marginBottom: 8, background: "var(--bg-surface)", padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong style={{ fontSize: 14 }}>💊 {m.medication_name} ({m.dosage})</strong>
                        <span className="badge badge-progress">{m.times}</span>
                      </div>
                      <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                        Frequency: {FREQ_LABELS[m.frequency] || m.frequency} {m.notes ? `• ${m.notes}` : ""}
                      </p>
                    </div>
                  ))}
                </div>

                {aiResult.safety_tips?.length > 0 && (
                  <div style={{ marginBottom: 16, padding: 10, background: "rgba(245,166,35,0.08)", borderRadius: 8, border: "1px solid rgba(245,166,35,0.2)" }}>
                    <strong style={{ fontSize: 13, color: "var(--warning)" }}>⚠️ Safety Notes:</strong>
                    <ul style={{ paddingLeft: 18, fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      {aiResult.safety_tips.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button className="btn btn-ghost" onClick={() => { setAiModal(false); setAiResult(null); }}>Done</button>
                  {!aiForm.create_all && (
                    <button className="btn btn-primary" onClick={addAllAIMeds}>📥 Add All to Care Tracker</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
