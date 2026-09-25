// /api/translate.js
//
// Plain Vercel serverless function (no framework needed - any file inside
// /api becomes an endpoint automatically once this project is deployed on
// Vercel). This is the ONLY place the real Vercel AI Gateway key is ever
// read - it lives in the AI_GATEWAY_API_KEY environment variable on the
// Vercel project, never in the browser.
//
// Request body (sent by the frontend's callModel()):
//   { model: "openai/gpt-6-luna", parts: [ {text}, {inlineData:{mimeType,data}}? ] }
// `parts` intentionally reuses the same Gemini-style shape the rest of the
// React app already builds (one optional text part + one optional inline
// image part), so nothing on the frontend has to change - this function is
// the only thing that translates that shape into what the Gateway expects.
//
// Response body: shaped exactly like Gemini's generateContent response,
//   { candidates: [ { content: { parts: [ { text } ] } } ] }
// so every existing `data.candidates?.[0]?.content?.parts?.[0]?.text` read
// in App.jsx keeps working unmodified.

const AI_GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';

// Only these 6 models may be requested through this proxy - guards against
// an unexpected/typo'd model id (or a tampered client request) silently
// billing a different model than the ones this app was built for.
const ALLOWED_MODELS = new Set([
  'openai/gpt-6-luna',
  'deepseek/deepseek-v4.1-flash',
  'zai/glm-5.3-flash',
  'inclusionai/ling-3.0-flash-vl',
  'alibaba/qwen3.8-27b',
  'alibaba/qwen3.8-flash',
]);

// Converts our Gemini-style `parts` array into an OpenAI-compatible
// `content` array for a single user message.
function partsToContent(parts) {
  const content = [];
  for (const part of parts || []) {
    if (part && typeof part.text === 'string') {
      content.push({ type: 'text', text: part.text });
    } else if (part && part.inlineData && part.inlineData.data) {
      const mimeType = part.inlineData.mimeType || 'image/jpeg';
      content.push({
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${part.inlineData.data}` },
      });
    }
  }
  return content;
}

export default async function handler(req, res) {

  // TEMPORARY TEST - remove after testing
  if (req.method === 'GET') {
    const gatewayKey = process.env.AI_GATEWAY_API_KEY;

    if (!gatewayKey) {
      return res.status(200).json({
        keyPresent: false,
        message: 'AI_GATEWAY_API_KEY is NOT available to this deployment'
      });
    }

    try {
      const testResponse = await fetch(
        'https://ai-gateway.vercel.sh/v1/models',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${gatewayKey}`,
          },
        }
      );

      const testBody = await testResponse.text();

      return res.status(200).json({
        keyPresent: true,
        gatewayStatus: testResponse.status,
        gatewayResponse: testBody.slice(0, 500),
      });
    } catch (error) {
      return res.status(200).json({
        keyPresent: true,
        error: error.message,
      });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const gatewayKey = process.env.AI_GATEWAY_API_KEY;
  if (!gatewayKey) {
    // Mirrors the frontend's expected error shape (checked via response.status).
    return res.status(500).json({ error: 'AI_GATEWAY_API_KEY is not configured on the server.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { model, parts } = body || {};

  if (!model || !ALLOWED_MODELS.has(model)) {
    return res.status(400).json({ error: `Unknown or missing model: ${model}` });
  }
  if (!Array.isArray(parts) || parts.length === 0) {
    return res.status(400).json({ error: 'Missing "parts".' });
  }

  const content = partsToContent(parts);

  try {
    const gatewayResponse = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${gatewayKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content }],
      }),
    });

    const raw = await gatewayResponse.text();
    let data;
    try { data = JSON.parse(raw); } catch (e) { data = { raw }; }

    if (!gatewayResponse.ok) {
      // Forward Retry-After (429s) so the frontend's fetchWithRetry can honor
      // the Gateway's/upstream provider's real backoff timing.
      const retryAfter = gatewayResponse.headers.get('Retry-After');
      if (retryAfter) res.setHeader('Retry-After', retryAfter);
      const message = (data && data.error && (data.error.message || data.error)) || raw || gatewayResponse.statusText;
      return res.status(gatewayResponse.status).json({ error: message });
    }

    const text = data?.choices?.[0]?.message?.content || '';

    // Reshape into the Gemini-style response the frontend already parses.
    return res.status(200).json({
      candidates: [{ content: { parts: [{ text }] } }],
    });
  } catch (e) {
    console.error('AI Gateway proxy error:', e);
    return res.status(502).json({ error: `Upstream request failed: ${e.message}` });
  }
};
