export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages } = req.body;
    const userMessage = messages?.[messages.length - 1]?.content;

    if (!userMessage) {
      return res.status(400).json({ error: "No user message" });
    }

    // -----------------------
    // 1️⃣ GEMINI (PRIMARY)
    // -----------------------
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: userMessage }]
              }
            ]
          })
        }
      );

      const data = await geminiRes.json();

      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) {
        return res.status(200).json({ text, provider: "gemini" });
      }

      console.log("Gemini failed:", data);

    } catch (err) {
      console.log("Gemini error:", err);
    }

    // -----------------------
    // 2️⃣ OPENROUTER (FALLBACK)
    // -----------------------
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
            messages: [{ role: "user", content: userMessage }]
          })
        }
      );

      const data = await openRes.json();

      const text = data?.choices?.[0]?.message?.content;

      if (text) {
        return res.status(200).json({ text, provider: "openrouter" });
      }

      console.log("OpenRouter failed:", data);

    } catch (err) {
      console.log("OpenRouter error:", err);
    }

    // -----------------------
    // FINAL FAIL
    // -----------------------
    return res.status(500).json({
      error: "All AI providers failed"
    });

  } catch (err) {
    console.error("SERVER CRASH:", err);
    return res.status(500).json({ error: "Server crash" });
  }
}
