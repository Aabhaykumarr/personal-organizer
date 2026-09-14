"""
Personal Organizer - FastAPI Backend & Unified Fullstack Server
CSV-based local storage, no external databases.
"""

from dotenv import load_dotenv
load_dotenv()  # Load .env before anything reads os.getenv()

import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from routers import auth, notes, schedules, tasks, medications, ai_planner
from services.csv_store import CSVStore

# ── Bootstrap data directory ──────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "..", "data")
CSV_DIR  = os.path.join(DATA_DIR, "csv")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
FRONTEND_BUILD = os.path.join(BASE_DIR, "..", "frontend", "build")

for d in [CSV_DIR, UPLOAD_DIR,
          os.path.join(UPLOAD_DIR, "images"),
          os.path.join(UPLOAD_DIR, "documents"),
          os.path.join(UPLOAD_DIR, "media")]:
    os.makedirs(d, exist_ok=True)

# ── Initialise CSV files with headers if they don't exist ────────────────────
CSVStore.bootstrap(CSV_DIR)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Personal Organizer API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded media files statically
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# ── API Routers ───────────────────────────────────────────────────────────────
app.include_router(auth.router,        prefix="/api/auth",        tags=["Auth"])
app.include_router(notes.router,       prefix="/api/notes",       tags=["Notes"])
app.include_router(schedules.router,   prefix="/api/schedules",   tags=["Schedules"])
app.include_router(tasks.router,       prefix="/api/tasks",       tags=["Tasks"])
app.include_router(medications.router, prefix="/api/medications", tags=["Medications"])
app.include_router(ai_planner.router,  prefix="/api/ai",          tags=["AI Planner"])

@app.get("/api/health")
def health():
    return {"status": "ok", "app": "Personal Organizer"}

# ── Serve Built React Frontend in Production (Single-Service Deployment) ───────
if os.path.exists(FRONTEND_BUILD):
    # Serve static assets (JS, CSS, Media)
    static_dir = os.path.join(FRONTEND_BUILD, "static")
    if os.path.exists(static_dir):
        app.mount("/static", StaticFiles(directory=static_dir), name="static")

    # Serve React SPA index.html for all non-API routes
    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        file_path = os.path.join(FRONTEND_BUILD, full_path)
        if full_path and os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_BUILD, "index.html"))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
