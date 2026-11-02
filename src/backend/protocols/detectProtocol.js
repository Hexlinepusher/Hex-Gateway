export default function detectProtocol(pathname, headers = {}) {
  if (pathname === '/v1/messages') {
    return 'anthropic';
  }
  if (
    pathname === '/v1/models' &&
    Object.keys(headers).some((name) => name.toLowerCase() === 'anthropic-version')
  ) {
    return 'anthropic';
  }
  return 'openai';
}
