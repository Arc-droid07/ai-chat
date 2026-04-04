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

// ── KV cache key (SHA-256, handles any unicode) ───────────────────────────────
async function getCacheKey(msg) {
  const encoded = new TextEncoder().encode(msg.slice(0, 500));
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return 'cache:' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── JWT verification ──────────────────────────────────────────────────────────
async function verifyAuth(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': env.SUPABASE_ANON_KEY }
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? user : null;
  } catch { return null; }
}

// ── Calendar helper ──────────────────────────────────────────────────────────
async function handleCalendarAction(calendarAction) {
  const { accessToken, action, event } = calendarAction;
  if (action !== 'create') return { success: false, error: 'Unknown action' };
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: event.title,
        description: event.description || 'Added by Aki',
        start: { dateTime: event.startTime, timeZone: 'Asia/Kolkata' },
        end:   { dateTime: event.endTime,   timeZone: 'Asia/Kolkata' },
      }),
    });
    const data = await res.json();
    return res.ok ? { success: true, event: data } : { success: false, error: data.error?.message };
  } catch (e) { return { success: false, error: e.message }; }
}

// ── Calendar event extraction ─────────────────────────────────────────────────
function extractCalendarEvent(text) {
  const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const timeMatch = text.match(/\b(\d{1,2}:\d{2})\s*(AM|PM|am|pm)?\b/);
  const keywords = ['meeting','appointment','event','schedule','remind','call','interview','deadline'];
  if (!dateMatch || !keywords.some(k => text.toLowerCase().includes(k))) return null;
  const titleMatch = text.match(/(?:schedule|add|set up|create|remind me about|meeting for)\s+(.{5,50}?)(?:\s+on|\s+at|\.|\?|$)/i);
  return {
    title: titleMatch?.[1]?.trim() || 'Event from Aki',
    date: dateMatch[1],
    time: timeMatch ? timeMatch[0].trim() : '09:00',
    duration: 30,
  };
}

// ── Streaming AI call — returns a ReadableStream of SSE chunks ────────────────
async function streamAI(messages, systemPrompt, env) {
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
          stream: true,
          messages: [{ role: 'system', content: systemPrompt }, ...messages.slice(-20)],
          max_tokens: 1024,
          temperature: 0.7,
        }),
      });
      if (!res.ok || !res.body) continue;
      return { stream: res.body, model };
    } catch { continue; }
  }
  throw new Error('All AI providers failed');
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const user = await verifyAuth(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    let body;
    try { body = await request.json(); }
    catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const { messages = [], memoryContext = '', notifContext = '', calendarAction } = body;

    // Calendar shortcut — no streaming needed
    if (calendarAction) {
      const result = await handleCalendarAction(calendarAction);
      return new Response(JSON.stringify(result), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = `You are Aki, a warm and intelligent personal AI assistant. You remember your user, help with tasks, and connect with their friends via Aki Network.
${memoryContext}
${notifContext}
When a user mentions scheduling something, include a date (YYYY-MM-DD format) in your response.
Keep responses concise and conversational. Use markdown lightly.`;

    // KV cache check (cache stores full response JSON)
    const lastMsg = messages[messages.length - 1]?.content || '';
    let cacheKey = null;
    if (env.AKI_CACHE && lastMsg) {
      cacheKey = await getCacheKey(lastMsg);
      const cached = await env.AKI_CACHE.get(cacheKey);
      if (cached) {
        // Replay cached response as a stream so frontend code path is identical
        const { text, model } = JSON.parse(cached);
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            // Send full text as one chunk, then done signal
            const chunk = JSON.stringify({ type: 'chunk', text });
            controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
            const calendarEvent = extractCalendarEvent(text);
            const done = JSON.stringify({ type: 'done', model, calendarEvent: calendarEvent || null, cached: true });
            controller.enqueue(encoder.encode(`data: ${done}\n\n`));
            controller.close();
          }
        });
        return new Response(stream, {
          headers: { ...CORS_HEADERS, 'Content-Type': 'text/event-stream', 'X-Cache': 'HIT' },
        });
      }
    }

    // Start streaming AI response
    let aiStream, modelName;
    try {
      ({ stream: aiStream, model: modelName } = await streamAI(messages, systemPrompt, env));
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 503, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Transform raw SSE from AI provider → our clean SSE format
    // Also accumulate full text so we can cache it at the end
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    const transformed = new TransformStream({
      async transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            const parsed = JSON.parse(raw);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              fullText += token;
              const out = JSON.stringify({ type: 'chunk', text: token });
              controller.enqueue(encoder.encode(`data: ${out}\n\n`));
            }
          } catch { /* skip malformed SSE lines */ }
        }
      },
      async flush(controller) {
        // Send done signal with metadata
        const calendarEvent = extractCalendarEvent(fullText);
        const done = JSON.stringify({ type: 'done', model: modelName, calendarEvent: calendarEvent || null, cached: false });
        controller.enqueue(encoder.encode(`data: ${done}\n\n`));

        // Store in KV cache for next time
        if (env.AKI_CACHE && cacheKey && fullText.length > 50) {
          await env.AKI_CACHE.put(
            cacheKey,
            JSON.stringify({ text: fullText, model: modelName }),
            { expirationTtl: 3600 }
          );
        }
      }
    });

    aiStream.pipeThrough(transformed);

    return new Response(transformed.readable, {
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Cache': 'MISS' },
    });
  },
};
