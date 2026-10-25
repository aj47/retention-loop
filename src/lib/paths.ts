import { mkdirSync } from "node:fs";
import path from "node:path";

export function dataDir(): string {
  const dir = process.env.RL_DATA_DIR ?? path.join(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function mediaDir(...parts: string[]): string {
  const dir = path.join(dataDir(), "media", ...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
}
