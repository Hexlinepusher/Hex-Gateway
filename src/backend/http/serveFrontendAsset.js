import { extname, join } from 'node:path';

import createGatewayError from '../errors/createGatewayError.js';
import readFile from '../storage/readFile.js';

export default async function serveFrontendAsset(application, context) {
  const filename =
    context.pathname === '/' ? 'index.html' : context.pathname.slice('/assets/'.length);
  if (context.pathname !== '/' && !/^[a-z][a-z0-9]*\.(?:js|css)$/i.test(filename)) {
    throw createGatewayError('Resource Not Found', {
      statusCode: 404,
      code: 'not_found',
      type: 'not_found_error',
    });
  }
  let content;
  try {
    content = await readFile(join(application.frontendDirectory, filename));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw createGatewayError('Resource Not Found', {
        statusCode: 404,
        code: 'not_found',
        type: 'not_found_error',
      });
    }
    throw error;
  }
  context.downstreamAbortController.signal.throwIfAborted();
  application.lifecycle.shutdownController.signal.throwIfAborted();
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
  };
  context.httpResponse.writeHead(200, {
    'Content-Type': contentTypes[extname(filename).toLowerCase()],
    'Cache-Control': 'no-store',
  });
  context.httpResponse.end(content);
}
