"""Authentication router — signup / login / me."""

import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr

from services.csv_store import CSVStore
from services.auth_service import (
    hash_password, verify_password, create_access_token, get_current_user
)
from fastapi import Depends

router = APIRouter()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USERS_CSV = os.path.join(BASE_DIR, "..", "data", "csv", "users.csv")


# ── Pydantic models ───────────────────────────────────────────────────────────
class SignupRequest(BaseModel):
    username: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.post("/signup", status_code=201)
def signup(body: SignupRequest):
    # Check username uniqueness
    existing = CSVStore.find_one(USERS_CSV, {"username": body.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    existing_email = CSVStore.find_one(USERS_CSV, {"email": body.email})
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = CSVStore.insert(USERS_CSV, {
        "username":      body.username,
        "email":         body.email,
        "password_hash": hash_password(body.password),
        "last_login":    "",
    })

    token = create_access_token({"sub": user["user_id"], "username": user["username"]})
    return {"access_token": token, "token_type": "bearer", "user": _safe(user)}


@router.post("/login")
def login(body: LoginRequest):
    user = CSVStore.find_one(USERS_CSV, {"username": body.username})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Update last_login
    CSVStore.update(USERS_CSV, "user_id", user["user_id"],
                    {"last_login": datetime.now(timezone.utc).isoformat()})

    token = create_access_token({"sub": user["user_id"], "username": user["username"]})
    return {"access_token": token, "token_type": "bearer", "user": _safe(user)}


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    user = CSVStore.find_one(USERS_CSV, {"user_id": current_user["user_id"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _safe(user)


def _safe(user: dict) -> dict:
    """Strip password hash before returning to client."""
    return {k: v for k, v in user.items() if k != "password_hash"}
