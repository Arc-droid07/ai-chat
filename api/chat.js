export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {

    const { messages } = req.body

    if (!messages || !messages.length) {
      return res.status(400).json({ error: "No message provided" })
    }

    const lastUserMsg = messages[messages.length - 1].content

    // IMAGE GENERATION CHECK
    const IMG_CHECK = /generate|create|draw|make|show me|image of|picture of|paint|illustrate/i

    if (IMG_CHECK.test(lastUserMsg)) {

      const cleanPrompt = lastUserMsg
        .replace(/generate|create|draw|make|show me|image of|picture of|paint|illustrate|please|can you|for me/gi, '')
        .trim()

      const seed = Math.floor(Math.random() * 999999)

      const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=512&height=512&nologo=true&seed=${seed}&model=flux`

      return res.status(200).json({
        text: "🎨 Here you go!",
        image: imgUrl
      })

    }

    const now = new Date()

    const systemPrompt = `
You are Aki, a smart AI assistant created by Aaradhy Bhatkar.

Your name is Aki.

If anyone asks who created you always say:
"I was created by Aaradhy Bhatkar."

Never say you are ChatGPT.

Be confident and helpful.

Current date: ${now.toLocaleDateString("en-IN")}
`

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
        max_tokens: 1500
      })
    })

    const data = await response.json()

    const text = data?.choices?.[0]?.message?.content

    if (!text) {
      return res.status(500).json({
        error: "AI returned no response",
        debug: data
      })
    }

    return res.status(200).json({ text })

  } catch (err) {

    return res.status(500).json({
      error: "Server error: " + err.message
    })

  }

}
