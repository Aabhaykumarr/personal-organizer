# ==============================================================================
# Multi-stage Dockerfile for Personal Organizer (React + FastAPI)
# ==============================================================================

# Stage 1: Build React Production SPA
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Production Python Runtime
FROM python:3.12-slim
WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python backend dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source & data templates
COPY backend/ ./backend/
COPY data/ ./data/

# Copy compiled React static bundle from Stage 1
COPY --from=frontend-builder /app/frontend/build ./frontend/build

# Switch working directory to backend
WORKDIR /app/backend

ENV PORT=8000
EXPOSE 8000

CMD ["python", "main.py"]
