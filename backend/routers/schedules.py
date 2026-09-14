"""Schedules & Goals router."""

import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from services.csv_store import CSVStore
from services.auth_service import get_current_user

router = APIRouter()

BASE_DIR       = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEDULES_CSV  = os.path.join(BASE_DIR, "..", "data", "csv", "schedules.csv")
GOALS_CSV      = os.path.join(BASE_DIR, "..", "data", "csv", "goals.csv")


# ── Pydantic models ───────────────────────────────────────────────────────────
class ScheduleCreate(BaseModel):
    title:       str
    description: str = ""
    date:        str          # YYYY-MM-DD
    time_start:  str = ""     # HH:MM
    time_end:    str = ""
    recurrence:  str = "none" # none | daily | weekly | monthly
    goal_id:     str = ""


class GoalCreate(BaseModel):
    title:       str
    description: str = ""
    target_date: str = ""     # YYYY-MM-DD
    status:      str = "active"


class GoalUpdate(BaseModel):
    title:       Optional[str] = None
    description: Optional[str] = None
    target_date: Optional[str] = None
    status:      Optional[str] = None
    ai_plan:     Optional[str] = None


# ── Schedule endpoints ────────────────────────────────────────────────────────
@router.get("/")
def list_schedules(
    month: Optional[str] = None,   # YYYY-MM filter
    current_user: dict = Depends(get_current_user),
):
    rows = CSVStore.filter_rows(SCHEDULES_CSV, {"user_id": current_user["user_id"]})
    if month:
        rows = [r for r in rows if r.get("date", "").startswith(month)]
    return sorted(rows, key=lambda r: (r.get("date", ""), r.get("time_start", "")))


@router.post("/", status_code=201)
def create_schedule(body: ScheduleCreate, current_user: dict = Depends(get_current_user)):
    return CSVStore.insert(SCHEDULES_CSV, {
        **body.model_dump(),
        "user_id": current_user["user_id"],
    })


@router.delete("/{schedule_id}", status_code=204)
def delete_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
    row = CSVStore.find_one(SCHEDULES_CSV, {"schedule_id": schedule_id, "user_id": current_user["user_id"]})
    if not row:
        raise HTTPException(404, "Schedule not found")
    CSVStore.delete(SCHEDULES_CSV, "schedule_id", schedule_id)


# ── Goal endpoints ────────────────────────────────────────────────────────────
@router.get("/goals")
def list_goals(current_user: dict = Depends(get_current_user)):
    return CSVStore.filter_rows(GOALS_CSV, {"user_id": current_user["user_id"]})


@router.post("/goals", status_code=201)
def create_goal(body: GoalCreate, current_user: dict = Depends(get_current_user)):
    return CSVStore.insert(GOALS_CSV, {
        **body.model_dump(),
        "user_id": current_user["user_id"],
        "ai_plan": "",
    })


@router.patch("/goals/{goal_id}")
def update_goal(
    goal_id: str,
    body: GoalUpdate,
    current_user: dict = Depends(get_current_user),
):
    goal = CSVStore.find_one(GOALS_CSV, {"goal_id": goal_id, "user_id": current_user["user_id"]})
    if not goal:
        raise HTTPException(404, "Goal not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    return CSVStore.update(GOALS_CSV, "goal_id", goal_id, updates)


@router.delete("/goals/{goal_id}", status_code=204)
def delete_goal(goal_id: str, current_user: dict = Depends(get_current_user)):
    goal = CSVStore.find_one(GOALS_CSV, {"goal_id": goal_id, "user_id": current_user["user_id"]})
    if not goal:
        raise HTTPException(404, "Goal not found")
    CSVStore.delete(GOALS_CSV, "goal_id", goal_id)
