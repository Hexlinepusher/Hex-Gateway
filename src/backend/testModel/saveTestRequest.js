import { join } from 'node:path';

import createDirectory from '../storage/createDirectory.js';
import writeFile from '../storage/writeFile.js';

import formatHistoryTimestamp from './formatHistoryTimestamp.js';
import serializeRawRequest from './serializeRawRequest.js';

export default async function saveTestRequest(dataDirectory, snapshot) {
  const directory = join(dataDirectory, 'test_history');
  const timestamp = formatHistoryTimestamp(new Date(snapshot.receivedAt));
  const content = serializeRawRequest(snapshot);
  await createDirectory(directory);
  for (let index = 0; ; index += 1) {
    const suffix = index === 0 ? '' : `-${String(index).padStart(3, '0')}`;
    const filename = join(directory, `${timestamp}${suffix}.txt`);
    try {
      await writeFile(filename, content, { exclusive: true });
      return filename;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}
