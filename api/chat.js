const OR_KEY = process.env.OPENROUTER_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'No messages' });

  const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OR_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ai-chat-beige-alpha.vercel.app',
      'X-Title': 'AI Chat'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-exp:free',
      messages,
      max_tokens: 1024
    })
  });

  const data = await orRes.json();
  
  // Return EVERYTHING so we can see the exact error
  return res.json({
    status: orRes.status,
    text: data?.choices?.[0]?.message?.content || null,
    fullResponse: data,
    keyExists: !!OR_KEY,
    keyStart: OR_KEY ? OR_KEY.substring(0, 8) : 'MISSING'
  });
}
