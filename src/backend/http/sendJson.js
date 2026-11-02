export default function sendJson(response, statusCode, body) {
  if (response.destroyed || response.writableEnded) return;
  const content = JSON.stringify(body);
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(content);
}
