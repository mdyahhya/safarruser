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
            content: `You are a specialized translator for Safarr, a premium ride-hailing app.
            Your task: Translate the input text entirely into ${targetLang}. 

            Guidelines for high-quality conversion:
            1. TONE: Maintain a professional, respectful, and helpful tone (service industry standard).
            2. PRONOUNS: Use respectful pronouns by default (e.g., 'Aap' in Hindi instead of 'Tum', 'Tumhi' in Marathi instead of 'Tu').
            3. CONTEXT: The conversation is between a Passenger and a Driver. Use contextually appropriate vocabulary (e.g., 'Location', 'Wait', 'Payment', 'Arriving').
            4. ACCURACY: Translate every single word. Do not mix languages. Ensure the output is natural and grammatically perfect in ${targetLang}.
            5. SCRIPT: Use the correct script (Devanagari for Hindi/Marathi).
            
            Return ONLY the translated string.`
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
