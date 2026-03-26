export default async function handler(req, res) {

if (req.method !== "POST") {
return res.status(405).json({ error: "Method not allowed" });
}

try {

const { messages } = req.body;

const userMessage = messages?.[messages.length - 1]?.content;

if (!userMessage) {
return res.status(400).json({ error: "No user message received" });
}

const response = await fetch(
`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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

if (data.error) {
return res.status(500).json({
error: data.error.message
});
}

const text =
data?.candidates?.[0]?.content?.parts?.[0]?.text;

if (!text) {
return res.status(500).json({
error: "Gemini returned no text",
debug: data
});
}

return res.status(200).json({ text });

} catch (err) {

console.error("SERVER ERROR:", err);

return res.status(500).json({
error: "Server crash"
});

}

}
