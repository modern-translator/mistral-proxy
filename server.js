// Mistral API CORS Proxy - Glitch version
// Paste this into server.js on Glitch.

const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json({ limit: '15mb' })); // page images as base64 can be large

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

app.post('/api/translate', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing Authorization header (Bearer <your Mistral key>).' });
    }

    const mistralResponse = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(req.body)
    });

    const data = await mistralResponse.json().catch(() => ({}));
    return res.status(mistralResponse.status).json(data);
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(502).json({ error: 'Proxy failed to reach Mistral API.', detail: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('Mistral proxy is running. POST to /api/translate.');
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Mistral proxy is listening on port ' + listener.address().port);
});
