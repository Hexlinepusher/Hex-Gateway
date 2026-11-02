import { readFile as readFromDisk } from 'node:fs/promises';

export default function readFile(path) {
  return readFromDisk(path);
}
