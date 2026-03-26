export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {

    const { messages } = req.body;

    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: "No message provided" });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://your-site.vercel.app",
        "X-Title": "AI Chat"
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct",   // MUCH more reliable
        messages: messages
      })
    });

    const data = await response.json();

    console.log("OpenRouter response:", JSON.stringify(data, null, 2));

    const text = data?.choices?.[0]?.message?.content;

    if (!text) {
      return res.status(500).json({
        error: "AI returned no response",
        debug: data
      });
    }

    return res.status(200).json({ text });

  } catch (err) {

    console.error("Server error:", err);

    return res.status(500).json({
      error: "Server error"
    });

  }

}
