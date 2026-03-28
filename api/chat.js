const OR_KEY = process.env.OPENROUTER_API_KEY;

async function webSearch(query) {
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    );
    const data = await res.json();
    const results = [];
    if (data.AbstractText) results.push(data.AbstractText);
    if (data.RelatedTopics) {
      data.RelatedTopics.slice(0, 3).forEach(t => {
        if (t.Text) results.push(t.Text);
      });
    }
    return results.length ? results.join('\n') : null;
  } catch(e) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'No messages' });

  // Current date/time
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { 
    weekday: 'long', year: 'numeric', 
    month: 'long', day: 'numeric' 
  });
  const timeStr = now.toLocaleTimeString('en-IN');

  // Check if user is asking something that needs web search
  const lastMsg = messages[messages.length - 1].content.toLowerCase();
  const needsSearch = /news|today|latest|current|price|weather|who is|what is|when did|score|trending|2024|2025|2026/.test(lastMsg);
  
  let searchContext = '';
  if (needsSearch) {
    const query = messages[messages.length - 1].content;
    const searchResult = await webSearch(query);
    if (searchResult) {
      searchContext = `\n\nWeb search results for context:\n${searchResult}`;
    }
  }

  // System prompt with date + search context
  const systemMessage = {
    role: 'user',
    content: `[System: Today is ${dateStr}, current time is ${timeStr} IST. You are a helpful AI assistant. Always give accurate, up to date answers. If asked about current events, use the web search context provided.${searchContext}]\n\nNow answer this: ${messages[messages.length - 1].content}`
  };

  const allMessages = [
    ...messages.slice(0, -1),
    systemMessage
  ];

  const models = [
    'google/gemini-2.0-flash-exp:free',
    'deepseek/deepseek-r1:free',
    'deepseek/deepseek-v3:free',
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
        body: JSON.stringify({ model, messages: allMessages, max_tokens: 1024 })
      });

      const data = await orRes.json();
      const text = data?.choices?.[0]?.message?.content;
      if (text) return res.json({ text, model: model.split('/')[1] });
    } catch(e) { continue; }
  }

  return res.status(503).json({ error: 'All AI services temporarily unavailable. Try again.' });
}
