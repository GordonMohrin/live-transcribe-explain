// Baut die Extension nach dist/: Skripte bündeln (wegen @anthropic-ai/sdk), statische Dateien kopieren.
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
for (const f of ["manifest.json", "popup.html", "options.html", "offscreen.html"]) cpSync(`src/${f}`, `dist/${f}`);
cpSync("icons", "dist/icons", { recursive: true });
cpSync("src/_locales", "dist/_locales", { recursive: true });

const ctx = await esbuild.context({
  entryPoints: ["src/background.js", "src/popup.js", "src/options.js", "src/offscreen.js", "src/overlay.js", "src/captions.js"],
  bundle: true,
  format: "esm",
  target: "chrome120",
  platform: "browser",
  minify: !watch,
  outdir: "dist",
  logLevel: "info",
});
if (watch) await ctx.watch(); else { await ctx.rebuild(); await ctx.dispose(); }
