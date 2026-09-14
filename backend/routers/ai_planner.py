"""
AI Assistant & Multi-Feature Planner router.

Supports four operating modes:
  1. Groq Cloud (Ultra-fast inference with LLaMA 3.3 70B & 8B via GROQ_API_KEY)
  2. OpenAI API (when OPENAI_API_KEY is configured)
  3. Local Ollama (when AI_BACKEND=ollama and Ollama is running)
  4. Smart Local AI Engine (Built-in offline fallback that generates
     realistic, tailored structured plans, notes, tasks, and care routines
     instantly without requiring an external API key or network connection).
"""

import json
import os
import re
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Any, Callable

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from services.csv_store import CSVStore
from services.auth_service import get_current_user
from services.pdf_report import generate_executive_pdf

router = APIRouter()

BASE_DIR  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GOALS_CSV = os.path.join(BASE_DIR, "..", "data", "csv", "goals.csv")
TASKS_CSV = os.path.join(BASE_DIR, "..", "data", "csv", "tasks.csv")
SCHED_CSV = os.path.join(BASE_DIR, "..", "data", "csv", "schedules.csv")
NOTES_CSV = os.path.join(BASE_DIR, "..", "data", "csv", "notes.csv")
MEDS_CSV  = os.path.join(BASE_DIR, "..", "data", "csv", "medications.csv")


def _is_placeholder_key(key: str) -> bool:
    if not key:
        return True
    placeholders = ["sk-REPLACE_WITH_YOUR_KEY", "sk-...", "your-key-here", "change-me", "gsk_your_groq_api_key_here"]
    return any(p in key for p in placeholders) or len(key) < 20


def _get_ai_config():
    backend = os.getenv("AI_BACKEND", "").lower().strip()
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()

    # Auto-detect Groq keys (starting with gsk_) even if placed in OPENAI_API_KEY
    if openai_key.startswith("gsk_") and not groq_key:
        groq_key = openai_key
        openai_key = ""
        backend = "groq"

    # If backend not explicitly set, auto-select based on key
    if not backend:
        if groq_key and not _is_placeholder_key(groq_key):
            backend = "groq"
        elif openai_key and not _is_placeholder_key(openai_key):
            backend = "openai"
        else:
            backend = "local"

    return {
        "backend": backend,
        "groq_key": groq_key,
        "groq_model": os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
        "openai_key": openai_key,
        "openai_model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        "ollama_host": os.getenv("OLLAMA_HOST", "http://localhost:11434"),
        "ollama_model": os.getenv("OLLAMA_MODEL", "llama3"),
    }


# ── AI Calling Engine with Graceful Fallback ──────────────────────────────────
async def _execute_ai_json(prompt: str, system_prompt: str, fallback_fn: Callable[[], dict]) -> dict:
    """
    Executes JSON completion via Groq, OpenAI, or Ollama.
    If unavailable, key invalid, or network error occurs, seamlessly falls back
    to the Smart Local AI Engine without interrupting the user.
    """
    cfg = _get_ai_config()

    # 1. Try Calling Groq
    if cfg["backend"] == "groq" or (cfg["groq_key"] and not _is_placeholder_key(cfg["groq_key"])):
        if not _is_placeholder_key(cfg["groq_key"]):
            models_to_try = [cfg["groq_model"], "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
            # Deduplicate preserving order
            models_to_try = list(dict.fromkeys(models_to_try))
            from openai import AsyncOpenAI
            client = AsyncOpenAI(
                api_key=cfg["groq_key"],
                base_url="https://api.groq.com/openai/v1",
                timeout=30.0
            )
            for m in models_to_try:
                try:
                    response = await client.chat.completions.create(
                        model=m,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": prompt},
                        ],
                        temperature=0.6,
                        response_format={"type": "json_object"},
                    )
                    raw = response.choices[0].message.content or "{}"
                    data = json.loads(raw)
                    data["ai_source"] = f"groq ({m})"
                    return data
                except Exception as exc:
                    print(f"[AI] Groq call with model '{m}' failed: {exc}")
                    continue

    # 2. Try Calling OpenAI
    if cfg["backend"] == "openai" or (cfg["openai_key"] and not _is_placeholder_key(cfg["openai_key"])):
        if not _is_placeholder_key(cfg["openai_key"]):
            try:
                from openai import AsyncOpenAI
                client = AsyncOpenAI(api_key=cfg["openai_key"], timeout=30.0)
                response = await client.chat.completions.create(
                    model=cfg["openai_model"],
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.7,
                    response_format={"type": "json_object"},
                )
                raw = response.choices[0].message.content or "{}"
                data = json.loads(raw)
                data["ai_source"] = f"openai ({cfg['openai_model']})"
                return data
            except Exception as exc:
                print(f"[AI] OpenAI call failed ({type(exc).__name__}): {exc}. Falling back to smart local engine.")

    # 3. Try Calling Ollama
    if cfg["backend"] == "ollama":
        try:
            full_prompt = f"{system_prompt}\n\nUser request: {prompt}\n\nRespond with JSON only."
            async with httpx.AsyncClient(timeout=45) as client:
                resp = await client.post(
                    f"{cfg['ollama_host']}/api/generate",
                    json={
                        "model": cfg["ollama_model"],
                        "prompt": full_prompt,
                        "stream": False,
                        "format": "json",
                    },
                )
            if resp.status_code == 200:
                raw = resp.json().get("response", "{}")
                data = json.loads(raw)
                data["ai_source"] = f"ollama ({cfg['ollama_model']})"
                return data
        except Exception:
            pass

    # 4. Fallback if cloud/local LLMs unavailable
    res = fallback_fn()
    res["ai_source"] = "smart_local_engine"
    res["ai_notice"] = "Generated via Smart Local AI Engine."
    return res


# ══════════════════════════════════════════════════════════════════════════════
# 1. AI GOAL & SCHEDULE PLANNER
# ══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT_GOAL = """
You are a structured goal and productivity planner.
Respond ONLY with a valid JSON object matching:
{
  "summary": "One-sentence overview of the plan",
  "daily_tasks": [
    {"day": 1, "title": "...", "description": "...", "duration_minutes": 30}
  ],
  "monthly_milestones": [
    {"month": 1, "title": "...", "description": "..."}
  ],
  "tips": ["tip1", "tip2"]
}
daily_tasks: up to 14 tasks (first 2 weeks). Keep titles concise (<60 chars).
""".strip()


class PlanRequest(BaseModel):
    goal_id:         Optional[str] = None
    goal_title:      str
    description:     str = ""
    timeframe:       str = "3 months"
    start_date:      str = ""
    schedule_events: bool = False


def _fallback_plan_goal(title: str, desc: str, timeframe: str) -> dict:
    t = title.strip()
    return {
        "summary": f"Structured action plan for '{t}' tailored over {timeframe}.",
        "daily_tasks": [
            {"day": 1, "title": f"Initial Assessment & Setup for {t}", "description": "Review baseline, define measurable KPIs, gather tools.", "duration_minutes": 45},
            {"day": 2, "title": "Environment & Resource Preparation", "description": "Organize dedicated workspace, study materials, or equipment required.", "duration_minutes": 30},
            {"day": 3, "title": "Foundation Phase - Core Fundamentals", "description": f"Focus on foundational principles of {t}.", "duration_minutes": 60},
            {"day": 4, "title": "Practice Session 1", "description": "Apply fundamental concepts through hands-on exercises.", "duration_minutes": 45},
            {"day": 5, "title": "Intermediate Deep Dive", "description": "Expand knowledge to level 2 complexity and real-world patterns.", "duration_minutes": 60},
            {"day": 6, "title": "Practical Application & Project Work", "description": "Build a mini-project or practical milestone demonstrating progress.", "duration_minutes": 60},
            {"day": 7, "title": "Weekly Progress Review & Refinement", "description": "Evaluate week 1 achievements, identify bottlenecks, adjust pacing.", "duration_minutes": 30},
            {"day": 8, "title": "Advanced Concept Exploration", "description": "Tackle more challenging aspects and edge cases.", "duration_minutes": 50},
            {"day": 9, "title": "Structured Habit Building", "description": "Establish repeatable daily routines to sustain momentum.", "duration_minutes": 40},
            {"day": 10, "title": "Practical Testing & Feedback", "description": "Test skills or results against standard benchmarks.", "duration_minutes": 45},
            {"day": 11, "title": "Optimization & Speed Enhancement", "description": "Streamline workflow and eliminate friction points.", "duration_minutes": 45},
            {"day": 12, "title": "Capstone Preparation", "description": "Synthesize all learnings into an integrated deliverable.", "duration_minutes": 60},
            {"day": 13, "title": "Final Execution & Polish", "description": "Finalize milestone output and prepare documentation.", "duration_minutes": 60},
            {"day": 14, "title": "Two-Week Sprint Retrospective", "description": "Comprehensive review of progress and roadmap transition to month 2.", "duration_minutes": 30},
        ],
        "monthly_milestones": [
            {"month": 1, "title": f"Core Competency & Foundation in {t}", "description": "Complete initial 14-day sprint and establish consistent daily habits."},
            {"month": 2, "title": "Deep Application & Milestone Execution", "description": "Produce major deliverables, projects, or measurable metric improvements."},
            {"month": 3, "title": f"Mastery, Integration & Goal Completion", "description": f"Achieve full target criteria for '{t}' and transition into maintenance mode."},
        ],
        "tips": [
            "Maintain consistency over intensity: 30 minutes daily beats 4 hours once a week.",
            "Track daily task completions to keep your momentum visual and rewarding.",
            "Schedule tasks during your peak cognitive energy hours for best retention."
        ]
    }


@router.post("/plan-goal")
async def plan_goal(body: PlanRequest, current_user: dict = Depends(get_current_user)):
    user_prompt = f"Goal: {body.goal_title}\nDescription: {body.description}\nTimeframe: {body.timeframe}"

    result = await _execute_ai_json(
        prompt=user_prompt,
        system_prompt=SYSTEM_PROMPT_GOAL,
        fallback_fn=lambda: _fallback_plan_goal(body.goal_title, body.description, body.timeframe),
    )

    created_events = []
    if body.schedule_events and result.get("daily_tasks"):
        base_date = date.today()
        if body.start_date:
            try:
                base_date = date.fromisoformat(body.start_date)
            except ValueError:
                pass

        for t in result["daily_tasks"]:
            day_offset = int(t.get("day", 1)) - 1
            ev_date = base_date + timedelta(days=day_offset)
            event_data = {
                "user_id":     current_user["user_id"],
                "title":       f"[{body.goal_title[:20]}] {t['title']}",
                "description": t.get("description", ""),
                "date":        ev_date.isoformat(),
                "time_start":  "09:00",
                "time_end":    "10:00",
                "recurrence":  "none",
                "goal_id":     body.goal_id or "",
            }
            item = CSVStore.insert(SCHED_CSV, event_data)
            created_events.append(item)

    return {
        **result,
        "created_events_count": len(created_events),
        "created_events": created_events,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 2. AI NOTE ASSISTANT
# ══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT_NOTE = """
You are an expert executive scribe and knowledge architect.
Generate a well-structured, clear, professional note based on the topic and details.
Respond ONLY with a valid JSON object matching:
{
  "title": "Clean, polished title",
  "content": "Full markdown-formatted body with bullet points, sections, and key takeaways",
  "tags": "comma, separated, tags"
}
""".strip()


class GenerateNoteRequest(BaseModel):
    topic:     str
    note_type: str = "general"
    details:   str = ""
    save_now:  bool = False


def _fallback_generate_note(topic: str, note_type: str, details: str) -> dict:
    t = topic.strip()
    tag_list = [note_type, "ai-generated", t.lower().replace(" ", "-")[:15]]
    content_map = {
        "meeting": f"# 🤝 Meeting Summary: {t}\n\n**Date:** {date.today().isoformat()}\n**Topic:** {t}\n\n## 📌 Executive Summary\nKey points and alignment established during discussion.\n\n## 📝 Discussion Points\n- Core priorities and milestones reviewed.\n- {details or 'Identified critical deliverables and assigned ownership.'}\n\n## 🎯 Action Items\n- [ ] Finalize implementation plan\n- [ ] Share meeting notes with collaborators\n- [ ] Schedule follow-up milestone check",
        "project": f"# 🚀 Project Roadmap: {t}\n\n**Status:** In Planning\n**Target Kickoff:** {date.today().isoformat()}\n\n## 🎯 Objective & Scope\n{details or 'Deliver high-quality MVP execution aligned with core strategic KPIs.'}\n\n## 📋 Phase Breakdown\n1. **Discovery & Setup:** Architecture, tooling, initial specs.\n2. **Development:** Core features and iterative testing.\n3. **Deployment & Review:** Launch, monitoring, feedback integration.\n\n## ⚠️ Risk Mitigation\n- Maintain daily standup checks\n- Test edge-cases early",
        "study": f"# 📚 Study & Knowledge Guide: {t}\n\n## 💡 Core Principles\n{details or 'Fundamental concepts, mental models, and definitions.'}\n\n## 🔑 Key Takeaways\n- Master fundamental principles first before advanced optimizations.\n- Practice recall and active problem solving.\n- Connect new insights with existing knowledge foundations.\n\n## 📖 Review Questions\n1. What is the primary purpose of {t}?\n2. What are the key bottlenecks to avoid?",
        "checklist": f"# ✅ Master Checklist: {t}\n\n{details or 'Essential step-by-step checklist to ensure 100% completion.'}\n\n## Phase 1: Preparation\n- [ ] Define requirements and acceptance criteria\n- [ ] Gather necessary tools and resources\n\n## Phase 2: Execution\n- [ ] Implement core deliverable\n- [ ] Perform quality checks and validations\n\n## Phase 3: Finalization\n- [ ] Document final results\n- [ ] Archive and share completed deliverable",
        "journal": f"# 📔 Daily Reflection & Journal: {t}\n\n**Date:** {date.today().isoformat()}\n\n## 🌟 Highlights of the Day\n{details or 'Focused work, steady progress on core goals, and healthy routines.'}\n\n## 💡 Key Learnings & Insights\n- Momentum builds with small consistent actions.\n- Clarity of next steps eliminates procrastination.\n\n## 🎯 Focus for Tomorrow\n- Tackle top priority task during first energy peak.",
    }
    return {
        "title": f"{note_type.title()}: {t}",
        "content": content_map.get(note_type, f"# 📝 {t}\n\n{details or 'Structured overview and key notes.'}\n\n## Summary\nComprehensive reference and action points."),
        "tags": ", ".join(tag_list),
    }


@router.post("/generate-note")
async def generate_note(body: GenerateNoteRequest, current_user: dict = Depends(get_current_user)):
    user_prompt = f"Topic: {body.topic}\nFormat/Type: {body.note_type}\nDetails/Context: {body.details}"

    result = await _execute_ai_json(
        prompt=user_prompt,
        system_prompt=SYSTEM_PROMPT_NOTE,
        fallback_fn=lambda: _fallback_generate_note(body.topic, body.note_type, body.details),
    )

    created_note = None
    if body.save_now:
        note_data = {
            "user_id":    current_user["user_id"],
            "title":      result.get("title", body.topic),
            "content":    result.get("content", ""),
            "tags":       result.get("tags", ""),
            "file_paths": "",
        }
        created_note = CSVStore.insert(NOTES_CSV, note_data)

    return {
        **result,
        "saved": bool(created_note),
        "note": created_note,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 3. AI TASK BREAKDOWN ENGINE
# ══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT_TASK = """
You are an expert agile task architect.
Decompose the project/goal into prioritized actionable subtasks.
Respond ONLY with a valid JSON object matching:
{
  "project_title": "...",
  "summary": "...",
  "tasks": [
    {
      "title": "Clear action title",
      "description": "Short explanation",
      "priority": "high|medium|low",
      "estimated_days": 1
    }
  ]
}
""".strip()


class BreakdownTaskRequest(BaseModel):
    task_title:  str
    context:     str = ""
    num_tasks:   int = 5
    create_all:  bool = False


def _fallback_breakdown_task(title: str, context: str, num_tasks: int) -> dict:
    t = title.strip()
    tasks_pool = [
        {"title": f"1. Scope & Requirement Definition for {t}", "description": "Clarify deliverables, constraints, and baseline expectations.", "priority": "high", "estimated_days": 1},
        {"title": f"2. Resource Gathering & Tool Setup", "description": "Prepare necessary accounts, software, dependencies, and docs.", "priority": "medium", "estimated_days": 1},
        {"title": f"3. Core Architecture / Blueprint Draft", "description": "Design core workflow or structural template.", "priority": "high", "estimated_days": 2},
        {"title": f"4. Implementation - Core Milestone Execution", "description": "Build and complete primary deliverables.", "priority": "high", "estimated_days": 3},
        {"title": f"5. Review, Quality Check & Edge Case Validation", "description": "Test thoroughly, identify bugs or friction points, polish.", "priority": "medium", "estimated_days": 4},
        {"title": f"6. Documentation & User Guide Finalization", "description": "Write summary docs, handover notes, or status report.", "priority": "low", "estimated_days": 5},
        {"title": f"7. Final Launch & Retrospective", "description": "Deploy/deliver final work and log lessons learned.", "priority": "low", "estimated_days": 5},
    ]
    return {
        "project_title": t,
        "summary": f"Actionable sprint decomposition for '{t}' broken into {num_tasks} logical steps.",
        "tasks": tasks_pool[:min(num_tasks, len(tasks_pool))]
    }


@router.post("/breakdown-task")
async def breakdown_task(body: BreakdownTaskRequest, current_user: dict = Depends(get_current_user)):
    user_prompt = f"Project/Task: {body.task_title}\nContext: {body.context}\nTarget Subtask Count: {body.num_tasks}"

    result = await _execute_ai_json(
        prompt=user_prompt,
        system_prompt=SYSTEM_PROMPT_TASK,
        fallback_fn=lambda: _fallback_breakdown_task(body.task_title, body.context, body.num_tasks),
    )

    created_tasks = []
    if body.create_all:
        today = date.today()
        for sub in result.get("tasks", []):
            offset = int(sub.get("estimated_days", 1)) - 1
            due = (today + timedelta(days=max(0, offset))).isoformat()
            task_item = CSVStore.insert(TASKS_CSV, {
                "user_id":     current_user["user_id"],
                "title":       sub.get("title", "Subtask"),
                "description": sub.get("description", ""),
                "priority":    sub.get("priority", "medium"),
                "status":      "pending",
                "due_date":    due,
            })
            created_tasks.append(task_item)

    return {
        **result,
        "created_tasks_count": len(created_tasks),
        "created_tasks": created_tasks,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 4. AI CARE & MEDICATION PLANNER
# ══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT_MED = """
You are a healthcare care-routine advisor.
Generate a structured medication schedule with timings and safety tips.
Respond ONLY with a valid JSON object matching:
{
  "patient_name": "...",
  "summary": "...",
  "medications": [
    {
      "medication_name": "...",
      "dosage": "500mg",
      "frequency": "daily|twice_daily|weekly",
      "times": "08:00|20:00",
      "notes": "Take with meal"
    }
  ],
  "safety_tips": ["...", "..."]
}
""".strip()


class SuggestMedRequest(BaseModel):
    patient_name: str = "Self"
    condition:    str
    notes:        str = ""
    create_all:   bool = False


def _fallback_suggest_med_schedule(patient: str, condition: str, notes: str) -> dict:
    p = patient.strip() or "Patient"
    c = condition.strip()
    return {
        "patient_name": p,
        "summary": f"Tailored care & medication regimen for {p} managing {c}.",
        "medications": [
            {"medication_name": f"Morning Regimen for {c[:25]}", "dosage": "Standard Dose", "frequency": "daily", "times": "08:00", "notes": "Take with breakfast and full glass of water."},
            {"medication_name": "Daily Wellness / Vitamin D3 + Multivitamin", "dosage": "1 Tablet", "frequency": "daily", "times": "13:00", "notes": "Take post-lunch for optimal absorption."},
        ],
        "safety_tips": [
            "Always consult your primary care physician or pharmacist before modifying dosages.",
            "Maintain strict hydration throughout the day.",
            "Log any unexpected side effects or medication interactions immediately."
        ]
    }


@router.post("/suggest-med-schedule")
async def suggest_med_schedule(body: SuggestMedRequest, current_user: dict = Depends(get_current_user)):
    user_prompt = f"Patient: {body.patient_name}\nCondition/Regimen: {body.condition}\nNotes: {body.notes}"

    result = await _execute_ai_json(
        prompt=user_prompt,
        system_prompt=SYSTEM_PROMPT_MED,
        fallback_fn=lambda: _fallback_suggest_med_schedule(body.patient_name, body.condition, body.notes),
    )

    created_meds = []
    if body.create_all:
        for m in result.get("medications", []):
            med = CSVStore.insert(MEDS_CSV, {
                "user_id":         current_user["user_id"],
                "patient_name":    body.patient_name or result.get("patient_name", "Patient"),
                "medication_name": m.get("medication_name", "Medication"),
                "dosage":          m.get("dosage", "1 dose"),
                "frequency":       m.get("frequency", "daily"),
                "times":           m.get("times", "08:00"),
                "start_date":      date.today().isoformat(),
                "end_date":        "",
                "notes":           m.get("notes", ""),
                "last_reminded":   "",
            })
            created_meds.append(med)

    return {
        **result,
        "created_meds_count": len(created_meds),
        "created_meds": created_meds,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 5. AI DAILY SCHEDULE / TIME BLOCK GENERATOR
# ══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT_DAY = """
You are an executive time-management assistant.
Generate an optimal daily time-blocked schedule.
Respond ONLY with a valid JSON object matching:
{
  "date": "YYYY-MM-DD",
  "theme": "Focus theme of the day",
  "events": [
    {
      "title": "...",
      "time_start": "09:00",
      "time_end": "10:30",
      "description": "..."
    }
  ]
}
""".strip()


class PlanDayRequest(BaseModel):
    date_str:    str
    focus_areas: str = ""
    create_all:  bool = False


def _fallback_plan_day(date_str: str, focus: str) -> dict:
    return {
        "date": date_str or date.today().isoformat(),
        "theme": focus or "Productivity & Balanced Execution",
        "events": [
            {"title": "🌅 Morning Routine & Goal Alignment", "time_start": "08:00", "time_end": "08:45", "description": "Review top 3 priorities for today, healthy breakfast, hydration."},
            {"title": f"⚡ Deep Work Block 1: {focus or 'Core Deliverable'}", "time_start": "09:00", "time_end": "11:30", "description": "High-focus execution without notifications or distractions."},
            {"title": "🥗 Lunch & Mindful Recharge", "time_start": "12:00", "time_end": "13:00", "description": "Nutritious meal, short walk, screen break."},
            {"title": "🤝 Communication & Collaboration Block", "time_start": "13:30", "time_end": "15:00", "description": "Emails, team syncs, stakeholder check-ins, messages."},
            {"title": "🎯 Deep Work Block 2: Progress & Polish", "time_start": "15:30", "time_end": "17:00", "description": "Wrap up second priority task, review progress."},
            {"title": "📊 Day Retrospective & Tomorrow Planning", "time_start": "17:15", "time_end": "17:45", "description": "Clear inbox, mark completed tasks, set top priorities for tomorrow."},
        ]
    }


@router.post("/plan-day")
async def plan_day(body: PlanDayRequest, current_user: dict = Depends(get_current_user)):
    user_prompt = f"Date: {body.date_str}\nFocus: {body.focus_areas}"

    result = await _execute_ai_json(
        prompt=user_prompt,
        system_prompt=SYSTEM_PROMPT_DAY,
        fallback_fn=lambda: _fallback_plan_day(body.date_str, body.focus_areas),
    )

    created_events = []
    if body.create_all:
        target_date = body.date_str or date.today().isoformat()
        for ev in result.get("events", []):
            item = CSVStore.insert(SCHED_CSV, {
                "user_id":     current_user["user_id"],
                "title":       ev.get("title", "Event"),
                "description": ev.get("description", ""),
                "date":        target_date,
                "time_start":  ev.get("time_start", "09:00"),
                "time_end":    ev.get("time_end", "10:00"),
                "recurrence":  "none",
                "goal_id":     "",
            })
            created_events.append(item)

    return {
        **result,
        "created_events_count": len(created_events),
        "created_events": created_events,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 6. AI EXECUTIVE SUMMARY & PDF EXPORT
# ══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT_SUMMARY = """
You are an executive productivity strategist and life architect.
Analyze the user's active goals, pending and completed tasks, scheduled calendar events, and notes.
Synthesize an executive summary with a productivity assessment, top priority focus, and actionable recommendations.
Respond ONLY with a valid JSON object matching:
{
  "productivity_score": "92/100",
  "executive_overview": "A concise 2-3 sentence strategic briefing summarizing workload, momentum, and priorities.",
  "top_priority": "Immediate primary objective to focus on.",
  "recommendations": [
    "Actionable recommendation 1",
    "Actionable recommendation 2",
    "Actionable recommendation 3"
  ]
}
""".strip()


def _fallback_summary(username: str, goals: list, tasks: list, events: list, meds: list, notes: list) -> dict:
    total_tasks = len(tasks)
    completed_tasks = len([t for t in tasks if t.get("status") == "completed"])
    rate = int((completed_tasks / total_tasks * 100) if total_tasks else 88)
    score_val = min(98, max(70, rate + 10))
    top_p = tasks[0].get("title") if tasks else (goals[0].get("title") if goals else "Execute daily high-impact time-blocks.")

    return {
        "productivity_score": f"{score_val}/100",
        "executive_overview": f"Productivity briefing for {username}. Currently managing {len(goals)} active goals, {total_tasks} actionable tasks ({completed_tasks} completed), {len(events)} calendar blocks, and {len(meds)} care items. Momentum is strong with clear prioritization across modules.",
        "top_priority": f"Advance key priority: {top_p}",
        "recommendations": [
            "Protect 90-minute uninterrupted deep work blocks during morning peak cognitive hours.",
            "Review and check off completed subtasks to sustain psychological velocity.",
            "Ensure weekly calendar blocks are directly aligned with core monthly milestone goals.",
            "Maintain consistency in daily health and care routines for optimal cognitive energy."
        ]
    }


async def _generate_user_ai_summary(current_user: dict):
    uid = current_user["user_id"]
    goals  = CSVStore.filter_rows(GOALS_CSV, {"user_id": uid})
    tasks  = CSVStore.filter_rows(TASKS_CSV, {"user_id": uid})
    events = CSVStore.filter_rows(SCHED_CSV, {"user_id": uid})
    meds   = CSVStore.filter_rows(MEDS_CSV,  {"user_id": uid})
    notes  = CSVStore.filter_rows(NOTES_CSV, {"user_id": uid})

    context_prompt = (
        f"User: {current_user.get('username', 'User')}\n"
        f"Goals ({len(goals)}): {', '.join([g.get('title','') for g in goals[:6]])}\n"
        f"Tasks ({len(tasks)}): {', '.join([t.get('title','') + ' (' + t.get('priority','') + ')' for t in tasks[:10]])}\n"
        f"Calendar Events ({len(events)}): {', '.join([e.get('title','') for e in events[:6]])}\n"
        f"Care Meds ({len(meds)}): {', '.join([m.get('medication_name','') for m in meds[:6]])}\n"
        f"Notes ({len(notes)}): {', '.join([n.get('title','') for n in notes[:6]])}"
    )

    ai_data = await _execute_ai_json(
        prompt=context_prompt,
        system_prompt=SYSTEM_PROMPT_SUMMARY,
        fallback_fn=lambda: _fallback_summary(current_user.get("username", "User"), goals, tasks, events, meds, notes),
    )

    return ai_data, goals, tasks, events, meds, notes


@router.post("/generate-summary")
async def get_summary_report(current_user: dict = Depends(get_current_user)):
    ai_data, goals, tasks, events, meds, notes = await _generate_user_ai_summary(current_user)
    return {
        "summary": ai_data,
        "counts": {
            "goals": len(goals),
            "tasks": len(tasks),
            "events": len(events),
            "meds": len(meds),
            "notes": len(notes),
        }
    }


@router.post("/export-summary-pdf")
async def export_summary_pdf(current_user: dict = Depends(get_current_user)):
    ai_data, goals, tasks, events, meds, notes = await _generate_user_ai_summary(current_user)

    pdf_bytes = generate_executive_pdf(
        username=current_user.get("username", "User"),
        ai_summary=ai_data,
        goals=goals,
        tasks=tasks,
        events=events,
        meds=meds,
        notes=notes
    )

    filename = f"Personal_Organizer_Summary_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        }
    )


# ══════════════════════════════════════════════════════════════════════════════
# 7. AI STATUS & SETTINGS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/status")
def ai_status(current_user: dict = Depends(get_current_user)):
    cfg = _get_ai_config()
    has_groq = bool(cfg["groq_key"] and not _is_placeholder_key(cfg["groq_key"]))
    has_openai = bool(cfg["openai_key"] and not _is_placeholder_key(cfg["openai_key"]))

    active_provider = "Smart Local Engine (Offline)"
    if has_groq:
        active_provider = f"Groq LLaMA Cloud ({cfg['groq_model']})"
    elif has_openai:
        active_provider = f"OpenAI Cloud ({cfg['openai_model']})"
    elif cfg["backend"] == "ollama":
        active_provider = f"Ollama Local ({cfg['ollama_model']})"

    return {
        "backend": cfg["backend"],
        "groq_configured": has_groq,
        "groq_model": cfg["groq_model"],
        "openai_configured": has_openai,
        "openai_model": cfg["openai_model"],
        "ollama_host": cfg["ollama_host"],
        "ollama_model": cfg["ollama_model"],
        "smart_local_engine_active": True,
        "active_provider": active_provider,
    }
