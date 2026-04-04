export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    await new Promise(r => setTimeout(r, 500 * (2 ** i)));
  }
  throw new Error('AI rate limit exceeded');
}

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

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  let body;
  try { body = await request.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }

  const { messages = [], memoryContext = '', notifContext = '', calendarAction } = body;

  if (calendarAction) {
    const result = await handleCalendarAction(calendarAction);
    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

  const systemPrompt = `You are Aki, a warm and intelligent personal AI assistant. You remember your user, help with tasks, and connect with their friends via Aki Network.
${memoryContext}
${notifContext}
When a user mentions scheduling something, include a date (YYYY-MM-DD format) in your response.
Keep responses concise and conversational. Use markdown lightly.`;

  const models = [
    { url: 'https://api.groq.com/openai/v1/chat/completions', key: GROQ_API_KEY,       model: 'llama-3.3-70b-versatile' },
    { url: 'https://api.groq.com/openai/v1/chat/completions', key: GROQ_API_KEY,       model: 'gemma2-9b-it' },
    { url: 'https://openrouter.ai/api/v1/chat/completions',   key: OPENROUTER_API_KEY, model: 'mistralai/mistral-7b-instruct' },
  ];

  for (const { url, key, model } of models) {
    if (!key) continue;
    try {
      const res = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [{ role: 'system', content: systemPrompt }, ...messages.slice(-20)],
          max_tokens: 1024,
          temperature: 0.7,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) continue;

      const calendarEvent = extractCalendarEvent(text);
      return new Response(JSON.stringify({ text, model, calendarEvent: calendarEvent || null }), {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    } catch { continue; }
  }

  return new Response(JSON.stringify({ error: 'All AI providers failed' }), {
    status: 503, headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}
