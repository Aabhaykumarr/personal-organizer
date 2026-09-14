# Personal Organizer — Local-First Productivity App

100% local. No cloud. No database. All data stored in CSV files.

---

## Project Structure

```
personal-organizer/
├── backend/
│   ├── main.py                   # FastAPI app entry point
│   ├── requirements.txt
│   ├── .env.example              # Copy → .env and fill in secrets
│   ├── routers/
│   │   ├── auth.py               # Login / Signup (bcrypt + JWT)
│   │   ├── notes.py              # Notes + file uploads
│   │   ├── schedules.py          # Calendar events + Goals
│   │   ├── tasks.py              # Task dashboard + metrics
│   │   ├── medications.py        # Elderly care reminders
│   │   └── ai_planner.py         # AI goal → action plan
│   └── services/
│       ├── csv_store.py          # Thread-safe CSV engine (core)
│       └── auth_service.py       # JWT + bcrypt helpers
│
├── frontend/
│   ├── package.json
│   └── src/
│       ├── App.js                # Router + protected shell
│       ├── index.css             # Full design system
│       ├── api/client.js         # Axios + all API helpers
│       ├── hooks/useAuth.js      # Auth context
│       └── pages/
│           ├── LoginPage.js
│           ├── SignupPage.js
│           ├── NotesPage.js      # Interface 1
│           ├── SchedulePage.js   # Interface 2 (+ AI planner)
│           ├── TasksPage.js      # Interface 3
│           └── MedsPage.js       # Interface 3 (reminders)
│
├── data/
│   ├── csv/                      # All .csv data files (auto-created)
│   └── uploads/
│       ├── images/
│       ├── documents/
│       └── media/
│
├── start.sh                      # One-command start script
└── README.md
```

---

## Quick Start

### 1. Configure environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — set SECRET_KEY, and AI settings
```

### 2. Run everything

```bash
bash start.sh
```

Or manually:

```bash
# Terminal 1 — Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm install && npm start
```

Open **http://localhost:3000** in your browser.

API docs: **http://localhost:8000/docs**

---

## AI Goal Planner Setup

### Option A: OpenAI

In `backend/.env`:
```
AI_BACKEND=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

### Option B: Ollama (fully local, no API key)

1. Install Ollama: https://ollama.com
2. Pull a model: `ollama pull llama3`
3. In `backend/.env`:
```
AI_BACKEND=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3
```

---

## CSV Data Files

| File               | Contents                            |
|--------------------|-------------------------------------|
| `users.csv`        | Users (bcrypt-hashed passwords)     |
| `notes.csv`        | Notes + file attachment paths       |
| `schedules.csv`    | Calendar events                     |
| `goals.csv`        | Goals + AI plan JSON                |
| `tasks.csv`        | Tasks with status/priority          |
| `medications.csv`  | Medication schedules + dosages      |

All files are in `data/csv/`. Back them up with a simple `cp -r data/ backup/`.

---

## Key Design Decisions

| Concern           | Solution                                                                 |
|-------------------|--------------------------------------------------------------------------|
| Concurrency       | Per-file `threading.Lock` + atomic write (tmp→rename)                   |
| Authentication    | `bcrypt` password hashing, `python-jose` JWT (24h expiry)               |
| File uploads      | Multipart form, classified into images/documents/media subdirs          |
| Medication alerts | Backend `/due-now` endpoint polled every 60s; browser Notifications API |
| AI plan storage   | JSON stringified into `goals.csv:ai_plan` column                         |

---

## Adding New Features

To add a new data type:
1. Add schema to `SCHEMAS` in `services/csv_store.py`
2. Create a router in `routers/`
3. Register it in `main.py`
4. Add a page in `frontend/src/pages/`
5. Add a link in `App.js` sidebar
