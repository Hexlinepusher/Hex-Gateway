import { mkdir } from 'node:fs/promises';

export default function createDirectory(path) {
  return mkdir(path, { recursive: true });
}
