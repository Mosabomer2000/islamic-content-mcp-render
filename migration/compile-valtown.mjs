import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = "valtown-snapshot";
const outRoot = "migration/transpiled";
const sourceFiles = [];
function visit(p) {
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    const f = path.join(p, entry.name);
    if (entry.isDirectory()) visit(f);
    else if (/\.tsx?$/.test(f)) sourceFiles.push(f);
  }
}
visit(root);
let count = 0;
for (const f of sourceFiles) {
  const relative = path.relative(root, f);
  const dest = path.join(outRoot, relative.replace(/\.tsx?$/, ".js"));
  const source = fs.readFileSync(f, "utf8");
  const out = ts.transpileModule(source, {
    fileName: f,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      removeComments: false,
    },
    reportDiagnostics: true,
  });
  const errors = (out.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(f + ": " + errors.map(x => ts.flattenDiagnosticMessageText(x.messageText, " ")).join(" / "));
  const js = out.outputText.replace(/(from\s+["'])(\.[^"']+)\.tsx?(["'])/g, "$1$2.js$3");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, js, "utf8");
  count++;
}
console.log("Transpiled", count, "TypeScript/TSX files from Val Town archive");
