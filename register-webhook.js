const https = require('https');

const data = JSON.stringify({
  url: "https://backend-guira.onrender.com/api/webhooks/bridge",
  event_epoch: "webhook_creation",
  event_categories: ["customer","kyc_link","external_account","virtual_account.activity","transfer"]
});

const options = {
  hostname: 'api.sandbox.bridge.xyz',
  path: '/v0/webhooks',
  method: 'POST',
  headers: {
    'Api-Key': 'sk-test-c304f683fbf97dd7c83f5044848da71e',
    'Content-Type': 'application/json',
    'Idempotency-Key': `render-deploy-${Date.now()}`
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => console.log(body));
});

req.on('error', (e) => console.error(e));
req.write(data);
req.end();
