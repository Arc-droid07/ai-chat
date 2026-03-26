const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OR_KEY = process.env.OPENROUTER_API_KEY;

const rateLimitMap = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60 * 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - record.start > RATE_WINDOW) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return true;
  }
  if (record.count >= RATE_LIMIT) return false;
  record.count++;
  rateLimitMap.set(ip, record);
  return true;
}

async function callGemini(messages, systemPrompt) {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  const body = { contents };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(`Gemini: ${e?.error?.message || res.status}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini: empty response');
  return { text, model: 'Gemini 2.0 Flash' };
}

async function callOpenRouter(messages, systemPrompt) {
  const msgs = [];
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
  messages.forEach(m => msgs.push({ role: m.role, content: m.content }));
  const models = [
    'google/gemma-2-9b-it:free',
    'mistralai/mistral-7b-instruct:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'qwen/qwen-2-7b-instruct:free'
  ];
  for (const model of models) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OR_KEY}`,
          'HTTP-Referer': 'https://aichat.vercel.app',
          'X-Title': 'AI Chat'
        },
        body: JSON.stringify({ model, messages: msgs, max_tokens: 1024 })
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) continue;
      return { text, model: model.split('/')[1].split(':')[0] };
    } catch(e) { continue; }
  }
  throw new Error('OpenRouter: all free models unavailable');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many messages. Please wait an hour.' });
  }

  const { messages, systemPrompt } = req.body || {};
  if (!messages?.length) return res.status(400).json({ error: 'No messages' });

  let result = null;
  if (GEMINI_KEY) {
    try { result = await callGemini(messages, systemPrompt); } catch(e) {}
  }
  if (!result && OR_KEY) {
    try { result = await callOpenRouter(messages, systemPrompt); } catch(e) {}
  }
  if (!result) {
    return res.status(503).json({ error: 'All AI services temporarily unavailable. Try again in a few minutes.' });
  }
  return res.status(200).json(result);
}
