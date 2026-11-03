export default function serializeRawRequest(snapshot) {
  const lines = [`${snapshot.method} ${snapshot.requestTarget} HTTP/${snapshot.httpVersion}`];
  for (let index = 0; index < snapshot.rawHeaders.length; index += 2) {
    lines.push(`${snapshot.rawHeaders[index]}: ${snapshot.rawHeaders[index + 1]}`);
  }
  return Buffer.concat([Buffer.from(lines.join('\r\n') + '\r\n\r\n', 'latin1'), snapshot.rawBody]);
}
