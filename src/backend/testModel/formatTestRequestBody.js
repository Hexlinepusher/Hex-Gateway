export default function formatTestRequestBody(rawBody) {
  try {
    const body = JSON.parse(rawBody.toString('utf8'));
    return Buffer.from(JSON.stringify(body, null, 2), 'utf8');
  } catch {
    return rawBody;
  }
}
