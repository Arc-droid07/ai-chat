export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { messages } = req.body;

    // Inject today's real date into every conversation
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('en-IN');

    const messagesWithDate = [
      {
        role: "user",
        content: `[System context: Today is ${dateStr}. Current time is ${timeStr} IST. You are a helpful AI assistant. Always use this date when asked about today's date or current time.]`
      },
      {
        role: "assistant",
        content: "Understood. I know today's date and time and will use it accurately."
      },
      ...messages
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`
      },
      body: JSON.stringify({
        model: "openai/gpt-3.5-turbo",
        messages: messagesWithDate
      })
    });

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      return res.status(500).json({ error: "AI failed" });
    }
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
}
