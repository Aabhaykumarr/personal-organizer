import { useState, useEffect, useRef } from "react";
import { notesAPI, aiAPI } from "../api/client";

export default function NotesPage() {
  const [notes,       setNotes]       = useState([]);
  const [search,      setSearch]      = useState("");
  const [loading,     setLoading]     = useState(true);
  const [modal,       setModal]       = useState(false);       // create manual
  const [aiModal,     setAiModal]     = useState(false);       // AI note creator
  const [aiResult,    setAiResult]    = useState(null);
  const [aiBusy,      setAiBusy]      = useState(false);
  const [aiError,     setAiError]     = useState("");
  const [view,        setView]        = useState(null);         // view detail
  const [error,       setError]       = useState("");
  const fileRef = useRef();

  const [form, setForm] = useState({ title: "", content: "", tags: "" });
  const [aiForm, setAiForm] = useState({ topic: "", note_type: "general", details: "", save_now: false });

  const load = async () => {
    try {
      const { data } = await notesAPI.list();
      setNotes(data);
    } catch { setError("Failed to load notes"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = notes.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.content.toLowerCase().includes(search.toLowerCase()) ||
    n.tags.toLowerCase().includes(search.toLowerCase())
  );

  const submitManual = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("title",   form.title);
    fd.append("content", form.content);
    fd.append("tags",    form.tags);
    Array.from(fileRef.current?.files || []).forEach(f => fd.append("files", f));
    try {
      await notesAPI.create(fd);
      setModal(false);
      setForm({ title: "", content: "", tags: "" });
      load();
    } catch { setError("Failed to save note"); }
  };

  const runAINote = async (e) => {
    e.preventDefault();
    setAiBusy(true); setAiError(""); setAiResult(null);
    try {
      const { data } = await aiAPI.generateNote(aiForm);
      setAiResult(data);
      if (aiForm.save_now) {
        load();
      }
    } catch (err) {
      setAiError(err.response?.data?.detail || "AI generation failed");
    } finally {
      setAiBusy(false);
    }
  };

  const saveAiResultDirectly = async () => {
    if (!aiResult) return;
    const fd = new FormData();
    fd.append("title",   aiResult.title || aiForm.topic);
    fd.append("content", aiResult.content || "");
    fd.append("tags",    aiResult.tags || "");
    await notesAPI.create(fd);
    setAiModal(false);
    setAiResult(null);
    setAiForm({ topic: "", note_type: "general", details: "", save_now: false });
    load();
  };

  const deleteNote = async (id) => {
    if (!window.confirm("Delete this note?")) return;
    await notesAPI.delete(id);
    setView(null);
    load();
  };

  if (loading) return <div style={{ textAlign:"center", padding:60 }}><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Notes & Media</h1>
          <p className="page-subtitle">{notes.length} saved items — with AI writing assistant</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => setModal(true)}>+ New Note</button>
          <button className="btn btn-primary" onClick={() => { setAiModal(true); setAiResult(null); }}>✨ AI Generate Note</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <input
        className="form-input" placeholder="Search notes, tags..."
        value={search} onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 20, maxWidth: 360 }}
      />

      {filtered.length === 0
        ? <div className="card" style={{ textAlign: "center", padding: "50px 20px", color: "var(--text-muted)" }}>
            <p style={{ fontSize: 16, marginBottom: 12 }}>No notes yet.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn btn-primary" onClick={() => setAiModal(true)}>✨ Generate with AI</button>
              <button className="btn btn-ghost" onClick={() => setModal(true)}>Create manually</button>
            </div>
          </div>
        : <div className="note-grid">
            {filtered.map(n => (
              <div key={n.note_id} className="card note-card" onClick={() => setView(n)}>
                <div className="note-card-title">{n.title}</div>
                <div className="note-card-excerpt">{n.content.slice(0, 130)}{n.content.length > 130 ? "…" : ""}</div>
                {n.file_paths?.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
                    📎 {n.file_paths.length} attachment{n.file_paths.length !== 1 ? "s" : ""}
                  </div>
                )}
                {n.tags && (
                  <div className="note-tags">
                    {n.tags.split(",").filter(Boolean).map(t => (
                      <span key={t} className="note-tag">{t.trim()}</span>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
                  {new Date(n.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
      }

      {/* Manual Create Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <h2 className="modal-title">New Note</h2>
            <form onSubmit={submitManual}>
              <div className="form-group">
                <label className="form-label">Title</label>
                <input className="form-input" value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Content</label>
                <textarea className="form-textarea" value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))} style={{ minHeight: 120 }} />
              </div>
              <div className="form-group">
                <label className="form-label">Tags (comma-separated)</label>
                <input className="form-input" placeholder="work, ideas, health" value={form.tags}
                  onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Attachments (images, docs, media)</label>
                <input type="file" ref={fileRef} multiple
                  style={{ color: "var(--text-muted)", fontSize: 13 }} />
              </div>
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Note</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Generate Note Modal */}
      {aiModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAiModal(false)}>
          <div className="modal" style={{ maxWidth: 620 }}>
            <h2 className="modal-title">✨ AI Note Assistant</h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 20 }}>
              Generate comprehensive structured notes, meeting summaries, study guides, or master checklists.
            </p>

            {!aiResult ? (
              <form onSubmit={runAINote}>
                {aiError && <div className="alert alert-error">{aiError}</div>}

                <div className="form-group">
                  <label className="form-label">Topic or Title</label>
                  <input className="form-input" placeholder="e.g. Q4 Marketing Strategy, Machine Learning Basics, Weekly Review"
                    value={aiForm.topic} onChange={e => setAiForm(f => ({ ...f, topic: e.target.value }))} required />
                </div>

                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Format / Note Type</label>
                    <select className="form-select" value={aiForm.note_type} onChange={e => setAiForm(f => ({ ...f, note_type: e.target.value }))}>
                      <option value="general">General / Reference</option>
                      <option value="meeting">Meeting Summary & Action Items</option>
                      <option value="project">Project Scope & Roadmap</option>
                      <option value="study">Study Guide & Core Concepts</option>
                      <option value="checklist">Master Checklist</option>
                      <option value="journal">Daily Reflection & Journal</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Auto-Save directly to Notes</label>
                    <select className="form-select" value={aiForm.save_now ? "yes" : "no"} onChange={e => setAiForm(f => ({ ...f, save_now: e.target.value === "yes" }))}>
                      <option value="no">Preview First</option>
                      <option value="yes">Save Immediately</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Key Points / Context (Optional)</label>
                  <textarea className="form-textarea" placeholder="Add specific bullet points, attendees, constraints, or topics to cover..."
                    value={aiForm.details} onChange={e => setAiForm(f => ({ ...f, details: e.target.value }))} />
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setAiModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={aiBusy}>
                    {aiBusy ? <><span className="spinner" /> Generating…</> : "✨ Generate Note"}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div className="alert alert-success">
                  ✅ Note generated successfully! ({aiResult.ai_source || "AI Engine"})
                </div>

                {aiResult.ai_notice && (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                    💡 {aiResult.ai_notice}
                  </p>
                )}

                <div className="card" style={{ marginBottom: 16, background: "var(--bg-surface)" }}>
                  <h3 style={{ fontSize: 17, marginBottom: 8, color: "var(--accent)" }}>{aiResult.title}</h3>
                  <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6, maxHeight: 280, overflowY: "auto" }}>
                    {aiResult.content}
                  </div>
                  {aiResult.tags && (
                    <div className="note-tags" style={{ marginTop: 12 }}>
                      {aiResult.tags.split(",").map(t => <span key={t} className="note-tag">{t.trim()}</span>)}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button className="btn btn-ghost" onClick={() => setAiResult(null)}>🔄 Regenerate</button>
                  <button className="btn btn-primary" onClick={saveAiResultDirectly}>📥 Save to Notes</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* View Detail Modal */}
      {view && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setView(null)}>
          <div className="modal" style={{ maxWidth: 620 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"start", marginBottom: 16 }}>
              <h2 className="modal-title" style={{ margin:0 }}>{view.title}</h2>
              <button className="btn btn-danger btn-sm" onClick={() => deleteNote(view.note_id)}>Delete</button>
            </div>
            {view.tags && (
              <div className="note-tags" style={{ marginBottom: 12 }}>
                {view.tags.split(",").filter(Boolean).map(t => <span key={t} className="note-tag">{t.trim()}</span>)}
              </div>
            )}
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, marginBottom: 16, fontSize: 14 }}>{view.content}</div>
            {view.file_paths?.length > 0 && (
              <div>
                <p className="form-label" style={{ marginBottom: 8 }}>Attachments</p>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {view.file_paths.map(fp => {
                    const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fp);
                    return isImage
                      ? <img key={fp} src={fp} alt="" style={{ maxWidth:160, borderRadius:6 }} />
                      : <a key={fp} href={fp} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">📄 {fp.split("/").pop()}</a>;
                  })}
                </div>
              </div>
            )}
            <p style={{ fontSize:12, color:"var(--text-muted)", marginTop:16 }}>
              Created {new Date(view.created_at).toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
