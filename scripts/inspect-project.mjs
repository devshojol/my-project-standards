#!/usr/bin/env node
/**
 * inspect-project.mjs - read-only project summary for the my-project-standards skill.
 *
 * Reports package manager, framework, language, lint/format/type/test configs, scripts (flagging
 * watch-mode ones), suggested verification commands, a directory map with naming signals, env variable
 * NAMES (never values), guidance docs, and git state. Zero dependencies, Node >= 18.
 *
 * Usage: node inspect-project.mjs [projectRoot] [--json]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const AS_JSON = argv.includes("--json");
const ROOT = path.resolve(argv.find((a) => !a.startsWith("--")) ?? ".");
const SKIP = new Set([
  "node_modules", ".git", "ios", "android", ".expo", "dist", "build", "coverage", ".next", "web-build", "out",
  "Pods", "vendor", ".turbo", ".cache", "e2e-reports", ".vercel",
]);
const CODE = /\.(m?[jt]sx?|cjs)$/;

const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const firstExisting = (list) => list.filter(exists);
const readText = (rel) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return "";
  }
};
const readJson = (rel) => {
  try {
    return JSON.parse(readText(rel));
  } catch {
    return null;
  }
};

function walk(dir, out = [], depth = 0) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === ".DS_Store") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP.has(e.name) && !(depth === 0 && e.name.startsWith(".") && e.name !== ".maestro")) walk(full, out, depth + 1);
    } else out.push(full);
  }
  return out;
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

if (!fs.existsSync(ROOT)) {
  console.error(`inspect-project: ${ROOT} does not exist`);
  process.exit(2);
}

// ---------- package.json ----------
const pkg = readJson("package.json") ?? {};
const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
const has = (name) => Object.prototype.hasOwnProperty.call(deps, name);

const lockfiles = firstExisting(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock"]);
const pmFromLock = { "package-lock.json": "npm", "yarn.lock": "yarn", "pnpm-lock.yaml": "pnpm", "bun.lockb": "bun", "bun.lock": "bun" };
const packageManager = pkg.packageManager?.split("@")[0] ?? pmFromLock[lockfiles[0]] ?? (Object.keys(pkg).length ? "npm (no lockfile)" : "none");

const frameworks = [
  has("expo") && `Expo ${deps.expo}`,
  has("react-native") && `React Native ${deps["react-native"]}`,
  has("expo-router") && "expo-router",
  has("next") && `Next.js ${deps.next}`,
  has("vite") && `Vite ${deps.vite}`,
  has("react-scripts") && "Create React App",
  has("@remix-run/react") && "Remix",
  has("react") && `React ${deps.react}`,
  has("react-router") && "react-router",
  has("react-router-dom") && "react-router-dom",
  has("vue") && `Vue ${deps.vue}`,
  has("svelte") && "Svelte",
  has("express") && `Express ${deps.express}`,
  has("fastify") && "Fastify",
  has("@nestjs/core") && "NestJS",
  has("electron") && "Electron",
].filter(Boolean);

const UI_DEPS = ["react", "react-native", "expo", "next", "vite", "react-scripts", "vue", "svelte", "@angular/core"];
const SERVER_DEPS = ["express", "fastify", "koa", "@nestjs/core", "@hapi/hapi", "hono"];
const hasUi = UI_DEPS.some(has);
const hasServer = SERVER_DEPS.some(has);
const profile = hasServer && !hasUi
  ? "backend (Node server) → references/backend/"
  : hasUi && hasServer
    ? "frontend → references/*.md, plus references/backend/ rules for the server code in this repo"
    : hasUi
      ? "frontend → references/*.md (top level)"
      : "unclear (no UI or server framework in package.json) - ask, or apply only the portable rules";

const libraries = [
  ["@reduxjs/toolkit", "Redux Toolkit (+ RTK Query)"],
  ["zustand", "Zustand"],
  ["@tanstack/react-query", "TanStack Query"],
  ["axios", "axios"],
  ["nativewind", "NativeWind"],
  ["tailwindcss", "Tailwind CSS"],
  ["styled-components", "styled-components"],
  ["i18next", "i18next"],
  ["jest", "Jest"],
  ["jest-expo", "jest-expo"],
  ["vitest", "Vitest"],
  ["@testing-library/react-native", "RNTL"],
  ["@testing-library/react", "React Testing Library"],
  ["@playwright/test", "Playwright"],
  ["cypress", "Cypress"],
  ["typescript", "TypeScript (package)"],
  ["mongoose", "Mongoose"],
  ["prisma", "Prisma"],
  ["zod", "Zod"],
  ["pino", "pino"],
  ["bullmq", "BullMQ"],
  ["ioredis", "ioredis"],
  ["supertest", "Supertest"],
  ["mongodb-memory-server", "mongodb-memory-server"],
  ["@sentry/node", "Sentry Node"],
  ["@sentry/react-native", "Sentry RN"],
  ["@sentry/nextjs", "Sentry Next"],
].filter(([name]) => has(name)).map(([name, label]) => `${label} ${deps[name]}`);

const monorepo = [
  pkg.workspaces && "package.json workspaces",
  exists("pnpm-workspace.yaml") && "pnpm-workspace.yaml",
  exists("turbo.json") && "turbo.json",
  exists("nx.json") && "nx.json",
  exists("lerna.json") && "lerna.json",
].filter(Boolean);

// ---------- configs ----------
const eslintFiles = firstExisting([
  "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts", "eslint.config.mts",
  ".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yml", ".eslintrc.yaml",
]);
if (pkg.eslintConfig) eslintFiles.push("package.json#eslintConfig");
const eslintText = eslintFiles.filter((f) => !f.includes("#")).map(readText).join("\n");
const eslintSignals = [
  "eslint-config-expo", "eslint-config-next", "typescript-eslint", "eslint-plugin-react", "eslint-plugin-react-hooks",
  "eslint-plugin-import", "eslint-plugin-prettier", "eslint-config-prettier", "eslint-plugin-jsdoc", "eslint-plugin-i18next",
  "eslint-plugin-jest", "simple-import-sort", "perfectionist", "import/order", "max-lines", "no-console",
  "i18next/no-literal-string", "exhaustive-deps",
].filter((s) => eslintText.includes(s));

const prettierFiles = firstExisting([
  ".prettierrc", ".prettierrc.json", ".prettierrc.yml", ".prettierrc.yaml", ".prettierrc.json5", ".prettierrc.js",
  ".prettierrc.cjs", ".prettierrc.mjs", ".prettierrc.toml", "prettier.config.js", "prettier.config.cjs", "prettier.config.mjs",
]);
if (pkg.prettier) prettierFiles.push("package.json#prettier");

const otherConfigs = firstExisting([
  "tsconfig.json", "jsconfig.json", "babel.config.js", "metro.config.js", "tailwind.config.js", "tailwind.config.ts",
  "postcss.config.js", "postcss.config.mjs", "app.json", "app.config.js", "app.config.ts", "eas.json", "jest.config.js",
  "jest.setup.js", "vitest.config.ts", "vitest.config.js", "vite.config.ts", "vite.config.js", "next.config.js",
  "next.config.mjs", "next.config.ts", "playwright.config.ts", "biome.json", ".editorconfig", ".nvmrc", ".maestro",
  "patches", ".github/workflows", ".husky", "commitlint.config.js", ".env.example", ".spectral.yaml",
  ".gitleaksignore", "nodemon.json", "src/config.js", "src/app.js", "src/worker.js", "Dockerfile",
]);
if (pkg.jest) otherConfigs.push("package.json#jest");

function aliasesFrom(rel) {
  const text = readText(rel);
  if (!text) return [];
  const block = /"paths"\s*:\s*\{([\s\S]*?)\}/.exec(text);
  return block ? [...block[1].matchAll(/"([^"]+)"\s*:/g)].map((m) => m[1]) : [];
}
const aliases = [...aliasesFrom("tsconfig.json"), ...aliasesFrom("jsconfig.json")];

// ---------- scripts ----------
const scripts = pkg.scripts ?? {};
const interactive = (cmd) =>
  /--watch(All)?\b|\bexpo start\b|\bnext dev\b|^vite$|\bvite( --|$)|\bnodemon\b|\bstorybook dev\b|^node\s+\S*(index|server|main|worker|app)\.m?js$/.test(
    cmd
  );
const run = (name) => (packageManager.startsWith("npm") ? `npm run ${name}` : `${packageManager} run ${name}`);
const verify = [];
if (scripts.lint && !interactive(scripts.lint)) verify.push(`lint: ${run("lint")}`);
else if (eslintFiles.length) verify.push(has("expo") ? "lint: npx expo lint" : "lint: npx eslint <changed files>");
if (prettierFiles.length || has("prettier")) verify.push("format: npx prettier --check <changed files>");
if (exists("tsconfig.json")) verify.push(scripts.typecheck ? `types: ${run("typecheck")}` : "types: npx tsc --noEmit");
if (/--experimental-vm-modules/.test(scripts.test ?? "")) {
  verify.push("tests: node --experimental-vm-modules node_modules/.bin/jest --ci <related test paths>");
} else if (has("jest") || has("jest-expo") || pkg.jest) verify.push("tests: npx jest --ci <related test paths>");
else if (has("vitest")) verify.push("tests: npx vitest run <related test paths>");
if (scripts.build && !has("expo")) verify.push(`build: ${run("build")}`);

// ---------- files and structure ----------
const allFiles = walk(ROOT).map((f) => path.relative(ROOT, f).split(path.sep).join("/"));
const codeFiles = allFiles.filter((f) => CODE.test(f));
const extCount = (list) =>
  Object.entries(list.reduce((acc, f) => ((acc[path.extname(f) || "(none)"] = (acc[path.extname(f) || "(none)"] ?? 0) + 1), acc), {}))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([e, n]) => `${e}:${n}`)
    .join(" ");

const topLevel = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !SKIP.has(e.name) && (!e.name.startsWith(".") || e.name === ".maestro"))
  .map((e) => {
    const inDir = allFiles.filter((f) => f.startsWith(`${e.name}/`));
    const subdirs = [...new Set(inDir.filter((f) => f.split("/").length > 2).map((f) => f.split("/")[1]))];
    return { dir: e.name, files: inDir.length, exts: extCount(inDir), subdirs: subdirs.slice(0, 12) };
  });
const skippedPresent = [...SKIP].filter((d) => exists(d));

const srcRoot = exists("src") ? "src/" : "";
const ratio = (list, re) => (list.length ? `${list.filter((f) => re.test(path.basename(f).replace(/\.[^.]+$/, ""))).length}/${list.length}` : "n/a");
const roleSuffixFiles = codeFiles.filter((f) => /\/(routes|controllers|services|models|middlewares|schemas|jobs)\//.test(f));
const roleSuffixed = roleSuffixFiles.filter((f) => /^[a-z][A-Za-z0-9]*\.[a-z]+\.m?[jt]s$/.test(path.basename(f)));
const compFiles = codeFiles.filter((f) => f.startsWith(`${srcRoot}components/`) && /\.[jt]sx$/.test(f));
const hookFiles = codeFiles.filter((f) => f.startsWith(`${srcRoot}hooks/`));
const routeFiles = codeFiles.filter((f) => f.startsWith(`${srcRoot}app/`));
const testFiles = codeFiles.filter((f) => /__tests__\/|\.(test|spec)\./.test(f));

let relImports = 0;
let aliasImports = 0;
let extImports = 0;
for (const f of codeFiles.filter((x) => !/node_modules/.test(x)).slice(0, 600)) {
  const text = readText(f);
  for (const m of text.matchAll(/^import\s[\s\S]*?["']([^"']+)["']/gm)) {
    if (m[1].startsWith(".")) {
      relImports++;
      if (/\.(jsx?|tsx?)$/.test(m[1])) extImports++;
    } else if (/^(@\/|~\/|#|src\/)/.test(m[1])) aliasImports++;
  }
}

// ---------- env (names only) ----------
const envFiles = allFiles.filter((f) => /(^|\/)\.env(\.[\w.-]+)?$/.test(f)).concat(firstExisting([".env", ".env.local", ".env.example", ".env.development", ".env.production"]));
const envReport = [...new Set(envFiles)].map((f) => {
  const names = readText(f)
    .split("\n")
    .map((l) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l)?.[1])
    .filter(Boolean);
  return { file: f, names };
});
const gitignore = readText(".gitignore");
const envIgnored = git(["check-ignore", "-q", ".env"]) !== null || /^\.env\b/m.test(gitignore);

// ---------- docs and git ----------
const docs = firstExisting(["CLAUDE.md", ".claude/CLAUDE.md", "AGENTS.md", "CONTRIBUTING.md", "README.md", ".cursorrules", ".github/copilot-instructions.md", "docs"]);
const inGit = git(["rev-parse", "--is-inside-work-tree"]) === "true";
const gitInfo = inGit
  ? {
      branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
      uncommitted: (git(["status", "--porcelain"]) ?? "").split("\n").filter(Boolean).length,
      recentSubjects: (git(["log", "-5", "--pretty=%s"]) ?? "").split("\n").filter(Boolean),
    }
  : null;

const report = {
  root: ROOT,
  name: pkg.name ?? null,
  packageManager,
  lockfiles,
  moduleType: pkg.type ?? "commonjs",
  frameworks,
  profile,
  libraries,
  monorepo,
  language: {
    tsconfig: exists("tsconfig.json"),
    files: extCount(codeFiles),
    aliases,
  },
  eslint: { files: eslintFiles, signals: eslintSignals },
  prettier: prettierFiles,
  otherConfigs,
  scripts: Object.entries(scripts).map(([k, v]) => ({ name: k, command: v, interactive: interactive(v) })),
  verify,
  structure: { srcRoot: srcRoot || "(root-level)", topLevel, generatedOrSkipped: skippedPresent },
  namingSignals: {
    pascalCaseComponentFiles: ratio(compFiles, /^[A-Z][A-Za-z0-9]*$/),
    hookFilesNamedUse: ratio(hookFiles, /^use[A-Z]/),
    hookExtensions: extCount(hookFiles) || "n/a",
    kebabCaseRouteFiles: ratio(routeFiles, /^([a-z0-9]+(-[a-z0-9]+)*|_layout|\+[a-z-]+|\[.+\]|\(.+\))$/),
    testFiles: testFiles.length,
    serverLayerFilesWithRoleSuffix: roleSuffixFiles.length ? `${roleSuffixed.length}/${roleSuffixFiles.length}` : "n/a",
    imports: { relative: relImports, alias: aliasImports, relativeWithExtension: extImports },
  },
  env: { files: envReport, envGitIgnored: envIgnored, hasExample: envReport.some((e) => /example|sample|template/.test(e.file)) },
  docs,
  git: gitInfo,
};

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const out = [];
const list = (items) => (items.length ? items.join(", ") : "none");
out.push(`# Project inspection: ${report.name ?? path.basename(ROOT)}`, "");
out.push(`- Root: ${ROOT}`);
out.push(`- Package manager: ${packageManager} (lockfiles: ${list(lockfiles)}); module type: ${report.moduleType}`);
out.push(`- Frameworks: ${list(frameworks)}`);
out.push(`- Suggested profile: ${profile}`);
out.push(`- Libraries: ${list(libraries)}`);
if (monorepo.length) out.push(`- Monorepo signals: ${list(monorepo)} - inspect the package you are changing, not just the root`);
out.push(`- Language: ${report.language.tsconfig ? "TypeScript (tsconfig.json)" : "JavaScript (no tsconfig.json)"}; code files ${report.language.files || "none"}`);
out.push(`- Path aliases: ${list(aliases)}`);
out.push("", "## Lint, format, and other configs", "");
out.push(`- ESLint: ${list(eslintFiles)}${eslintSignals.length ? ` - mentions: ${eslintSignals.join(", ")}` : ""}`);
out.push(`- Prettier: ${list(prettierFiles)}`);
out.push(`- Other: ${list(otherConfigs)}`);
out.push("", "## Scripts", "");
for (const s of report.scripts) out.push(`- \`${s.name}\`: \`${s.command}\`${s.interactive ? "  <- interactive/watch, don't run during verification" : ""}`);
if (!report.scripts.length) out.push("- none");
out.push("", "## Suggested verification commands", "");
for (const v of verify) out.push(`- ${v}`);
if (!verify.length) out.push("- none detected - ask the user how changes are checked");
out.push("", `## Structure (source root: ${report.structure.srcRoot})`, "");
for (const t of topLevel) out.push(`- \`${t.dir}/\` - ${t.files} files (${t.exts || "-"})${t.subdirs.length ? `; subdirs: ${t.subdirs.join(", ")}` : ""}`);
if (skippedPresent.length) out.push(`- not scanned: ${skippedPresent.join(", ")}`);
out.push("", "## Naming signals", "");
const n = report.namingSignals;
out.push(`- PascalCase component files: ${n.pascalCaseComponentFiles}`);
out.push(`- Hook files named use*: ${n.hookFilesNamedUse} (extensions: ${n.hookExtensions})`);
out.push(`- Route files kebab-case/special: ${n.kebabCaseRouteFiles}`);
out.push(`- Server layer files named <name>.<role>.js: ${n.serverLayerFilesWithRoleSuffix}`);
out.push(`- Test files: ${n.testFiles}`);
out.push(`- Imports sampled: ${n.imports.relative} relative (${n.imports.relativeWithExtension} with extension), ${n.imports.alias} alias`);
out.push("", "## Environment (names only)", "");
for (const e of envReport) out.push(`- ${e.file}: ${list(e.names)}`);
if (!envReport.length) out.push("- no .env files");
out.push(`- .env git-ignored: ${envIgnored ? "yes" : "NO - check before adding secrets"}; example file: ${report.env.hasExample ? "yes" : "no"}`);
out.push("", "## Guidance docs and git", "");
out.push(`- Docs: ${list(docs)}`);
out.push(
  gitInfo
    ? `- Git: branch ${gitInfo.branch}, ${gitInfo.uncommitted} uncommitted change(s); recent subjects: ${gitInfo.recentSubjects.map((s) => `"${s}"`).join(", ") || "none"}`
    : "- Git: not a repository"
);
console.log(out.join("\n"));
