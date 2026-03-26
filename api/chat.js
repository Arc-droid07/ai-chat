export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  try {
    const { messages } = req.body;

    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: "No messages" });
    }

    // -------------------------
    // 1️⃣ GEMINI (FAST + FREE)
    // -------------------------
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        return res.status(200).json({
          text,
          provider: "gemini"
        });
      }

      console.log("Gemini failed:", data);

    } catch (err) {
      console.log("Gemini error:", err);
    }

    // -------------------------
    // 2️⃣ OPENROUTER (STREAMING)
    // -------------------------
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
          messages,
          stream: true
        })
      }
    );

    res.setHeader("Content-Type", "text/plain");

    for await (const chunk of openRes.body) {
      res.write(chunk);
    }

    res.end();

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}
