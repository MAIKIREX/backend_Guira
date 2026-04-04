const https = require('https');
const data = JSON.stringify({
  status: "active"
});

const options = {
  hostname: 'api.sandbox.bridge.xyz',
  path: '/v0/webhooks/wep_t6QPU5D4mH6KmGbodqJy7ZT',
  method: 'PUT',
  headers: {
    'Api-Key': 'sk-test-c304f683fbf97dd7c83f5044848da71e',
    'Content-Type': 'application/json',
    'Content-Length': data.length
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
