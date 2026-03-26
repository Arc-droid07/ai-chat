const GEMINI_KEY = process.env.GEMINI_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'No messages' });

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const res2 = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    }
  );

  const data = await res2.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (text) return res.json({ text, model: 'Gemini 2.0 Flash' });

  return res.status(503).json({ 
    error: 'AI unavailable. Try again.',
    debug: JSON.stringify(data).substring(0, 200)
  });
}
