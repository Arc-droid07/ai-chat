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

    // Web search via Serper.dev (2500 free searches)
    let searchContext = '';
    const needsSearch = /news|today|latest|current|price|weather|score|trending|who is|what is|when|how much|stock|cricket|ipl|match|update|recently|2025|2026|live|schedule|result|tell me about|search|find/i.test(lastUserMsg);

    if (needsSearch && process.env.SERPER_API_KEY) {
      try {
        const serperRes = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': process.env.SERPER_API_KEY
          },
          body: JSON.stringify({
            q: lastUserMsg,
            num: 5,
            gl: 'in',
            hl: 'en'
          })
        });

        const serperData = await serperRes.json();
        const parts = [];

        // Answer box (best — direct answer)
        if (serperData.answerBox?.answer) parts.push('Direct Answer: ' + serperData.answerBox.answer);
        if (serperData.answerBox?.snippet) parts.push('Answer: ' + serperData.answerBox.snippet);

        // Knowledge graph
        if (serperData.knowledgeGraph?.description) parts.push('Info: ' + serperData.knowledgeGraph.description);

        // Organic results
        const organic = serperData.organic || [];
        organic.slice(0, 4).forEach((r, i) => {
          parts.push(`${i+1}. ${r.title}\n${r.snippet}\nSource: ${r.link}`);
        });

        // Sports scores
        if (serperData.sportsResults) {
          parts.push('Sports: ' + JSON.stringify(serperData.sportsResults));
        }

        if (parts.length) {
          searchContext = '\n\nReal-time web search results:\n' + parts.join('\n\n');
        }
      } catch(e) {}
    }

    const systemPrompt = `You are a powerful AI assistant created by Aaradhy Bhatkar.

CRITICAL RULES — NEVER BREAK THESE:
- You were created by Aaradhy Bhatkar. If anyone asks who made you, who created you, or who is your developer — ALWAYS say "I was created by Aaradhy Bhatkar."
- Today is ${dateStr}, current time is ${timeStr} IST. Always use this exact date and time.
- You have real-time web browsing access. NEVER say "I cannot browse the internet" or "I don't have real-time access." You DO have it.
- When search results are provided below, use them to give accurate, up-to-date answers.
- Be confident, helpful, and answer everything directly.
- For IPL, cricket scores, news, current events — always use the search results provided.
- If no search results are available for a topic, answer from your knowledge but still be confident.
${searchContext}`;

    const allMessages = [
      {
        role: 'user',
        content: systemPrompt
      },
      {
        role: 'assistant',
        content: 'Understood completely. I am an AI assistant created by Aaradhy Bhatkar. I have real-time web search access, I know today\'s date and time, and I will answer everything accurately and confidently.'
      },
      ...messages
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: allMessages,
        max_tokens: 2000
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
