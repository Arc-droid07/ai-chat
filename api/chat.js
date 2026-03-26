const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OR_KEY = process.env.OPENROUTER_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

 const message = req.body.message || req.body.prompt || req.body.msg || req.body.input;
if (!message) return res.status(400).json({ error: 'No message provided' });
  
  // Try OpenRouter FIRST (free models)
  if (OR_KEY) {
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
          model: 'mistralai/mistral-7b-instruct:free',
          messages: [{ role: 'user', content: message }]
        })
      });
      const data = await orRes.json();
      if (data?.choices?.[0]?.message?.content) {
        return res.json({ reply: data.choices[0].message.content });
      }
    } catch (e) {}
  }

  // Fallback to Gemini
  if (GEMINI_KEY) {
    try {
      const gRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: message }] }] })
        }
      );
      const data = await gRes.json();
      if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return res.json({ reply: data.candidates[0].content.parts[0].text });
      }
    } catch (e) {}
  }

  return res.status(503).json({ error: 'All AI services temporarily unavailable. Try again in a few minutes.' });
}
