const esbuild = require("esbuild");
const path = require("path");

esbuild.build({
  entryPoints: [path.join(__dirname, "..", "src", "codemirror-entry.js")],
  bundle: true,
  minify: true,
  outfile: path.join(__dirname, "..", "assets", "js", "vendor", "codemirror", "codemirror.min.js"),
  format: "iife",
  globalName: "CodeMirrorBundle",
  target: "es2015",
}).catch(() => process.exit(1));
