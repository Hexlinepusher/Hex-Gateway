export default function serializeRawRequest(request, body) {
  const lines = [`${request.method} ${request.url} HTTP/${request.httpVersion}`];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    lines.push(`${request.rawHeaders[index]}: ${request.rawHeaders[index + 1]}`);
  }
  return Buffer.concat([Buffer.from(lines.join('\r\n') + '\r\n\r\n'), body]);
}
