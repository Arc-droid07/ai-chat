const OR_KEY = process.env.OPENROUTER_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'No messages' });

  // Try 5 free models one by one until one works
  const models = [
    'google/gemini-2.0-flash-exp:free',
    'deepseek/deepseek-r1:free',
    'deepseek/deepseek-v3:free',
    'qwen/qwen2.5-vl-72b-instruct:free',
    'mistralai/mistral-7b-instruct:free'
  ];

  for (const model of models) {
    try {
      const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OR_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://ai-chat-beige-alpha.vercel.app',
          'X-Title': 'AI Chat'
        },
        body: JSON.stringify({ model, messages, max_tokens: 1024 })
      });

      const data = await orRes.json();
      const text = data?.choices?.[0]?.message?.content;
      if (text) return res.json({ text, model: model.split('/')[1] });

    } catch(e) { continue; }
  }

  return res.status(503).json({ error: 'All AI services temporarily unavailable. Try again in a few minutes.' });
}
