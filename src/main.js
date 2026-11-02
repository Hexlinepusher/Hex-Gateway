import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const page = await readFile(new URL('./frontend/index.html', import.meta.url));

createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(page);
}).listen(Number(process.env.PORT || 3000), '0.0.0.0');
