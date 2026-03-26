export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages } = req.body;

    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: "No messages" });
    }

    // GEMINI (PRIMARY)
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: messages.map(m => ({
              role: m.role,
              parts: [{ text: m.content }]
            }))
          })
        }
      );

      const data = await geminiRes.json();

      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) {
        return res.status(200).json({ text });
      }

    } catch (err) {
      console.log("Gemini failed");
    }

    // FALLBACK → OpenRouter
    try {
      const openRes = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`
          },
          body: JSON.stringify({
            model: "openai/gpt-3.5-turbo",
            messages
          })
        }
      );

      const data = await openRes.json();

      const text = data?.choices?.[0]?.message?.content;

      if (text) {
        return res.status(200).json({ text });
      }

    } catch (err) {
      console.log("OpenRouter failed");
    }

    return res.status(500).json({
      error: "All providers failed"
    });

  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
}
