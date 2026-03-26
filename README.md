# AI Chat — Deploy Guide

## What this is
A beautiful AI chat app hosted on Vercel.
Your API keys stay secret on the server.
Users just open the link — no signup, no setup.

---

## Files
```
aichat/
├── api/
│   └── chat.js        ← Secure backend (hides your API keys)
├── public/
│   └── index.html     ← Beautiful chat UI
├── vercel.json        ← Vercel config
└── package.json
```

---

## Deploy Steps (10 minutes)

### Step 1 — Upload to GitHub
1. Go to github.com → Sign in
2. Click "+" → "New repository"
3. Name it: `ai-chat`
4. Click "Create repository"
5. Click "uploading an existing file"
6. Upload ALL files keeping the folder structure:
   - api/chat.js
   - public/index.html
   - vercel.json
   - package.json
7. Click "Commit changes"

### Step 2 — Deploy on Vercel
1. Go to vercel.com → Sign in with GitHub
2. Click "Add New Project"
3. Select your `ai-chat` repository
4. Click "Deploy" (don't change any settings)
5. Wait 1 minute → it will FAIL (that's okay, keys not set yet)

### Step 3 — Add Your Secret API Keys
1. In Vercel → go to your project
2. Click "Settings" → "Environment Variables"
3. Add these one by one:

| Name | Value |
|------|-------|
| `GEMINI_API_KEY` | Your Gemini key from aistudio.google.com |
| `OPENROUTER_API_KEY` | Your OpenRouter key from openrouter.ai |

4. Click "Save" after each one

### Step 4 — Redeploy
1. Go to "Deployments" tab
2. Click the 3 dots on latest deployment
3. Click "Redeploy"
4. Wait 1 minute

### Step 5 — Share!
Your app is live at: `https://ai-chat-yourname.vercel.app`
Share this link with anyone — works instantly on any phone!

---

## Getting Free API Keys

### Gemini (Google) — Primary AI
1. Go to aistudio.google.com
2. Sign in with Google
3. Click "Get API Key" → "Create API key"
4. Copy it → paste in Vercel env vars

### OpenRouter — Backup AI
1. Go to openrouter.ai
2. Sign up free
3. Go to "API Keys" → "Create Key"
4. Copy it → paste in Vercel env vars

---

## Rate Limiting
Each user is limited to 20 messages per hour automatically.
This protects your free API quota.

---

## Troubleshooting
- **"All AI services unavailable"** → Check your API keys in Vercel env vars
- **App not loading** → Check vercel.json is correct
- **Quota exceeded** → Gemini free tier = 1500 req/day, resets midnight

---

Built with ♥ — Free forever on Vercel free tier
