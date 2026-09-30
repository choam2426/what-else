// Checks that a file still parses after the seed was applied. Only syntax is checked: the
// snapshot is a half-done change, so type errors and missing names are expected.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TSC = fileURLToPath(new URL("../node_modules/typescript/lib/tsc.js", import.meta.url));

export function checkSyntax(file: string): "ok" | "unchecked" | { broken: string } {
  if (/\.py$/.test(file)) {
    try {
      execFileSync("python", ["-c", "import ast,sys;ast.parse(open(sys.argv[1],encoding='utf8').read())", file], { stdio: "pipe" });
      return "ok";
    } catch (error) {
      return { broken: String((error as { stderr?: Buffer }).stderr ?? error).trim().split("\n").pop() ?? "" };
    }
  }
  if (/\.[cm]?[jt]sx?$/.test(file)) {
    const args = ["--ignoreConfig", "--noEmit", "--noResolve", "--noLib", "--jsx", "preserve", "--allowJs", "--target", "esnext", "--module", "preserve", "--types", "", file];
    let out = "";
    try {
      out = execFileSync(process.execPath, [TSC, ...args], { encoding: "utf8", stdio: "pipe" });
    } catch (error) {
      out = String((error as { stdout?: string }).stdout ?? "");
    }
    // TS1xxx are syntax errors; everything else is about types or names.
    const syntax = out.split("\n").find((l) => /error TS1\d{3}:/.test(l));
    return syntax ? { broken: syntax.trim() } : "ok";
  }
  return "unchecked";
}
