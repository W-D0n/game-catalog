import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function exportJson<T>(filename: string, data: T): Promise<void> {
  await mkdir(dirname(filename), { recursive: true });
  await writeFile(filename, JSON.stringify(data, null, 2), "utf-8");
}
