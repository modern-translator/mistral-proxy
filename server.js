// Mistral API CORS Proxy - with full logging
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json({ limit: '15mb' }));

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

app.post('/api/translate', async (req, res) => {
  console.log('[translate] Incoming request received');

  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      console.log('[translate] Rejected: no Authorization header sent by client');
      return res.status(401).json({ error: 'Missing Authorization header (Bearer <your Mistral key>).' });
    }

    console.log('[translate] Forwarding to Mistral, key prefix:', authHeader.slice(0, 14) + '...');

    const mistralResponse = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(req.body)
    });

    const data = await mistralResponse.json().catch(() => ({}));

    console.log('[translate] Mistral responded with status:', mistralResponse.status);
    console.log('[translate] Mistral response body:', JSON.stringify(data).slice(0, 500));

    return res.status(mistralResponse.status).json(data);
  } catch (err) {
    console.error('[translate] Proxy threw an exception:', err.message);
    return res.status(502).json({ error: 'Proxy failed to reach Mistral API.', detail: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('Mistral proxy is running. POST to /api/translate.');
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Mistral proxy is listening on port ' + listener.address().port);
});
