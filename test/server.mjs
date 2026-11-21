// Serves test/fixtures on two origins: localhost:8711 (the "site") and 127.0.0.1:8712 (the "ad network").
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const types = { '.html': 'text/html', '.js': 'text/javascript' };

export function startServers() {
  const handler = (req, res) => {
    // Open redirector (like a site's own /out?to= endpoint): 302 to ?to=.
    // Checks that PopShield follows where a tab really lands, not just its first URL.
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__redir') {
      res.writeHead(302, { location: u.searchParams.get('to') || '/other.html', 'cache-control': 'no-store' });
      return res.end();
    }
    const p = path.join(root, path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(p).pipe(res);
  };
  const a = http.createServer(handler).listen(8711, 'localhost');
  const b = http.createServer(handler).listen(8712, '127.0.0.1');
  return () => { a.close(); b.close(); };
}
