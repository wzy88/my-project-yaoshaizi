import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DATA_ROOT = path.resolve(__dirname, "../../data");

export function resolveDataPath(...parts: string[]): string {
  const root = String(process.env.DICE_DATA_DIR || "").trim() || DEFAULT_DATA_ROOT;
  return path.resolve(root, ...parts);
}
