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

    // ── IMAGE GENERATION ──
    // ONLY triggers on explicit image requests
    // "create a list", "created by", "make a plan" will NOT trigger this
    const IMG_EXPLICIT = /\b(generate|create|make|draw|paint|show me)\s+(an?\s+)?(image|photo|picture|illustration|artwork|painting|portrait|wallpaper|logo|banner|poster)\b/i;
    const IMG_DIRECT = /\b(image of|picture of|photo of|draw me|paint me)\b/i;

    if (IMG_EXPLICIT.test(lastUserMsg) || IMG_DIRECT.test(lastUserMsg)) {
      const clean = lastUserMsg
        .replace(/\b(generate|create|make|draw|paint|show me|can you|please|aki|hey|an?)\b/gi, '')
        .replace(/\b(image|picture|photo|illustration|artwork|painting|portrait|wallpaper|logo|banner|poster)\s*(of|for)?\b/gi, '')
        .trim() || 'beautiful abstract artwork';

      const seed = Math.floor(Math.random() * 999999);
      const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(clean)}?width=512&height=512&nologo=true&seed=${seed}&model=flux`;
      return res.status(200).json({ text: '🎨 Here is your image!', image: imgUrl, imagePrompt: clean });
    }

    // ── DATE/TIME ──
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' });
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

    // ── WEB SEARCH ──
    let searchContext = '';
    const needsSearch = /news|today|latest|current|price|weather|score|trending|who is|what is|when|how much|stock|cricket|ipl|match|update|recently|2025|2026|live/i.test(lastUserMsg);
    if (needsSearch && process.env.SERPER_API_KEY) {
      try {
        const sd = await (await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-KEY': process.env.SERPER_API_KEY },
          body: JSON.stringify({ q: lastUserMsg, num: 5, gl: 'in', hl: 'en' })
        })).json();
        const parts = [];
        if (sd.answerBox?.answer) parts.push('Answer: ' + sd.answerBox.answer);
        if (sd.answerBox?.snippet) parts.push(sd.answerBox.snippet);
        if (sd.knowledgeGraph?.description) parts.push(sd.knowledgeGraph.description);
        (sd.organic || []).slice(0, 3).forEach((r, i) => parts.push(`${i+1}. ${r.title}: ${r.snippet}`));
        if (parts.length) searchContext = '\n\nWeb search results:\n' + parts.join('\n');
      } catch (e) {}
    }

    // ── SYSTEM PROMPT ──
    const systemPrompt = `You are Aki, a smart and friendly AI assistant created by Aaradhy Bhatkar (also known as Arc).
- Your name is Aki. NEVER say you are ChatGPT, Claude, Gemini, Llama or any other AI.
- If asked who made you or who created you: always say "I was created by Aaradhy Bhatkar."
- Today is ${dateStr}. Current time is ${timeStr} IST. Always use this when asked.
- You are helpful, confident, friendly and thorough.
- IMPORTANT: Words like "create", "created", "make", "made" in messages do NOT mean the user wants an image unless they explicitly say "image", "picture" or "photo".
- Never refuse to answer. Always try your best.${searchContext}${memoryContext || ''}${notifContext || ''}`;

    // ── MULTI-KEY GROQ (Primary — Fast & Free) ──
    // Add GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3 in Vercel env vars
    const groqKeys = [
      process.env.GROQ_API_KEY,
      process.env.GROQ_API_KEY_2,
      process.env.GROQ_API_KEY_3,
    ].filter(Boolean);

    let text = null, modelUsed = null;

    if (groqKeys.length) {
      const groqKey = groqKeys[Math.floor(Math.random() * groqKeys.length)];
      try {
        const d = await (await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            max_tokens: 1500
          })
        })).json();
        text = d?.choices?.[0]?.message?.content;
        if (text) modelUsed = 'Llama 3.3 70B';
      } catch (e) {}
    }

    // ── MULTI-KEY OPENROUTER (Fallback) ──
    if (!text) {
      const orKeys = [
        process.env.OPENROUTER_API_KEY,
        process.env.OPENROUTER_API_KEY_2,
        process.env.OPENROUTER_API_KEY_3,
      ].filter(Boolean);

      if (orKeys.length) {
        const orKey = orKeys[Math.floor(Math.random() * orKeys.length)];
        const models = [
          'openai/gpt-3.5-turbo',
          'google/gemma-2-9b-it:free',
          'mistralai/mistral-7b-instruct:free',
        ];

        for (const model of models) {
          if (text) break;
          try {
            const d = await (await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${orKey}`,
                'HTTP-Referer': 'https://ai-chat-beige-alpha.vercel.app',
                'X-Title': 'Aki AI'
              },
              body: JSON.stringify({
                model,
                messages: [{ role: 'system', content: systemPrompt }, ...messages],
                max_tokens: 1500
              })
            })).json();
            const t = d?.choices?.[0]?.message?.content;
            if (t) { text = t; modelUsed = model.split('/')[1]?.split(':')[0]; }
          } catch (e) {}
        }
      }
    }

    if (!text) return res.status(503).json({ error: 'All AI services temporarily unavailable. Please try again.' });
    return res.status(200).json({ text, model: modelUsed });

  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
