const FormData = require('form-data');
const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { audio, targetLang } = JSON.parse(event.body);
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
            content: `You are a professional translator for a ride-hailing app called Safarr. 
            Translate the user's message into ${targetLang}. 
            Only return the translated text, nothing else. 
            If the message is already in ${targetLang}, return it as is.`
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
      body: JSON.stringify({ error: 'Internal Server Error', details: error.message })
    };
  }
};
