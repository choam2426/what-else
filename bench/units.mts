// Turns a repository into scan units: line windows over `git ls-files`, with the default
// excludes and secret redaction (design §10). Shared by scan.mts and jevgrep.mts.

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Default excludes: secrets, lock files, generated or binary content, translations.
const EXCLUDE = [
  /(^|\/)\.env(\.|$)/i,
  /\.(pem|key|p12|pfx|crt|cer|der|jks|keystore)$/i,
  /(^|\/)(id_rsa|id_ed25519|credentials|\.netrc|\.pypirc|\.npmrc)$/i,
  /\.tfstate(\.backup)?$/i,
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|uv\.lock|poetry\.lock|Cargo\.lock)$/i,
  /(^|\/)(dist|build|vendor|node_modules)\//i,
  /\.min\.(js|css)$/i,
  /(^|\/)(locale|locales|i18n|translations)\//i,
  /\.(po|mo)$/i,
  /\.(png|jpe?g|gif|ico|svg|webp|bmp|tiff?|woff2?|ttf|otf|eot|pdf|zip|gz|tgz|bz2|xz|7z|jar|whl|so|dll|dylib|exe|bin|mp[34]|mov|avi|wasm|sqlite3?|db|pyc|shp|shx|dbf|tif|geojson)$/i,
];
const MAX_FILE_BYTES = 300_000;

// Crude redaction before anything leaves the machine. Not a guarantee.
const SECRETS: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "<redacted private key>"],
  [/\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, "<redacted aws key>"],
  [/\b(ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{20,}\b/g, "<redacted github token>"],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, "<redacted api key>"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, "<redacted slack token>"],
];
const redact = (text: string) => SECRETS.reduce((t, [re, sub]) => t.replace(re, sub), text);

export type Unit = { path: string; start: number; end: number; code: string };
export type Excluded = { pattern: number; large: number; binary: number };

export function listFiles(repo: string): string[] {
  return execFileSync("git", ["-C", repo, "-c", "core.quotepath=off", "ls-files", "-z"], { maxBuffer: 1 << 28 })
    .toString()
    .split("\0")
    .filter(Boolean);
}

export function buildUnits(repo: string, files: string[], window = 60, overlap = 10): { units: Unit[]; excluded: Excluded } {
  const units: Unit[] = [];
  const excluded: Excluded = { pattern: 0, large: 0, binary: 0 };
  for (const path of files) {
    if (EXCLUDE.some((re) => re.test(path))) {
      excluded.pattern++;
      continue;
    }
    const full = join(repo, path);
    if (statSync(full).size > MAX_FILE_BYTES) {
      excluded.large++;
      continue;
    }
    const buf = readFileSync(full);
    if (buf.includes(0)) {
      excluded.binary++;
      continue;
    }
    const lines = redact(buf.toString("utf8")).split("\n");
    const step = window - overlap;
    for (let start = 0; start < lines.length; start += step) {
      const chunk = lines.slice(start, start + window);
      if (chunk.join("").trim() === "") continue;
      units.push({ path, start: start + 1, end: start + chunk.length, code: chunk.join("\n") });
      if (start + window >= lines.length) break;
    }
  }
  return { units, excluded };
}
