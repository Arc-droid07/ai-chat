export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {

    const { messages } = req.body;

    if (!messages || !messages.length) {
      return res.status(400).json({ error: "No message provided" });
    }

    const userMessage = messages[messages.length - 1].content;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=" + process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
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

    const data = await response.json();

    console.log("FULL GEMINI RESPONSE:", JSON.stringify(data, null, 2));

    // ✅ FIXED TEXT EXTRACTION
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map(p => p.text)
        ?.join("") || null;

    if (!text) {
      return res.status(500).json({
        error: "AI returned empty response",
        debug: data
      });
    }

    return res.status(200).json({
      text: text
    });

  } catch (err) {

    console.error("SERVER ERROR:", err);

    return res.status(500).json({
      error: "AI service unavailable"
    });

  }

}
