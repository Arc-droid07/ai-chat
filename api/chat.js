export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'No messages' });

    const lastUserMsg = messages[messages.length - 1].content;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
      },
      body: JSON.stringify({
        model: 'google/gemma-3-4b-it:free',
        messages: [
          { role: 'user', content: 'You are Aki, an AI created by Aaradhy Bhatkar. Answer helpfully.' },
          { role: 'assistant', content: 'Understood! I am Aki.' },
          ...messages
        ],
        max_tokens: 1000
      })
    });

    const raw = await response.text();
    
    // Return raw response so we can debug
    if (!response.ok) {
      return res.status(500).json({ error: 'OpenRouter error: ' + raw });
    }

    const data = JSON.parse(raw);
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return res.status(500).json({ error: 'No text in response: ' + raw });

    return res.status(200).json({ text });

  } catch(err) {
    return res.status(500).json({ error: 'Exception: ' + err.message });
  }
}
