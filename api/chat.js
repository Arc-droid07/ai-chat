export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, memoryContext, notifContext, calendarToken } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'No messages' });

    const lastUserMsg = messages[messages.length - 1].content;

    // ── IMAGE GENERATION ──
    const IMG_EXPLICIT = /\b(generate|create|make|draw|paint|show me)\s+(an?\s+)?(image|photo|picture|illustration|artwork|painting|portrait|wallpaper|logo|banner|poster)\b/i;
    const IMG_DIRECT = /\b(image of|picture of|photo of|draw me|paint me)\b/i;

    if (IMG_EXPLICIT.test(lastUserMsg) || IMG_DIRECT.test(lastUserMsg)) {
      const clean = lastUserMsg
        .replace(/\b(generate|create|make|draw|paint|show me|can you|please|aki|hey|an?)\b/gi, '')
        .replace(/\b(image|picture|photo|illustration|artwork|painting|portrait|wallpaper|logo|banner|poster)\s*(of|for)?\b/gi, '')
        .trim() || 'beautiful abstract artwork';
      const seed = Math.floor(Math.random() * 999999);
      const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(clean)}?width=512&height=512&nologo=true&seed=${seed}&model=flux`;
      return res.status(200).json({ text: '🎨 Here is your image!', image: imgUrl });
    }

    // ── DATE/TIME ──
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' });
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

    // ── GOOGLE CALENDAR EVENT CREATION ──
    const CALENDAR_TRIGGERS = /\b(remind me|set a reminder|add to calendar|schedule|book|create an? (event|meeting|appointment)|add an? (event|meeting|appointment))\b/i;

    if (CALENDAR_TRIGGERS.test(lastUserMsg) && calendarToken) {
      const calendarResult = await createCalendarEvent(lastUserMsg, calendarToken, now);
      if (calendarResult.success) {
        return res.status(200).json({
          text: `✅ Done! I've added **"${calendarResult.title}"** to your Google Calendar on **${calendarResult.dateDisplay}**. You'll get a reminder before it starts! 🗓️`,
          calendarEvent: calendarResult
        });
      }
    }

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
        (sd.organic || []).slice(0, 3).forEach((r, i) => parts.push(`${i + 1}. ${r.title}: ${r.snippet}`));
        if (parts.length) searchContext = '\n\nWeb search results:\n' + parts.join('\n');
      } catch (e) {}
    }

    // ── SYSTEM PROMPT ──
    const calendarStatus = calendarToken
      ? '\n- You have access to the user\'s Google Calendar. When they ask to set a reminder or schedule something, confirm it is being added to their calendar.'
      : '\n- Google Calendar is NOT connected. If the user asks to set a reminder or schedule something, tell them to connect Google Calendar using the calendar button in the app first.';

    const systemPrompt = `You are Aki, a smart and friendly AI assistant created by Aaradhy Bhatkar (also known as Arc).
- Your name is Aki. NEVER say you are ChatGPT, Claude, Gemini, Llama or any other AI.
- If asked who made you or who created you: always say "I was created by Aaradhy Bhatkar."
- Today is ${dateStr}. Current time is ${timeStr} IST. Always use this when asked.
- You are helpful, confident, friendly and thorough.
- IMPORTANT: Words like "create", "created", "make", "made" in messages do NOT mean the user wants an image unless they explicitly say "image", "picture" or "photo".
- Never refuse to answer. Always try your best.${calendarStatus}${searchContext}${memoryContext || ''}${notifContext || ''}`;

    // ── MULTI-KEY GROQ ──
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

// ── GOOGLE CALENDAR EVENT CREATOR ──
async function createCalendarEvent(userMessage, accessToken, now) {
  try {
    // Parse date and time from message
    const { title, startDateTime, endDateTime, dateDisplay } = parseEventDetails(userMessage, now);

    const event = {
      summary: title,
      start: { dateTime: startDateTime, timeZone: 'Asia/Kolkata' },
      end: { dateTime: endDateTime, timeZone: 'Asia/Kolkata' },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'popup', minutes: 10 }
        ]
      }
    };

    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Calendar API error:', err);
      return { success: false, error: err.error?.message };
    }

    const created = await response.json();
    return {
      success: true,
      title,
      dateDisplay,
      eventId: created.id,
      eventLink: created.htmlLink
    };

  } catch (e) {
    return { success: false, error: e.message };
  }
}

function parseEventDetails(msg, now) {
  // Extract event title - remove trigger words
  let title = msg
    .replace(/\b(remind me to|remind me|set a reminder (for|to)?|add to calendar|schedule|book|create an? (event|meeting|appointment) (for|to)?|add an? (event|meeting|appointment) (for|to)?)\b/gi, '')
    .replace(/\b(on|at|this|next|tomorrow|today)\b.*$/i, '') // remove date/time suffix
    .trim();

  if (!title || title.length < 2) title = 'Reminder from Aki';

  // Parse date
  let targetDate = new Date(now);
  const msgLower = msg.toLowerCase();

  if (msgLower.includes('tomorrow')) {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (msgLower.includes('next week')) {
    targetDate.setDate(targetDate.getDate() + 7);
  } else if (msgLower.includes('next monday')) {
    const day = targetDate.getDay();
    targetDate.setDate(targetDate.getDate() + (8 - day) % 7);
  } else {
    // Try to parse specific date like "4th april", "april 4", "4/4"
    const datePatterns = [
      /(\d{1,2})(st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{4})?/i,
      /(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(st|nd|rd|th)?\s*(\d{4})?/i,
      /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/
    ];

    for (const pattern of datePatterns) {
      const match = msg.match(pattern);
      if (match) {
        try {
          const parsed = new Date(match[0]);
          if (!isNaN(parsed.getTime())) {
            targetDate = parsed;
            // If year not specified and date is in past, assume next year
            if (targetDate < now && !match[0].includes(now.getFullYear().toString())) {
              targetDate.setFullYear(now.getFullYear() + 1);
            }
          }
        } catch (e) {}
        break;
      }
    }
  }

  // Parse time
  let hours = 9, minutes = 0; // default 9am
  const timeMatch = msg.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeMatch) {
    hours = parseInt(timeMatch[1]);
    minutes = parseInt(timeMatch[2] || '0');
    const meridiem = timeMatch[3].toLowerCase();
    if (meridiem === 'pm' && hours !== 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
  } else {
    // 24hr format
    const time24 = msg.match(/\bat\s+(\d{1,2}):(\d{2})\b/);
    if (time24) {
      hours = parseInt(time24[1]);
      minutes = parseInt(time24[2]);
    }
  }

  targetDate.setHours(hours, minutes, 0, 0);

  const endDate = new Date(targetDate.getTime() + 60 * 60 * 1000); // +1 hour

  const dateDisplay = targetDate.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
  });

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    startDateTime: targetDate.toISOString(),
    endDateTime: endDate.toISOString(),
    dateDisplay
  };
}
