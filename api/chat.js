const OR_KEY = process.env.OPENROUTER_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body;
  if (!messages || !messages.length) return res.status(400).json({ error: 'No messages' });

  try {
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OR_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ai-chat-beige-alpha.vercel.app',
        'X-Title': 'AI Chat'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.2-3b-instruct:free',
        messages: messages
      })
    });

    const data = await orRes.json();
    
    // Return full debug info
    return res.json({ 
      text: data?.choices?.[0]?.message?.content || 'No content',
      debug: data,
      keyPreview: OR_KEY ? OR_KEY.substring(0, 15) + '...' : 'KEY MISSING'
    });

  } catch(e) {
    return res.status(500).json({ text: 'Error: ' + e.message, debug: e.toString() });
  }
}
