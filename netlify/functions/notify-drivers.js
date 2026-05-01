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

    // ── STEP 1: Whisper STT with source-language hint ──────────────────────
    const audioBuffer = Buffer.from(audio, 'base64');
    const form = new FormData();
    form.append('file', audioBuffer, { filename: 'speech.webm', contentType: 'audio/webm' });
    form.append('model', 'whisper-large-v3-turbo');
    form.append('response_format', 'json');

    // Hint Whisper with confirmed source language — prevents mis-detection
    if (sourceLang === 'Marathi')      form.append('language', 'mr');
    else if (sourceLang === 'Hindi')   form.append('language', 'hi');
    else if (sourceLang === 'English') form.append('language', 'en');

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

    // ── STEP 2: Source-aware system prompt with few-shot examples ──────────
    const langLabel = {
      'English': 'English',
      'Hindi':   'Hindi (Hindustani, Devanagari script)',
      'Marathi': 'Marathi (Pune/Mumbai spoken dialect, Devanagari script)'
    };

    const srcLabel = langLabel[sourceLang] || sourceLang || 'unknown';
    const tgtLabel = langLabel[targetLang] || targetLang;

    const fewShotExamples = `
REFERENCE EXAMPLES — match this style exactly:

[English → Hindi]
"Where do you want to go?" → "आप कहाँ जाना चाहते हैं?"
"The traffic is bad today." → "आज ट्रैफिक बहुत ज़्यादा है।"
"I will be there in 5 minutes." → "मैं 5 मिनट में पहुँच जाऊँगा।"
"Please sit, I will start now." → "बैठिए, मैं अभी चलता हूँ।"

[Hindi → English]
"मुझे स्टेशन जाना है।" → "I need to go to the station."
"कितना टाइम लगेगा?" → "How long will it take?"
"भाड़ा कितना होगा?" → "How much will the fare be?"
"आप ठीक हैं?" → "Are you okay?"

[English → Marathi]
"Where do you want to go?" → "तुम्हाला कुठे जायचे आहे?"
"We will reach in 10 minutes." → "आपण दहा मिनिटांत पोहोचू."
"Please wait outside." → "कृपया बाहेर थांबा."
"The route has traffic." → "रस्त्यावर जास्त गर्दी आहे."

[Marathi → English]
"मला पुण्याला जायचं आहे." → "I want to go to Pune."
"किती वेळ लागेल?" → "How long will it take?"
"मला उशीर होतोय." → "I am getting late."
"भाडं किती आहे?" → "What is the fare?"

[Hindi → Marathi]
"आप कहाँ जाना चाहते हैं?" → "तुम्हाला कुठे जायचे आहे?"
"मुझे देर हो रही है।" → "मला उशीर होतोय."
"बैठिए, चलते हैं।" → "बसा, निघूया."
"कितना किलोमीटर है?" → "किती किलोमीटर आहे?"

[Marathi → Hindi]
"तुम्हाला कुठे जायचे आहे?" → "आप कहाँ जाना चाहते हैं?"
"मला उशीर होतोय." → "मुझे देर हो रही है।"
"गाडी थांबवा इथेच." → "गाड़ी यहीं रोकिए।"
"किती पैसे होतील?" → "कितने पैसे होंगे?"`;

    const systemPrompt = `You are a professional multilingual translator built into Safarr, an Indian auto-rickshaw ride-hailing app used in Maharashtra.

SOURCE LANGUAGE (CONFIRMED — do not re-detect): ${srcLabel}
TARGET LANGUAGE: ${tgtLabel}

${fewShotExamples}

RULES:
1. SOURCE IS LOCKED: The input is always in ${srcLabel}. Never guess or change this. Even if the text looks ambiguous, treat it as ${srcLabel}.
2. MARATHI DIALECT: Use everyday spoken Marathi of Pune and Mumbai. 
   - Use "तुम्ही / तुम्हाला" for neutral and formal address.
   - Use "तू / तुला" ONLY if the original speaker explicitly used "Tu".
   - Never use Sanskrit-heavy or textbook Marathi words. Prefer: "जायचे" over "जाणे", "किती" over "कति".
3. HINDI FORMALITY:
   - Use "आप / आपको / आपसे" for formal or neutral tone.
   - Use "तुम / तुम्हें" only if the original used "Tum".
   - Never use "Tu/Tera" unless the original was extremely casual between friends.
4. ENGLISH: Use simple, natural Indian-English. Short sentences. Prefer "I need to go" over "I wish to proceed".
5. TONE PRESERVATION: Match the speaker's emotional register — polite, urgent, casual, frustrated — exactly.
6. NO ADDITIONS: Do not add explanations, greetings, or any words not in the original.
7. OUTPUT FORMAT: Return ONLY the translated string. No quotes, no labels, no commentary.`;

    // ── STEP 3: Translation via llama-3.3-70b-versatile ───────────────────
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
          { role: 'user',   content: transcription }
        ],
        temperature: 0.2,
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
        transcription:  transcription,
        translatedText: translatedText,
        sourceLang:     sourceLang,
        targetLang:     targetLang
      })
    };

  } catch (error) {
    console.error('Safarr Translate Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error:   'Translation Service Error',
        message: error.message,
        stack:   process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
