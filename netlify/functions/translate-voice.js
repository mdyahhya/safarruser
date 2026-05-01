const FormData = require('form-data');
const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString()
      : event.body;

    const { audio, targetLang, sourceLang } = JSON.parse(body);
    const apiKey = process.env.AI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'API Key not found in environment' })
      };
    }

    // ── STEP 1: Whisper STT ──────────────────────────────────────────────────
    const audioBuffer = Buffer.from(audio, 'base64');
    const form = new FormData();
    form.append('file', audioBuffer, { filename: 'speech.webm', contentType: 'audio/webm' });
    form.append('model', 'whisper-large-v3');
    form.append('response_format', 'json');

    // Source language hint — prevents Whisper from guessing
    if (sourceLang === 'Marathi') form.append('language', 'mr');
    else if (sourceLang === 'Hindi') form.append('language', 'hi');
    else if (sourceLang === 'English') form.append('language', 'en');

    // Vocabulary primer — reduces mis-transcription for HI/MR
    if (sourceLang === 'Marathi') {
      form.append('prompt', 'हे संभाषण मराठीत आहे. सामान्य मराठी शब्द: जायचे, येणार, किती, कुठे, थांबा, पैसे, भाडे, सोडा, चला, आहे, नाही, सांगा, करा, द्या, घ्या, Nashik, station, mall, auto.');
    } else if (sourceLang === 'Hindi') {
      form.append('prompt', 'यह बातचीत हिंदी में है। सामान्य शब्द: जाना, आना, कितना, कहाँ, रुको, पैसे, भाड़ा, छोड़ो, चलो, है, नहीं, बताओ, करो, दो, लो, Nashik, station, mall, auto.');
    } else {
      form.append('prompt', 'This is a conversation between a driver and passenger in India. Common words: station, mall, auto, fare, stop, go, wait, how much, where, Nashik.');
    }

    const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, ...form.getHeaders() },
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

    // ── STEP 2: Build system prompt ──────────────────────────────────────────
    const langLabel = {
      'English': 'English',
      'Hindi': 'Hindi (Devanagari script)',
      'Marathi': 'Marathi (Pune/Mumbai spoken dialect, Devanagari script)'
    };

    const srcLabel = langLabel[sourceLang] || sourceLang || 'unknown';
    const tgtLabel = langLabel[targetLang] || targetLang;

    const systemPrompt = `You are a professional translator for Safarr, an Indian auto-rickshaw app used in Maharashtra.

SOURCE LANGUAGE (CONFIRMED, DO NOT CHANGE): ${srcLabel}
TARGET LANGUAGE: ${tgtLabel}

RULES:
1. SOURCE IS LOCKED. The input text is always ${srcLabel}. Never re-detect or guess the language. Treat all input as ${srcLabel} regardless of how it looks.
2. MIXED LANGUAGE. If the input contains English words or Indian place names mixed in (e.g. "station", "mall", "Nashik", "auto"), keep those words in English as-is. Only translate the rest into ${tgtLabel}.
3. MARATHI DIALECT. When translating into Marathi, use everyday spoken Marathi of Pune and Mumbai. Use "तुम्ही / तुम्हाला" for neutral or formal. Use "तू / तुला" only if the original explicitly used "Tu". Never use Sanskrit-heavy or textbook Marathi.
4. HINDI FORMALITY. Use "आप / आपको" for neutral or formal tone. Use "तुम / तुम्हें" only if the original used "Tum". Never default to "Tu/Tera".
5. ENGLISH. Use simple natural Indian-English. Short sentences. Avoid formal or bureaucratic phrasing.
6. TONE. Match the speaker's tone exactly — polite, urgent, casual, or frustrated.
7. NO ADDITIONS. Translate only what was said. No extra words, no explanations, no greetings.
8. OUTPUT. Return ONLY the translated string. No quotes, no labels, no commentary.`;

    // ── STEP 3: Translation via llama-3.3-70b-versatile ─────────────────────
    const translationRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `[Source: ${sourceLang}]\n${transcription}` }
        ],
        temperature: 0.1,
        max_tokens: 512
      })
    });

    const translationData = await translationRes.json();

    if (!translationData.choices || !translationData.choices[0]) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Translation model error', details: translationData })
      };
    }

    const translatedText = translationData.choices[0].message.content.trim();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcription: transcription,
        translatedText: translatedText,
        sourceLang: sourceLang,
        targetLang: targetLang
      })
    };

  } catch (error) {
    console.error('Safarr Translate Error:', error);
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
};s
