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

    // Real date/time IST
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Asia/Kolkata'
    });
    const timeStr = now.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
    });

    // Web search via DuckDuckGo
    let searchContext = '';
    const needsSearch = /news|today|latest|current|price|weather|score|trending|who is|what is|when|how much|stock|cricket|ipl|match|update|recently|2025|2026|live/i.test(lastUserMsg);
    if (needsSearch) {
      try {
        const q = encodeURIComponent(lastUserMsg);
        const ddg = await fetch(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`);
        const ddgData = await ddg.json();
        const parts = [];
        if (ddgData.AbstractText) parts.push(ddgData.AbstractText);
        if (ddgData.Answer) parts.push(ddgData.Answer);
        if (ddgData.Definition) parts.push(ddgData.Definition);
        ddgData.RelatedTopics?.slice(0, 3).forEach(t => { if (t.Text) parts.push(t.Text); });
        if (parts.length) searchContext = '\n\nWeb search results:\n' + parts.join('\n');
      } catch(e) {}
    }

    // Inject system context + date + search into conversation
    const systemMessages = [
      {
        role: 'user',
        content: `[SYSTEM: Today is ${dateStr}, time is ${timeStr} IST. You are a smart AI assistant. Always use this exact date when asked. If web search results are provided below, use them to answer accurately.${searchContext}]`
      },
      {
        role: 'assistant',
        content: 'Understood. I know today\'s date, time, and any web search context provided. I\'ll answer accurately.'
      }
    ];

    const allMessages = [...systemMessages, ...messages];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-3.5-turbo',
        messages: allMessages,
        max_tokens: 1500
      })
    });

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return res.status(500).json({ error: 'AI failed' });

    return res.status(200).json({ text });
  } catch(err) {
    return res.status(500).json({ error: 'Server error' });
  }
}
