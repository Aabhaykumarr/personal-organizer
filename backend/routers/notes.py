"""Notes & media repository router."""

import os
import shutil
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from services.csv_store import CSVStore
from services.auth_service import get_current_user

router = APIRouter()

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOTES_CSV  = os.path.join(BASE_DIR, "..", "data", "csv", "notes.csv")
UPLOAD_DIR = os.path.join(BASE_DIR, "..", "data", "uploads")

ALLOWED_EXTS = {
    "images":    {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"},
    "documents": {".pdf", ".txt", ".md", ".docx", ".xlsx"},
    "media":     {".mp4", ".mp3", ".wav", ".ogg"},
}


def _classify_file(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    for folder, exts in ALLOWED_EXTS.items():
        if ext in exts:
            return folder
    return "documents"  # default bucket


# ── Models ────────────────────────────────────────────────────────────────────
class NoteUpdate(BaseModel):
    title:   Optional[str] = None
    content: Optional[str] = None
    tags:    Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.get("/")
def list_notes(current_user: dict = Depends(get_current_user)):
    rows = CSVStore.filter_rows(NOTES_CSV, {"user_id": current_user["user_id"]})
    # Parse file_paths back to list
    for r in rows:
        r["file_paths"] = [p for p in r.get("file_paths", "").split("|") if p]
    return rows


@router.post("/", status_code=201)
async def create_note(
    title:   str       = Form(...),
    content: str       = Form(""),
    tags:    str       = Form(""),          # comma-separated
    files:   list[UploadFile] = File([]),
    current_user: dict = Depends(get_current_user),
):
    saved_paths: list[str] = []

    for upload in files:
        folder = _classify_file(upload.filename)
        ext    = os.path.splitext(upload.filename)[1].lower()
        fname  = f"{uuid.uuid4()}{ext}"
        dest   = os.path.join(UPLOAD_DIR, folder, fname)

        with open(dest, "wb") as out:
            shutil.copyfileobj(upload.file, out)

        # Store as a URL path accessible via /uploads/...
        saved_paths.append(f"/uploads/{folder}/{fname}")

    note = CSVStore.insert(NOTES_CSV, {
        "user_id":    current_user["user_id"],
        "title":      title,
        "content":    content,
        "tags":       tags,
        "file_paths": "|".join(saved_paths),
        "updated_at": "",
    })
    note["file_paths"] = saved_paths
    return note


@router.get("/{note_id}")
def get_note(note_id: str, current_user: dict = Depends(get_current_user)):
    note = CSVStore.find_one(NOTES_CSV, {"note_id": note_id, "user_id": current_user["user_id"]})
    if not note:
        raise HTTPException(404, "Note not found")
    note["file_paths"] = [p for p in note.get("file_paths", "").split("|") if p]
    return note


@router.patch("/{note_id}")
def update_note(
    note_id: str,
    body: NoteUpdate,
    current_user: dict = Depends(get_current_user),
):
    note = CSVStore.find_one(NOTES_CSV, {"note_id": note_id, "user_id": current_user["user_id"]})
    if not note:
        raise HTTPException(404, "Note not found")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updated = CSVStore.update(NOTES_CSV, "note_id", note_id, updates)
    return updated


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: str, current_user: dict = Depends(get_current_user)):
    note = CSVStore.find_one(NOTES_CSV, {"note_id": note_id, "user_id": current_user["user_id"]})
    if not note:
        raise HTTPException(404, "Note not found")
    # Optionally delete physical files too
    for path in note.get("file_paths", "").split("|"):
        if path:
            disk_path = os.path.join(BASE_DIR, "..", "data", path.lstrip("/"))
            if os.path.exists(disk_path):
                os.remove(disk_path)
    CSVStore.delete(NOTES_CSV, "note_id", note_id)
