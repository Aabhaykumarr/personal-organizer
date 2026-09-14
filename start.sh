#!/usr/bin/env bash
# Starts both backend and frontend in parallel.
# Run from the project root: bash start.sh

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Personal Organizer — Local Start   ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Backend ────────────────────────────────────────────────────────────────────
echo "→ Starting FastAPI backend on http://localhost:8000"
cd "$ROOT/backend"

if [ ! -d ".venv" ]; then
  echo "  Creating virtual environment..."
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt -q
else
  source .venv/bin/activate
fi

# Load .env if it exists
[ -f ".env" ] && export $(grep -v "^#" .env | xargs)

uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACK_PID=$!

# ── Frontend ───────────────────────────────────────────────────────────────────
echo "→ Starting React frontend on http://localhost:3000"
cd "$ROOT/frontend"

if [ ! -d "node_modules" ]; then
  echo "  Installing npm packages (first run)..."
  npm install -q
fi

npm start &
FRONT_PID=$!

# ── Cleanup ────────────────────────────────────────────────────────────────────
echo ""
echo "✅  Both servers running."
echo "   Backend  → http://localhost:8000"
echo "   Frontend → http://localhost:3000"
echo "   API docs → http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop."

trap "kill $BACK_PID $FRONT_PID 2>/dev/null; echo Stopped." INT TERM
wait
