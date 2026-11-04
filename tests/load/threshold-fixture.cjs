// Deliberately broken API for checking k6 exit codes, never for acceptance measurements.
const http = require('node:http');
const beaches = Array.from({ length: 35 }, (_, index) => ({ id: index + 1 }));
let requests = 0;
http.createServer((request, response) => {
  requests++;
  const fail = process.env.FAULT_MODE === 'http' && requests > 4;
  const body = request.url === '/beaches' ? beaches : { availability: 'available', status: 'high' };
  setTimeout(() => {
    response.writeHead(fail ? 503 : 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  }, process.env.FAULT_MODE === 'http' ? 0 : 1100);
}).listen(3042, '127.0.0.1', () => console.log('Broken threshold fixture on http://localhost:3042; stop with Ctrl+C'));
