// api/chat.js
// دالة Vercel Serverless — تستقبل الرسائل (نص/صور/ملفات) من الواجهة
// وترسلها إلى Groq API باستخدام الموديل اللي يختاره المستخدم من الإعدادات،
// وتُعيد بث (stream) الرد لحظة بلحظة إلى المتصفح.

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

// قائمة بسيطة للحماية: تأكد إن اسم الموديل نص معقول (يمنع حقن قيم غريبة بالطلب)
function sanitizeModel(model) {
  if (typeof model !== 'string') return DEFAULT_MODEL;
  const trimmed = model.trim();
  if (!trimmed || trimmed.length > 100 || !/^[a-zA-Z0-9._\-\/]+$/.test(trimmed)) {
    return DEFAULT_MODEL;
  }
  return trimmed;
}

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

  const { messages, model } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).send('لا توجد رسائل صالحة في الطلب.');
    return;
  }

  const chosenModel = sanitizeModel(model);

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: chosenModel,
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 4096
      })
    });

    if (!groqRes.ok || !groqRes.body) {
      const errText = await groqRes.text();
      // إذا الموديل غير موجود عند Groq، نرجّع رسالة عربية واضحة بدل خطأ تقني غامض
      if (groqRes.status === 404 || /model/i.test(errText)) {
        res.status(groqRes.status).send(
          `تعذّر استخدام الموديل "${chosenModel}". تأكد إن اسمه مطابق تمامًا لاسم موديل متوفر عند Groq (من ⚙️ الإعدادات). التفاصيل: ${errText}`
        );
        return;
      }
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
