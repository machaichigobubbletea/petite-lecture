// Tiny local server so browser speech APIs work on localhost.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = __dirname;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
function createServer() { return http.createServer((req, res) => {
  const requested = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
  if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) {
    res.writeHead(403); return res.end('Forbidden');
  }
  if (path.extname(file) === '.mp3') {
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) { res.writeHead(404); return res.end('Not found'); }
      const headers = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes' };
      const range = req.headers.range;
      let start = 0;
      let end = stat.size - 1;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2])) {
          res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` }); return res.end();
        }
        if (match[1]) {
          start = Number(match[1]);
          if (match[2]) end = Number(match[2]);
        } else {
          start = Math.max(0, stat.size - Number(match[2]));
        }
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
          res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` }); return res.end();
        }
        end = Math.min(end, stat.size - 1);
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length'] = String(end - start + 1);
      res.writeHead(range ? 206 : 200, headers);
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file, { start, end }).pipe(res);
    });
    return;
  }
  fs.readFile(file, (error, content) => {
    if (error) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(content);
  });
}); }
if (require.main === module) createServer().listen(4173, '0.0.0.0', () => {
  console.log('Petite Lecture is ready:');
  console.log('  This PC: http://127.0.0.1:4173');
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) console.log(`  Phone (same Wi-Fi): http://${entry.address}:4173`);
    }
  }
});
module.exports = { createServer };
