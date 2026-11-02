import { writeFile as writeToDisk } from 'node:fs/promises';

export default function writeFile(path, content, { exclusive = false } = {}) {
  return writeToDisk(path, content, { flag: exclusive ? 'wx' : 'w' });
}
