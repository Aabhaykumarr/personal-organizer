# 🚀 Cloud Deployment Guide — Personal Organizer

The Personal Organizer application is engineered as a **Unified Fullstack Service**. The FastAPI backend automatically serves the compiled React production application (`frontend/build`) and handles all API endpoints, authentication, CSV data persistence, and AI capabilities under a single port.

---

## Option 1: Deploy to Render (Recommended — Free Tier)

Render allows you to host the fullstack application with a public `https://your-app.onrender.com` URL.

### Step 1: Push Project to GitHub
1. Initialize git and commit the codebase (ensure `.env` is ignored by `.gitignore`):
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Personal Organizer Fullstack"
   ```
2. Create a new repository on [GitHub](https://github.com/new) and push your code:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/personal-organizer.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Deploy using Render Blueprint (`render.yaml`)
1. Log in to [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** → **Blueprint**.
3. Connect your GitHub repository.
4. Render will automatically read `render.yaml` and configure:
   - **Build Command:** `bash build.sh`
   - **Start Command:** `cd backend && python main.py`
5. In the **Environment Variables** prompt, enter your `GROQ_API_KEY`:
   - `GROQ_API_KEY`: `gsk_your_groq_api_key_here` (get your free key from https://console.groq.com)
6. Click **Apply**. Render will build the React frontend, install Python dependencies, and provide your live public URL!

---

## Option 2: Deploy to Railway

1. Sign up at [Railway.app](https://railway.app/).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select your repository.
4. Set the following **Variables** in the Railway Settings tab:
   - `AI_BACKEND` = `groq`
   - `GROQ_API_KEY` = `your_groq_api_key`
   - `GROQ_MODEL` = `openai/gpt-oss-120b`
   - `SECRET_KEY` = `generate_any_secure_random_string`
   - `PORT` = `8000`
5. Click **Deploy**. Railway will build the Docker container using `Dockerfile` and assign a public domain.

---

## Option 3: Instant Public Demo URL (Zero-Deploy with Localtunnel)

If you want an immediate live URL to share with colleagues or friends directly from your running local machine without deploying to the cloud:

1. Ensure the local server is running:
   ```bash
   cd backend
   python main.py
   ```
2. In a separate terminal, run:
   ```bash
   npx localtunnel --port 8000
   ```
3. Localtunnel will generate a public URL (e.g. `https://friendly-panda-12.loca.lt`) that directly connects to your local organizer.

---

## Environment Variables Reference

| Variable | Description | Example / Recommended |
|---|---|---|
| `PORT` | Listening server port | `8000` (assigned automatically by Render/Railway) |
| `SECRET_KEY` | JWT token signature secret | Secure random 64-char string |
| `AI_BACKEND` | AI engine selector (`groq`, `openai`, `ollama`, `local`) | `groq` |
| `GROQ_API_KEY` | Groq Cloud inference API Key | `gsk_...` |
| `GROQ_MODEL` | Fast Groq model | `openai/gpt-oss-120b` |
| `OPENAI_API_KEY` | Optional OpenAI API Key (fallback) | `sk-...` |
| `OPENAI_MODEL` | OpenAI Model | `gpt-4o-mini` |
