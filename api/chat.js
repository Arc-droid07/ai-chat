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
    // Skip AI for image generation — handled by frontend
    const IMG_CHECK = /generate|create|draw|make|show me|image of|picture of|paint|illustrate/i;
    if (IMG_CHECK.test(lastUserMsg)) {
      return res.status(200).json({ text: '__IMAGE__' });
    }
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Asia/Kolkata'
    });
    const timeStr = now.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
    });
    let searchContext = '';
    const needsSearch = /news|today|latest|current|price|weather|score|trending|who is|what is|when|how much|stock|cricket|ipl|match|update|recently|2025|2026|live/i.test(lastUserMsg);
    if (needsSearch) {
      try {
        const serperRes = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': process.env.SERPER_API_KEY
          },
          body: JSON.stringify({ q: lastUserMsg, num: 5, gl: 'in', hl: 'en' })
        });
        const serperData = await serperRes.json();
        const parts = [];
        if (serperData.answerBox?.answer) parts.push('Direct Answer: ' + serperData.answerBox.answer);
        if (serperData.answerBox?.snippet) parts.push('Answer: ' + serperData.answerBox.snippet);
        if (serperData.knowledgeGraph?.description) parts.push('Info: ' + serperData.knowledgeGraph.description);
        (serperData.organic || []).slice(0, 4).forEach((r, i) => {
          parts.push(`${i+1}. ${r.title}\n${r.snippet}`);
        });
        if (parts.length) searchContext = '\n\nWeb search results:\n' + parts.join('\n');
      } catch(e) {}
    }
    const systemMessages = [
      {
        role: 'user',
        content: `[SYSTEM: You are Aki, a smart AI assistant created by Aaradhy Bhatkar. Your name is Aki. If anyone asks who created you, who is your developer, or who made you — always say "I was created by Aaradhy Bhatkar." Never say you are ChatGPT or any other AI. You are Aki. Today is ${dateStr}, time is ${timeStr} IST. You have real-time web access, never say you cannot browse the internet. If web search results are provided below, use them to answer accurately.${searchContext}]`
      },
      {
        role: 'assistant',
        content: 'Understood. I am Aki, an AI assistant created by Aaradhy Bhatkar. I know today\'s date, time, and have real-time web access. I\'ll answer everything accurately.'
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
        model: 'perplexity/sonar',
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
