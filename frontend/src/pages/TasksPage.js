import { useState, useEffect } from "react";
import { tasksAPI, aiAPI } from "../api/client";

const STATUS_LABELS = { pending: "Pending", in_progress: "In Progress", completed: "Completed" };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export default function TasksPage() {
  const [tasks,       setTasks]       = useState([]);
  const [metrics,     setMetrics]     = useState(null);
  const [filter,      setFilter]      = useState("all");
  const [modal,       setModal]       = useState(false);       // manual task
  const [aiModal,     setAiModal]     = useState(false);       // AI breakdown
  const [aiResult,    setAiResult]    = useState(null);
  const [aiBusy,      setAiBusy]      = useState(false);
  const [aiError,     setAiError]     = useState("");

  const [form, setForm] = useState({ title: "", description: "", priority: "medium", due_date: "" });
  const [aiForm, setAiForm] = useState({ task_title: "", context: "", num_tasks: 5, create_all: true });

  const load = async () => {
    const [t, m] = await Promise.all([tasksAPI.list(), tasksAPI.metrics()]);
    setTasks(t.data);
    setMetrics(m.data);
  };

  useEffect(() => { load(); }, []);

  const displayed = tasks
    .filter(t => filter === "all" || t.status === filter)
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1));

  const setStatus = async (id, status) => {
    await tasksAPI.update(id, { status });
    load();
  };

  const saveTask = async (e) => {
    e.preventDefault();
    await tasksAPI.create(form);
    setModal(false);
    setForm({ title: "", description: "", priority: "medium", due_date: "" });
    load();
  };

  const runAIBreakdown = async (e) => {
    e.preventDefault();
    setAiBusy(true); setAiError(""); setAiResult(null);
    try {
      const { data } = await aiAPI.breakdownTask(aiForm);
      setAiResult(data);
      if (aiForm.create_all) {
        load();
      }
    } catch (err) {
      setAiError(err.response?.data?.detail || "AI task breakdown failed");
    } finally {
      setAiBusy(false);
    }
  };

  const addAllAITasks = async () => {
    if (!aiResult?.tasks) return;
    const today = new Date();
    for (const t of aiResult.tasks) {
      const offset = (t.estimated_days || 1) - 1;
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + offset);
      await tasksAPI.create({
        title: t.title,
        description: t.description,
        priority: t.priority || "medium",
        due_date: dueDate.toISOString().slice(0, 10),
      });
    }
    setAiModal(false);
    setAiResult(null);
    load();
  };

  const deleteTask = async (id) => {
    await tasksAPI.delete(id);
    load();
  };

  const sf = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Task Dashboard</h1>
          <p className="page-subtitle">Track progress, manage priorities, decompose projects with AI</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => setModal(true)}>+ New Task</button>
          <button className="btn btn-primary" onClick={() => { setAiModal(true); setAiResult(null); }}>✨ AI Task Breakdown</button>
        </div>
      </div>

      {/* Metrics */}
      {metrics && (
        <div className="grid-4" style={{ marginBottom: 28 }}>
          <div className="stat-card stat-accent-blue">
            <div className="stat-value">{metrics.total}</div>
            <div className="stat-label">Total tasks</div>
          </div>
          <div className="stat-card stat-accent-yellow">
            <div className="stat-value">{metrics.pending}</div>
            <div className="stat-label">Pending</div>
          </div>
          <div className="stat-card stat-accent-green">
            <div className="stat-value">{metrics.completed}</div>
            <div className="stat-label">Completed</div>
          </div>
          <div className="stat-card stat-accent-red">
            <div className="stat-value">{metrics.overdue}</div>
            <div className="stat-label">Overdue</div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {metrics?.total > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14 }}>
            <span>Completion rate</span>
            <strong style={{ color: "var(--success)" }}>{metrics.completion_rate}%</strong>
          </div>
          <div style={{ background: "var(--border)", borderRadius: 8, height: 8 }}>
            <div style={{ background: "var(--success)", width: `${metrics.completion_rate}%`, height: "100%", borderRadius: 8, transition: "width 0.5s" }} />
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {["all", "pending", "in_progress", "completed"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`btn btn-sm ${filter === f ? "btn-primary" : "btn-ghost"}`}>
            {f === "all" ? "All" : STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Task list */}
      {displayed.length === 0
        ? <div className="card" style={{ textAlign: "center", padding: "50px 20px", color: "var(--text-muted)" }}>
            <p style={{ fontSize: 16, marginBottom: 12 }}>No tasks here.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn btn-primary" onClick={() => setAiModal(true)}>✨ Break down a project with AI</button>
              <button className="btn btn-ghost" onClick={() => setModal(true)}>Add single task</button>
            </div>
          </div>
        : displayed.map(task => (
            <div key={task.task_id} className="card" style={{ marginBottom: 10, display: "flex", alignItems: "flex-start", gap: 14 }}>
              <input type="checkbox"
                checked={task.status === "completed"}
                onChange={() => setStatus(task.task_id, task.status === "completed" ? "pending" : "completed")}
                style={{ marginTop: 3, width: 16, height: 16, accentColor: "var(--success)", cursor: "pointer" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, textDecoration: task.status === "completed" ? "line-through" : "none",
                    color: task.status === "completed" ? "var(--text-muted)" : "var(--text)" }}>
                    {task.title}
                  </span>
                  <span className={`badge badge-${task.priority}`}>{task.priority}</span>
                  <span className={`badge badge-${task.status === "in_progress" ? "progress" : task.status}`}>
                    {STATUS_LABELS[task.status]}
                  </span>
                </div>
                {task.description && <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{task.description}</p>}
                {task.due_date && (
                  <p style={{ fontSize: 12, marginTop: 4,
                    color: (task.status !== "completed" && task.due_date < new Date().toISOString().slice(0, 10))
                      ? "var(--danger)" : "var(--text-muted)" }}>
                    Due: {task.due_date}
                    {task.status !== "completed" && task.due_date < new Date().toISOString().slice(0, 10) && " ⚠ Overdue"}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {task.status === "pending" && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setStatus(task.task_id, "in_progress")}>
                    ▶ Start
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => deleteTask(task.task_id)}>✕</button>
              </div>
            </div>
          ))
      }

      {/* Manual Task Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <h2 className="modal-title">New Task</h2>
            <form onSubmit={saveTask}>
              <div className="form-group"><label className="form-label">Title</label>
                <input className="form-input" value={form.title} onChange={sf("title")} required /></div>
              <div className="form-group"><label className="form-label">Description</label>
                <textarea className="form-textarea" value={form.description} onChange={sf("description")} /></div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Priority</label>
                  <select className="form-select" value={form.priority} onChange={sf("priority")}>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select></div>
                <div className="form-group"><label className="form-label">Due date</label>
                  <input type="date" className="form-input" value={form.due_date} onChange={sf("due_date")} /></div>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Task Breakdown Modal */}
      {aiModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAiModal(false)}>
          <div className="modal" style={{ maxWidth: 620 }}>
            <h2 className="modal-title">✨ AI Task & Project Breakdown</h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 20 }}>
              Enter a high-level project or complex goal and AI will generate an organized sequence of actionable subtasks.
            </p>

            {!aiResult ? (
              <form onSubmit={runAIBreakdown}>
                {aiError && <div className="alert alert-error">{aiError}</div>}

                <div className="form-group">
                  <label className="form-label">Project / Big Task Title</label>
                  <input className="form-input" placeholder="e.g. Build User Authentication, Prepare Investor Pitch, Renovate Room"
                    value={aiForm.task_title} onChange={e => setAiForm(f => ({ ...f, task_title: e.target.value }))} required />
                </div>

                <div className="form-group">
                  <label className="form-label">Context / Constraints (Optional)</label>
                  <textarea className="form-textarea" placeholder="e.g. Must finish in 5 days, focus on MVP features only..."
                    value={aiForm.context} onChange={e => setAiForm(f => ({ ...f, context: e.target.value }))} />
                </div>

                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Number of Steps</label>
                    <select className="form-select" value={aiForm.num_tasks} onChange={e => setAiForm(f => ({ ...f, num_tasks: parseInt(e.target.value) }))}>
                      <option value="3">3 Steps (Quick sprint)</option>
                      <option value="5">5 Steps (Standard)</option>
                      <option value="7">7 Steps (Detailed)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Auto-Create in Dashboard</label>
                    <select className="form-select" value={aiForm.create_all ? "yes" : "no"} onChange={e => setAiForm(f => ({ ...f, create_all: e.target.value === "yes" }))}>
                      <option value="yes">Yes, Add All Immediately</option>
                      <option value="no">Preview First</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setAiModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={aiBusy}>
                    {aiBusy ? <><span className="spinner" /> Breaking down…</> : "✨ Generate Subtasks"}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div className="alert alert-success">
                  ✅ Project broken down into {aiResult.tasks?.length || 0} subtasks! ({aiResult.ai_source || "AI Engine"})
                </div>

                {aiResult.ai_notice && (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                    💡 {aiResult.ai_notice}
                  </p>
                )}

                <h3 style={{ fontSize: 16, marginBottom: 8 }}>{aiResult.project_title}</h3>
                {aiResult.summary && <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>{aiResult.summary}</p>}

                <div style={{ maxHeight: 280, overflowY: "auto", marginBottom: 16 }}>
                  {aiResult.tasks?.map((t, idx) => (
                    <div key={idx} className="card" style={{ marginBottom: 8, background: "var(--bg-surface)", padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong style={{ fontSize: 14 }}>{idx + 1}. {t.title}</strong>
                        <span className={`badge badge-${t.priority}`}>{t.priority}</span>
                      </div>
                      {t.description && <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{t.description}</p>}
                      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                        Est. Day {t.estimated_days}
                      </p>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button className="btn btn-ghost" onClick={() => { setAiModal(false); setAiResult(null); }}>Done</button>
                  {!aiForm.create_all && (
                    <button className="btn btn-primary" onClick={addAllAITasks}>📥 Add All to Dashboard</button>
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
