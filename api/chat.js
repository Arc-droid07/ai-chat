const OR_KEY = process.env.OPENROUTER_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body;
  if (!messages || !messages.length) return res.status(400).json({ error: 'No messages' });

  const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OR_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ai-chat-beige-alpha.vercel.app',
      'X-Title': 'AI Chat'
    },
    body: JSON.stringify({
     model: 'deepseek/deepseek-r1:free',
      messages: messages
    })
  });

  const data = await orRes.json();
  const text = data?.choices?.[0]?.message?.content;

  if (text) {
    return res.json({ text, model: 'Gemini 2.0 Flash' });
  }

  return res.status(503).json({ 
    error: 'All AI services temporarily unavailable. Try again in a few minutes.',
    debug: JSON.stringify(data)
  });
}
