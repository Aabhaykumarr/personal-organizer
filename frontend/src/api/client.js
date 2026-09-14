import axios from "axios";

const api = axios.create({ baseURL: "/api" });

// Inject JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;

// ── Named API helpers ──────────────────────────────────────────────────────
export const authAPI = {
  signup:  (data) => api.post("/auth/signup", data),
  login:   (data) => api.post("/auth/login", data),
  me:      ()     => api.get("/auth/me"),
};

export const notesAPI = {
  list:   ()           => api.get("/notes/"),
  get:    (id)         => api.get(`/notes/${id}`),
  create: (formData)   => api.post("/notes/", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  update: (id, data)   => api.patch(`/notes/${id}`, data),
  delete: (id)         => api.delete(`/notes/${id}`),
};

export const schedulesAPI = {
  list:         (month)      => api.get("/schedules/", { params: { month } }),
  create:       (data)       => api.post("/schedules/", data),
  delete:       (id)         => api.delete(`/schedules/${id}`),
  listGoals:    ()           => api.get("/schedules/goals"),
  createGoal:   (data)       => api.post("/schedules/goals", data),
  updateGoal:   (id, data)   => api.patch(`/schedules/goals/${id}`, data),
  deleteGoal:   (id)         => api.delete(`/schedules/goals/${id}`),
};

export const tasksAPI = {
  list:    (status) => api.get("/tasks/", { params: { status } }),
  metrics: ()       => api.get("/tasks/metrics"),
  create:  (data)   => api.post("/tasks/", data),
  update:  (id, d)  => api.patch(`/tasks/${id}`, d),
  delete:  (id)     => api.delete(`/tasks/${id}`),
};

export const medsAPI = {
  list:    ()          => api.get("/medications/"),
  dueNow:  (window)    => api.get("/medications/due-now", { params: { window_minutes: window } }),
  create:  (data)      => api.post("/medications/", data),
  update:  (id, data)  => api.patch(`/medications/${id}`, data),
  delete:  (id)        => api.delete(`/medications/${id}`),
};

export const aiAPI = {
  planGoal:           (data) => api.post("/ai/plan-goal", data),
  generateNote:       (data) => api.post("/ai/generate-note", data),
  breakdownTask:      (data) => api.post("/ai/breakdown-task", data),
  suggestMedSchedule: (data) => api.post("/ai/suggest-med-schedule", data),
  planDay:            (data) => api.post("/ai/plan-day", data),
  generateSummary:    ()     => api.post("/ai/generate-summary"),
  exportSummaryPDF:   ()     => api.post("/ai/export-summary-pdf", {}, { responseType: "blob" }),
  getStatus:          ()     => api.get("/ai/status"),
};
