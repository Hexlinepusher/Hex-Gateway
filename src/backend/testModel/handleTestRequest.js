import sendTextResponse from '../http/sendTextResponse.js';
import waitForResponseFinish from '../http/waitForResponseFinish.js';

import saveTestRequest from './saveTestRequest.js';

export default function handleTestRequest(application, context, snapshot) {
  const { lifecycle, log, dataDirectory } = application;
  const responseCompletion = Promise.withResolvers();
  const recordingTask = Promise.resolve().then(async () => {
    try {
      try {
        await sendTextResponse(context, 'OK', lifecycle.shutdownController.signal);
        responseCompletion.resolve();
      } catch (error) {
        responseCompletion.reject(error);
        try {
          await waitForResponseFinish(context.httpResponse);
        } catch {
          context.httpResponse.destroy();
        }
      }
      try {
        const path = await saveTestRequest(dataDirectory, snapshot);
        log('test.saved', { uid: snapshot.uid, path });
      } catch (error) {
        log('test.save_failed', { uid: snapshot.uid, reason: error?.message ?? String(error) });
      }
    } finally {
      lifecycle.pendingTestRecords.delete(recordingTask);
    }
  });
  lifecycle.pendingTestRecords.add(recordingTask);
  return responseCompletion.promise;
}
