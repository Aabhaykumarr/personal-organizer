"""Task Dashboard router."""

import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from services.csv_store import CSVStore
from services.auth_service import get_current_user

router = APIRouter()

BASE_DIR  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TASKS_CSV = os.path.join(BASE_DIR, "..", "data", "csv", "tasks.csv")


class TaskCreate(BaseModel):
    title:       str
    description: str = ""
    priority:    str = "medium"   # low | medium | high
    due_date:    str = ""
    schedule_id: str = ""
    goal_id:     str = ""


class TaskUpdate(BaseModel):
    title:       Optional[str] = None
    description: Optional[str] = None
    status:      Optional[str] = None  # pending | in_progress | completed
    priority:    Optional[str] = None
    due_date:    Optional[str] = None


@router.get("/")
def list_tasks(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    rows = CSVStore.filter_rows(TASKS_CSV, {"user_id": current_user["user_id"]})
    if status:
        rows = [r for r in rows if r.get("status") == status]
    return rows


@router.get("/metrics")
def task_metrics(current_user: dict = Depends(get_current_user)):
    """Achievement metrics for the dashboard."""
    rows = CSVStore.filter_rows(TASKS_CSV, {"user_id": current_user["user_id"]})
    total     = len(rows)
    completed = sum(1 for r in rows if r.get("status") == "completed")
    pending   = sum(1 for r in rows if r.get("status") == "pending")
    in_prog   = sum(1 for r in rows if r.get("status") == "in_progress")
    overdue   = sum(
        1 for r in rows
        if r.get("status") != "completed"
        and r.get("due_date")
        and r["due_date"] < datetime.now(timezone.utc).strftime("%Y-%m-%d")
    )
    return {
        "total":       total,
        "completed":   completed,
        "pending":     pending,
        "in_progress": in_prog,
        "overdue":     overdue,
        "completion_rate": round(completed / total * 100, 1) if total else 0,
    }


@router.post("/", status_code=201)
def create_task(body: TaskCreate, current_user: dict = Depends(get_current_user)):
    return CSVStore.insert(TASKS_CSV, {
        **body.model_dump(),
        "user_id":     current_user["user_id"],
        "status":      "pending",
        "completed_at": "",
    })


@router.patch("/{task_id}")
def update_task(
    task_id: str,
    body: TaskUpdate,
    current_user: dict = Depends(get_current_user),
):
    task = CSVStore.find_one(TASKS_CSV, {"task_id": task_id, "user_id": current_user["user_id"]})
    if not task:
        raise HTTPException(404, "Task not found")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}

    # Auto-stamp completion time
    if updates.get("status") == "completed" and task.get("status") != "completed":
        updates["completed_at"] = datetime.now(timezone.utc).isoformat()

    return CSVStore.update(TASKS_CSV, "task_id", task_id, updates)


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: str, current_user: dict = Depends(get_current_user)):
    task = CSVStore.find_one(TASKS_CSV, {"task_id": task_id, "user_id": current_user["user_id"]})
    if not task:
        raise HTTPException(404, "Task not found")
    CSVStore.delete(TASKS_CSV, "task_id", task_id)
