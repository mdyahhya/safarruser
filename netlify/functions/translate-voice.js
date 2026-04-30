const FormData = require('form-data');
const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body;
    const { audio, targetLang, sourceLang } = JSON.parse(body);
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
    
    // Improve accuracy by hinting the source language
    if (sourceLang === 'Marathi') form.append('language', 'mr');
    else if (sourceLang === 'Hindi') form.append('language', 'hi');
    else if (sourceLang === 'English') form.append('language', 'en');

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
            content: `You are a professional translator for Safarr.
            Your task: Translate the input text entirely into ${targetLang}. 

            Rules for Pronouns and Tone:
            1. FORMALITY MATCHING: Match the exact formality and respect level of the speaker.
               - If the speaker uses informal pronouns (like 'Tu' or 'Tum'), use the equivalent informal/friendly pronouns in ${targetLang}.
               - If the speaker uses formal pronouns (like 'Aap'), use the equivalent formal/respectful pronouns in ${targetLang} (e.g., 'Tumhi' in Marathi).
            2. SIMPLE WORDS: Use natural, simple, and common vocabulary that people actually use in daily conversation.
            3. NO ADDITIONS: Translate exactly what was heard. Do not add explanations or extra words.
            4. ACCURACY: Ensure the translation is grammatically perfect and flows naturally in ${targetLang}.
            5. Return ONLY the translated string.`
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
