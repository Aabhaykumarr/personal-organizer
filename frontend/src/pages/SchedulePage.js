import { useState, useEffect } from "react";
import Calendar from "react-calendar";
import { schedulesAPI, aiAPI } from "../api/client";
import { format } from "date-fns";

export default function SchedulePage() {
  const [schedules,   setSchedules]   = useState([]);
  const [goals,       setGoals]       = useState([]);
  const [selected,    setSelected]    = useState(new Date());
  const [tab,         setTab]         = useState("calendar"); // calendar | goals
  const [schedModal,  setSchedModal]  = useState(false);
  const [goalModal,   setGoalModal]   = useState(false);
  const [aiModal,     setAiModal]     = useState(false);       // AI Goal Planner
  const [dayAiModal,  setDayAiModal]  = useState(false);       // AI Day Time-Blocker
  const [aiResult,    setAiResult]    = useState(null);
  const [dayAiResult, setDayAiResult] = useState(null);
  const [aiBusy,      setAiBusy]      = useState(false);
  const [aiError,     setAiError]     = useState("");

  const [schedForm, setSchedForm] = useState({
    title: "", description: "", date: "", time_start: "", time_end: "", recurrence: "none", goal_id: ""
  });
  const [goalForm,  setGoalForm]  = useState({ title: "", description: "", target_date: "", status: "active" });
  const [aiForm,    setAiForm]    = useState({ goal_title: "", description: "", timeframe: "3 months", start_date: "", goal_id: "" });
  const [dayAiForm, setDayAiForm] = useState({ date_str: "", focus_areas: "", create_all: true });

  const loadAll = async () => {
    const month = format(selected, "yyyy-MM");
    const [s, g] = await Promise.all([
      schedulesAPI.list(month),
      schedulesAPI.listGoals(),
    ]);
    setSchedules(s.data);
    setGoals(g.data);
  };

  useEffect(() => { loadAll(); }, [selected]); // eslint-disable-line

  const dayStr     = format(selected, "yyyy-MM-dd");
  const dayEvents  = schedules.filter(s => s.date === dayStr);

  const tileContent = ({ date }) => {
    const d = format(date, "yyyy-MM-dd");
    const has = schedules.some(s => s.date === d);
    return has ? <div className="has-events" /> : null;
  };

  const saveSchedule = async (e) => {
    e.preventDefault();
    await schedulesAPI.create(schedForm);
    setSchedModal(false);
    setSchedForm({ title:"", description:"", date:"", time_start:"", time_end:"", recurrence:"none", goal_id:"" });
    loadAll();
  };

  const saveGoal = async (e) => {
    e.preventDefault();
    await schedulesAPI.createGoal(goalForm);
    setGoalModal(false);
    setGoalForm({ title:"", description:"", target_date:"", status:"active" });
    loadAll();
  };

  const runAIGoal = async (e) => {
    e.preventDefault();
    setAiBusy(true); setAiError(""); setAiResult(null);
    try {
      const { data } = await aiAPI.planGoal(aiForm);
      setAiResult(data);
      loadAll();
    } catch (err) {
      setAiError(err.response?.data?.detail || "AI planning failed.");
    } finally { setAiBusy(false); }
  };

  const runAIDayPlan = async (e) => {
    e.preventDefault();
    setAiBusy(true); setAiError(""); setDayAiResult(null);
    try {
      const { data } = await aiAPI.planDay({
        ...dayAiForm,
        date_str: dayAiForm.date_str || dayStr,
      });
      setDayAiResult(data);
      loadAll();
    } catch (err) {
      setAiError(err.response?.data?.detail || "AI daily schedule planning failed.");
    } finally { setAiBusy(false); }
  };

  const addAllDayEvents = async () => {
    if (!dayAiResult?.events) return;
    const targetDate = dayAiForm.date_str || dayStr;
    for (const ev of dayAiResult.events) {
      await schedulesAPI.create({
        title: ev.title,
        description: ev.description || "",
        date: targetDate,
        time_start: ev.time_start || "09:00",
        time_end: ev.time_end || "10:00",
        recurrence: "none",
        goal_id: "",
      });
    }
    setDayAiModal(false);
    setDayAiResult(null);
    loadAll();
  };

  const ss = (key) => (e) => setSchedForm(f => ({ ...f, [key]: e.target.value }));
  const sg = (key) => (e) => setGoalForm(f => ({ ...f, [key]: e.target.value }));
  const sa = (key) => (e) => setAiForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Schedule & Goals</h1>
          <p className="page-subtitle">Plan your time, set goals, and generate AI-powered schedules</p>
        </div>
        <div style={{ display:"flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={() => setGoalModal(true)}>+ Goal</button>
          <button className="btn btn-ghost" onClick={() => { setSchedForm(f => ({ ...f, date: dayStr })); setSchedModal(true); }}>+ Event</button>
          <button className="btn btn-ghost" onClick={() => { setDayAiForm({ date_str: dayStr, focus_areas: "", create_all: true }); setDayAiModal(true); setDayAiResult(null); }}>✨ AI Day Schedule</button>
          <button className="btn btn-primary" onClick={() => { setAiModal(true); setAiResult(null); }}>✨ AI Goal Plan</button>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display:"flex", gap:4, marginBottom:24, borderBottom:"1px solid var(--border)", paddingBottom:1 }}>
        {["calendar","goals"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding:"8px 18px", background:"none", border:"none",
              color: tab===t ? "var(--accent)" : "var(--text-muted)",
              borderBottom: tab===t ? "2px solid var(--accent)" : "2px solid transparent",
              cursor:"pointer", fontWeight:600, fontSize:14, textTransform:"capitalize" }}>
            {t === "calendar" ? "📅 Calendar" : "🎯 Goals"}
          </button>
        ))}
      </div>

      {tab === "calendar" && (
        <div className="grid-2">
          <div>
            <Calendar
              onChange={setSelected}
              value={selected}
              tileContent={tileContent}
            />
          </div>
          <div>
            <div className="card-header" style={{ marginBottom: 12 }}>
              <span className="card-title">Events on {format(selected, "MMMM d, yyyy")}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => { setDayAiForm({ date_str: dayStr, focus_areas: "", create_all: true }); setDayAiModal(true); setDayAiResult(null); }}>
                ✨ Time-block Day
              </button>
            </div>
            {dayEvents.length === 0
              ? <div className="card" style={{ textAlign: "center", padding: "30px 10px", color: "var(--text-muted)" }}>
                  <p style={{ fontSize: 14, marginBottom: 12 }}>No events scheduled for this day.</p>
                  <button className="btn btn-primary btn-sm" onClick={() => { setDayAiForm({ date_str: dayStr, focus_areas: "", create_all: true }); setDayAiModal(true); setDayAiResult(null); }}>
                    ✨ Generate Daily Time-blocks
                  </button>
                </div>
              : dayEvents.map(ev => (
                  <div key={ev.schedule_id} className="card" style={{ marginBottom:10 }}>
                    <div style={{ fontWeight:600 }}>{ev.title}</div>
                    {(ev.time_start || ev.time_end) &&
                      <div style={{ fontSize:13, color:"var(--accent)", marginTop:4 }}>
                        ⏰ {ev.time_start}{ev.time_end ? ` – ${ev.time_end}` : ""}
                      </div>}
                    {ev.description && <p style={{ fontSize:13, color:"var(--text-muted)", marginTop:4 }}>{ev.description}</p>}
                    <button className="btn btn-ghost btn-sm" style={{ marginTop:8 }}
                      onClick={() => schedulesAPI.delete(ev.schedule_id).then(loadAll)}>
                      Remove
                    </button>
                  </div>
                ))
            }
          </div>
        </div>
      )}

      {tab === "goals" && (
        <div>
          {goals.length === 0
            ? <div className="card" style={{ textAlign: "center", padding: "50px 20px", color: "var(--text-muted)" }}>
                <p style={{ fontSize: 16, marginBottom: 12 }}>No goals created yet.</p>
                <button className="btn btn-primary" onClick={() => setAiModal(true)}>✨ Plan a Goal with AI</button>
              </div>
            : <div className="grid-2">
                {goals.map(g => (
                  <div key={g.goal_id} className="card">
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"start" }}>
                      <div>
                        <div style={{ fontWeight:600, marginBottom:4 }}>{g.title}</div>
                        <span className={`badge badge-${g.status === "active" ? "progress" : "completed"}`}>{g.status}</span>
                      </div>
                      <button className="btn btn-primary btn-sm"
                        onClick={() => { setAiForm(f => ({ ...f, goal_id: g.goal_id, goal_title: g.title, description: g.description })); setAiModal(true); setAiResult(null); }}>
                        ✨ Plan
                      </button>
                    </div>
                    {g.description && <p style={{ fontSize:13, color:"var(--text-muted)", margin:"8px 0" }}>{g.description}</p>}
                    {g.target_date && <p style={{ fontSize:12, color:"var(--text-muted)" }}>Target: {g.target_date}</p>}
                    {g.ai_plan && (
                      <details style={{ marginTop:12 }}>
                        <summary style={{ cursor:"pointer", fontSize:13, color:"var(--accent)" }}>View AI Plan</summary>
                        <pre style={{ fontSize:11, background:"var(--bg-surface)", padding:10, borderRadius:6, marginTop:8, overflow:"auto", maxHeight:200, color:"var(--text-muted)", whiteSpace:"pre-wrap" }}>
                          {JSON.stringify(JSON.parse(g.ai_plan), null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* Add event modal */}
      {schedModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSchedModal(false)}>
          <div className="modal">
            <h2 className="modal-title">Add Event</h2>
            <form onSubmit={saveSchedule}>
              <div className="form-group"><label className="form-label">Title</label>
                <input className="form-input" value={schedForm.title} onChange={ss("title")} required /></div>
              <div className="form-group"><label className="form-label">Description</label>
                <textarea className="form-textarea" value={schedForm.description} onChange={ss("description")} /></div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Date</label>
                  <input type="date" className="form-input" value={schedForm.date} onChange={ss("date")} required /></div>
                <div className="form-group"><label className="form-label">Recurrence</label>
                  <select className="form-select" value={schedForm.recurrence} onChange={ss("recurrence")}>
                    {["none","daily","weekly","monthly"].map(r => <option key={r}>{r}</option>)}
                  </select></div>
              </div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Start time</label>
                  <input type="time" className="form-input" value={schedForm.time_start} onChange={ss("time_start")} /></div>
                <div className="form-group"><label className="form-label">End time</label>
                  <input type="time" className="form-input" value={schedForm.time_end} onChange={ss("time_end")} /></div>
              </div>
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button type="button" className="btn btn-ghost" onClick={() => setSchedModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add goal modal */}
      {goalModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setGoalModal(false)}>
          <div className="modal">
            <h2 className="modal-title">New Goal</h2>
            <form onSubmit={saveGoal}>
              <div className="form-group"><label className="form-label">Goal title</label>
                <input className="form-input" value={goalForm.title} onChange={sg("title")} required /></div>
              <div className="form-group"><label className="form-label">Description</label>
                <textarea className="form-textarea" value={goalForm.description} onChange={sg("description")} /></div>
              <div className="form-group"><label className="form-label">Target date</label>
                <input type="date" className="form-input" value={goalForm.target_date} onChange={sg("target_date")} /></div>
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button type="button" className="btn btn-ghost" onClick={() => setGoalModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create goal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Goal Planner modal */}
      {aiModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAiModal(false)}>
          <div className="modal" style={{ maxWidth:600 }}>
            <h2 className="modal-title">✨ AI Goal Planner</h2>
            <p style={{ color:"var(--text-muted)", fontSize:14, marginBottom:20 }}>
              Describe your goal and AI will generate a structured daily/monthly plan, automatically populating tasks and calendar events.
            </p>

            {!aiResult ? (
              <form onSubmit={runAIGoal}>
                {aiError && <div className="alert alert-error">{aiError}</div>}
                <div className="form-group"><label className="form-label">Goal title</label>
                  <input className="form-input" placeholder="e.g. Learn Spanish in 3 months, Run a Half Marathon, Launch SaaS"
                    value={aiForm.goal_title} onChange={sa("goal_title")} required /></div>
                <div className="form-group"><label className="form-label">Details / constraints</label>
                  <textarea className="form-textarea" placeholder="e.g. I can study 30 min/day, starting from basics..."
                    value={aiForm.description} onChange={sa("description")} /></div>
                <div className="grid-2">
                  <div className="form-group"><label className="form-label">Timeframe</label>
                    <input className="form-input" placeholder="3 months" value={aiForm.timeframe} onChange={sa("timeframe")} /></div>
                  <div className="form-group"><label className="form-label">Start date</label>
                    <input type="date" className="form-input" value={aiForm.start_date} onChange={sa("start_date")} /></div>
                </div>
                <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setAiModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={aiBusy}>
                    {aiBusy ? <><span className="spinner" /> Generating…</> : "✨ Generate Plan"}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div className="alert alert-success">
                  ✅ Plan generated! {aiResult.tasks_created} tasks added to your dashboard and calendar. ({aiResult.ai_source || "AI Engine"})
                </div>

                {aiResult.ai_notice && (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                    💡 {aiResult.ai_notice}
                  </p>
                )}

                <h3 style={{ marginBottom:8 }}>{aiResult.summary}</h3>
                <h4 style={{ color:"var(--text-muted)", margin:"16px 0 8px" }}>Daily tasks (first 2 weeks)</h4>
                <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 12 }}>
                  {aiResult.daily_tasks?.map((t, i) => (
                    <div key={i} className="card" style={{ marginBottom:8, background: "var(--bg-surface)", padding: 10 }}>
                      <strong>Day {t.day}:</strong> {t.title}
                      {t.description && <p style={{ fontSize:13, color:"var(--text-muted)", marginTop:4 }}>{t.description}</p>}
                    </div>
                  ))}
                </div>
                <h4 style={{ color:"var(--text-muted)", margin:"16px 0 8px" }}>Monthly milestones</h4>
                {aiResult.monthly_milestones?.map((m, i) => (
                  <div key={i} style={{ padding:"6px 0", borderBottom:"1px solid var(--border)", fontSize: 13 }}>
                    <strong>Month {m.month}:</strong> {m.title}
                  </div>
                ))}
                {aiResult.tips?.length > 0 && (
                  <>
                    <h4 style={{ color:"var(--text-muted)", margin:"16px 0 8px" }}>Tips</h4>
                    <ul style={{ paddingLeft:20, fontSize:13, color:"var(--text-muted)" }}>
                      {aiResult.tips.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </>
                )}
                <button className="btn btn-primary" style={{ marginTop:20 }}
                  onClick={() => { setAiModal(false); setAiResult(null); }}>Done</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Daily Schedule / Time-Block Modal */}
      {dayAiModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDayAiModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <h2 className="modal-title">✨ AI Daily Schedule Generator</h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 20 }}>
              Generate an optimized, time-blocked daily schedule with deep work blocks, breaks, and review sessions.
            </p>

            {!dayAiResult ? (
              <form onSubmit={runAIDayPlan}>
                {aiError && <div className="alert alert-error">{aiError}</div>}

                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Date</label>
                    <input type="date" className="form-input" value={dayAiForm.date_str || dayStr}
                      onChange={e => setDayAiForm(f => ({ ...f, date_str: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Auto-Add to Calendar</label>
                    <select className="form-select" value={dayAiForm.create_all ? "yes" : "no"}
                      onChange={e => setDayAiForm(f => ({ ...f, create_all: e.target.value === "yes" }))}>
                      <option value="yes">Yes, Add All Time-Blocks</option>
                      <option value="no">Preview First</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Main Focus / Theme for the Day (Optional)</label>
                  <input className="form-input" placeholder="e.g. Deep Coding Sprint, Project Launch, Study & Exam Prep"
                    value={dayAiForm.focus_areas} onChange={e => setDayAiForm(f => ({ ...f, focus_areas: e.target.value }))} />
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setDayAiModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={aiBusy}>
                    {aiBusy ? <><span className="spinner" /> Generating…</> : "✨ Generate Schedule"}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div className="alert alert-success">
                  ✅ Generated {dayAiResult.events?.length || 0} time blocks for {dayAiResult.date}! ({dayAiResult.ai_source || "AI Engine"})
                </div>

                {dayAiResult.ai_notice && (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                    💡 {dayAiResult.ai_notice}
                  </p>
                )}

                <h3 style={{ fontSize: 16, marginBottom: 12 }}>Theme: {dayAiResult.theme}</h3>

                <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 16 }}>
                  {dayAiResult.events?.map((ev, i) => (
                    <div key={i} className="card" style={{ marginBottom: 8, background: "var(--bg-surface)", padding: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong style={{ fontSize: 14 }}>{ev.title}</strong>
                        <span className="badge badge-progress">⏰ {ev.time_start} – {ev.time_end}</span>
                      </div>
                      {ev.description && <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{ev.description}</p>}
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button className="btn btn-ghost" onClick={() => { setDayAiModal(false); setDayAiResult(null); }}>Done</button>
                  {!dayAiForm.create_all && (
                    <button className="btn btn-primary" onClick={addAllDayEvents}>📥 Add All to Calendar</button>
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
