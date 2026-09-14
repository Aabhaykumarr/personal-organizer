"""Medication & Care Reminders router."""

import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from services.csv_store import CSVStore
from services.auth_service import get_current_user

router = APIRouter()

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDS_CSV   = os.path.join(BASE_DIR, "..", "data", "csv", "medications.csv")


class MedCreate(BaseModel):
    patient_name:     str
    medication_name:  str
    dosage:           str
    frequency:        str = "daily"          # daily | twice_daily | weekly | custom
    times:            str = "08:00"          # pipe-sep: "08:00|20:00"
    start_date:       str = ""
    end_date:         str = ""
    notes:            str = ""


class MedUpdate(BaseModel):
    patient_name:     Optional[str] = None
    medication_name:  Optional[str] = None
    dosage:           Optional[str] = None
    frequency:        Optional[str] = None
    times:            Optional[str] = None
    start_date:       Optional[str] = None
    end_date:         Optional[str] = None
    notes:            Optional[str] = None


@router.get("/")
def list_medications(current_user: dict = Depends(get_current_user)):
    rows = CSVStore.filter_rows(MEDS_CSV, {"user_id": current_user["user_id"]})
    for r in rows:
        r["times"] = [t for t in r.get("times", "").split("|") if t]
    return rows


@router.get("/due-now")
def medications_due_now(
    window_minutes: int = 30,
    current_user: dict = Depends(get_current_user),
):
    """
    Returns medications whose next dose falls within ±window_minutes of now.
    Frontend can poll this every minute to drive in-browser alerts.
    """
    now  = datetime.now(timezone.utc)
    h_m  = now.strftime("%H:%M")
    today = now.strftime("%Y-%m-%d")

    rows = CSVStore.filter_rows(MEDS_CSV, {"user_id": current_user["user_id"]})
    due  = []

    for med in rows:
        # Skip if outside date range
        if med.get("start_date") and today < med["start_date"]:
            continue
        if med.get("end_date") and today > med["end_date"]:
            continue

        times_list = [t for t in med.get("times", "").split("|") if t]
        for t in times_list:
            try:
                dose_h, dose_m = map(int, t.split(":"))
                now_minutes  = now.hour * 60 + now.minute
                dose_minutes = dose_h * 60 + dose_m
                diff = abs(now_minutes - dose_minutes)
                if diff <= window_minutes:
                    due.append({**med, "due_at": t, "times": times_list})
                    break
            except ValueError:
                continue

    return due


@router.post("/", status_code=201)
def create_medication(body: MedCreate, current_user: dict = Depends(get_current_user)):
    return CSVStore.insert(MEDS_CSV, {
        **body.model_dump(),
        "user_id":      current_user["user_id"],
        "last_reminded": "",
    })


@router.patch("/{med_id}")
def update_medication(
    med_id: str,
    body: MedUpdate,
    current_user: dict = Depends(get_current_user),
):
    med = CSVStore.find_one(MEDS_CSV, {"med_id": med_id, "user_id": current_user["user_id"]})
    if not med:
        raise HTTPException(404, "Medication not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    return CSVStore.update(MEDS_CSV, "med_id", med_id, updates)


@router.delete("/{med_id}", status_code=204)
def delete_medication(med_id: str, current_user: dict = Depends(get_current_user)):
    med = CSVStore.find_one(MEDS_CSV, {"med_id": med_id, "user_id": current_user["user_id"]})
    if not med:
        raise HTTPException(404, "Medication not found")
    CSVStore.delete(MEDS_CSV, "med_id", med_id)
