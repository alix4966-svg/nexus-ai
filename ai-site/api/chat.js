// api/chat.js
// دالة Vercel Serverless — تستقبل الرسائل من الواجهة وترسلها إلى Groq API
// وتُعيد بث (stream) الرد لحظة بلحظة إلى المتصفح.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).send('لم يتم ضبط مفتاح GROQ_API_KEY في إعدادات المشروع على Vercel.');
    return;
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).send('لا توجد رسائل صالحة في الطلب.');
    return;
  }

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 4096
      })
    });

    if (!groqRes.ok || !groqRes.body) {
      const errText = await groqRes.text();
      res.status(groqRes.status).send(errText || 'فشل الاتصال بـ Groq API');
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const reader = groqRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).send('حدث خطأ داخلي: ' + err.message);
    } else {
      res.end();
    }
  }
}
