export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { messages } = req.body;
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel thiếu GROQ_API_KEY trong cấu hình Environment Variables.' });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192', // Siêu nhanh, rất hợp để đóng vai Coach giao tiếp
        messages: messages,
        temperature: 0.7,
        max_tokens: 300
      })
    });

    const data = await response.json();
    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const aiText = data.choices[0].message.content;
    return res.status(200).json({ text: aiText });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
