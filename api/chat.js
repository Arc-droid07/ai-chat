const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ── Retry with exponential backoff ──────────────────────────────────────────
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    await new Promise(r => setTimeout(r, 500 * (2 ** i)));
  }
  throw new Error('AI rate limit exceeded after retries');
}

// ── KV cache (global, not datacenter-local) ──────────────────────────────────
async function getCacheKey(msg) {
  const encoded = new TextEncoder().encode(msg.slice(0, 500));
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return 'cache:' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── JWT verification (blocks unauthenticated API abuse) ──────────────────────
async function verifyAuth(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': env.SUPABASE_ANON_KEY,
      }
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

// ── Calendar helper ──────────────────────────────────────────────────────────
async function handleCalendarAction(calendarAction) {
  const { accessToken, action, event } = calendarAction;
  if (action !== 'create') return { success: false, error: 'Unknown action' };
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: event.title,
        description: event.description || 'Added by Aki',
        start: { dateTime: event.startTime, timeZone: 'Asia/Kolkata' },
        end:   { dateTime: event.endTime,   timeZone: 'Asia/Kolkata' },
      }),
    });
    const data = await res.json();
    return res.ok ? { success: true, event: data } : { success: false, error: data.error?.message };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── AI call with model fallback chain ─────────────────────────────────────────
async function callAI(messages, systemPrompt, env) {
  const models = [
    { url: 'https://api.groq.com/openai/v1/chat/completions', key: env.GROQ_API_KEY,       model: 'llama-3.3-70b-versatile' },
    { url: 'https://api.groq.com/openai/v1/chat/completions', key: env.GROQ_API_KEY,       model: 'gemma2-9b-it' },
    { url: 'https://openrouter.ai/api/v1/chat/completions',   key: env.OPENROUTER_API_KEY, model: 'mistralai/mistral-7b-instruct' },
  ];

  for (const { url, key, model } of models) {
    if (!key) continue;
    try {
      const res = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, ...messages.slice(-20)],
          max_tokens: 1024,
          temperature: 0.7,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (text) return { text, model };
    } catch { continue; }
  }
  throw new Error('All AI providers failed');
}

// ── Calendar event extraction from AI response ────────────────────────────────
function extractCalendarEvent(text) {
  const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const timeMatch = text.match(/\b(\d{1,2}:\d{2})\s*(AM|PM|am|pm)?\b/);
  const keywords = ['meeting', 'appointment', 'event', 'schedule', 'remind', 'call', 'interview', 'deadline'];
  const hasKeyword = keywords.some(k => text.toLowerCase().includes(k));
  if (!dateMatch || !hasKeyword) return null;
  const titleMatch = text.match(/(?:schedule|add|set up|create|remind me about|meeting for)\s+(.{5,50}?)(?:\s+on|\s+at|\.|\?|$)/i);
  return {
    title: titleMatch?.[1]?.trim() || 'Event from Aki',
    date: dateMatch[1],
    time: timeMatch ? timeMatch[0].trim() : '09:00',
    duration: 30,
  };
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // ── Auth gate ──
    const user = await verifyAuth(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const { messages = [], memoryContext = '', notifContext = '', calendarToken, calendarAction } = body;

    // ── Calendar action shortcut ──
    if (calendarAction) {
      const result = await handleCalendarAction(calendarAction);
      return new Response(JSON.stringify(result), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── Build system prompt ──
    const systemPrompt = `You are Aki, a warm and intelligent personal AI assistant. You remember your user, help with tasks, and connect with their friends via Aki Network.
${memoryContext}
${notifContext}
When a user mentions scheduling something, include a date (YYYY-MM-DD format) in your response.
Keep responses concise and conversational. Use markdown lightly.`;

    // ── KV cache check ──
    const lastMsg = messages[messages.length - 1]?.content || '';
    let cacheKey = null;
    if (env.AKI_CACHE && lastMsg) {
      cacheKey = await getCacheKey(lastMsg);
      const cached = await env.AKI_CACHE.get(cacheKey);
      if (cached) {
        return new Response(cached, {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
        });
      }
    }

    // ── Call AI ──
    let aiResult;
    try {
      aiResult = await callAI(messages, systemPrompt, env);
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 503,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const calendarEvent = extractCalendarEvent(aiResult.text);
    const responseData = {
      text: aiResult.text,
      model: aiResult.model,
      calendarEvent: calendarEvent || undefined,
    };
    const responseJson = JSON.stringify(responseData);

    // ── Store in KV cache (1 hour TTL, skip short replies) ──
    if (env.AKI_CACHE && cacheKey && aiResult.text.length > 50) {
      await env.AKI_CACHE.put(cacheKey, responseJson, { expirationTtl: 3600 });
    }

    return new Response(responseJson, {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    });
  },
};
