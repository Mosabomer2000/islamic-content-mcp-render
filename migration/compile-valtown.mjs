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
const failures = [];
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
  if (errors.length) {
    const details = errors.map(d => {
      const location = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : null;
      return {line: location ? location.line + 1 : null, column: location ? location.character + 1 : null, message: ts.flattenDiagnosticMessageText(d.messageText, " ")};
    });
    failures.push({file:f,diagnostics:details});
    console.error("Skipping invalid archived source:", f, JSON.stringify(details.slice(0,30)));
    continue;
  }
  const js = out.outputText.replace(/(from\s+["'])(\.[^"']+)\.tsx?(["'])/g, "$1$2.js$3");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, js, "utf8");
  count++;
}
console.log("Transpiled", count, "TypeScript/TSX files from Val Town archive");

fs.mkdirSync(outRoot, {recursive:true});
fs.writeFileSync(path.join(outRoot,"compile-errors.json"), JSON.stringify(failures,null,2)+"\\n");
console.log("Invalid source files skipped:", failures.length);
