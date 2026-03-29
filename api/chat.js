export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, memoryContext, notifContext } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'No messages' });
    const lastUserMsg = messages[messages.length - 1].content;

    // Image generation
    const IMG_CHECK = /\bgenerate\b|\bdraw\b|\bpaint\b|\billustrate\b|image of|picture of|create an image|make an image|show me an image/i;
    if (IMG_CHECK.test(lastUserMsg)) {
      const clean = lastUserMsg.replace(/generate|create|draw|make|show me|image of|picture of|paint|illustrate|hey aki|aki|please|can you|for me/gi, '').trim();
      const seed = Math.floor(Math.random() * 999999);
      const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(clean)}?width=512&height=512&nologo=true&seed=${seed}&model=flux`;
      try {
        const imgCheck = await fetch(imgUrl);
        if (imgCheck.ok) return res.status(200).json({ text: '🎨 Here you go!', image: imgUrl });
      } catch(e) {}
      return res.status(200).json({ text: '❌ Image generation failed. Try again!' });
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Asia/Kolkata'
    });
    const timeStr = now.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
    });

    // Web search via Serper
    let searchContext = '';
    const needsSearch = /news|today|latest|current|price|weather|score|trending|who is|what is|when|how much|stock|cricket|ipl|match|update|recently|2025|2026|live/i.test(lastUserMsg);
    if (needsSearch && process.env.SERPER_API_KEY) {
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

    const systemPrompt = `You are Aki, a smart AI assistant created by Aaradhy Bhatkar. Your name is Aki. If anyone asks who created you — always say "I was created by Aaradhy Bhatkar." Never say you are any other AI. Today is ${dateStr}, time is ${timeStr} IST. Be helpful, confident and answer everything directly.${searchContext}
${memoryContext || ''}
${notifContext || ''}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        max_tokens: 1500
      })
    });

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return res.status(500).json({ error: 'AI failed: ' + JSON.stringify(data) });
    return res.status(200).json({ text });

  } catch(err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
