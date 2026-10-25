// Loopback-only static server for Playwright. Test the compiled app without HMR.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../dist/fasoecole-front/browser');
if (!fs.existsSync(path.join(root, 'index.html'))) {
  throw new Error('Build the application first: npm run build:dev');
}
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' };
http.createServer((request, response) => {
  let file;
  try { file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname)); }
  catch { response.writeHead(400).end(); return; }
  if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(root, 'index.html');
  response.setHeader('Content-Type', mime[path.extname(file).toLowerCase()] || 'application/octet-stream');
  response.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(response);
}).listen(4202, '127.0.0.1', () => console.log('UI preview: http://127.0.0.1:4202'));
