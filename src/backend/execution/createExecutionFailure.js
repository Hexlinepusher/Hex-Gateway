import createGatewayError from '../errors/createGatewayError.js';

export default function createExecutionFailure(error) {
  return {
    outcome: 'failed',
    retryRequested: false,
    reason: error instanceof Error ? error.message : String(error),
    response: {
      error: createGatewayError('Internal Execution Error', {
        statusCode: 500,
        code: 'internal_execution_error',
      }),
    },
  };
}
