const FormData = require('form-data');
const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body;
    const { audio, targetLang } = JSON.parse(body);
    const apiKey = process.env.AI_API_KEY;

    if (!apiKey) {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'API Key not found in environment' }) 
      };
    }

    const audioBuffer = Buffer.from(audio, 'base64');
    const form = new FormData();
    form.append('file', audioBuffer, { filename: 'speech.webm', contentType: 'audio/webm' });
    form.append('model', 'whisper-large-v3-turbo');
    form.append('response_format', 'json');

    const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${apiKey}`, 
        ...form.getHeaders() 
      },
      body: form
    });

    const whisperData = await whisperRes.json();
    const transcription = whisperData.text;

    if (!transcription) {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'Transcription failed', details: whisperData }) 
      };
    }

    const translationRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `You are a direct translator. 
            Your task: Translate the input text entirely into ${targetLang}. 

            Rules:
            1. Provide a direct, literal translation of the input text.
            2. Do not add, remove, or change any information from the original message.
            3. Do not use your own phrasing; only translate exactly what the user said.
            4. If the target is Hindi or Marathi, use respectful pronouns (Aap/Tumhi).
            5. Return ONLY the translated string with no quotes or extra text.`
          },
          {
            role: "user",
            content: transcription
          }
        ],
        temperature: 0.3
      })
    });

    const translationData = await translationRes.json();
    const translatedText = translationData.choices[0].message.content.trim();

    return {
      statusCode: 200,
      body: JSON.stringify({
        transcription: transcription,
        translatedText: translatedText
      })
    };

  } catch (error) {
    console.error('AI Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Translation Service Error', 
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
