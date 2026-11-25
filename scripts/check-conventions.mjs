#!/usr/bin/env node
/**
 * check-conventions.mjs - read-only checks for the my-project-standards skill.
 *
 * Covers conventions that ESLint/Prettier don't: file and folder naming per role, file extensions, import grouping
 * and order, file size, component style, testID format, empty JSDoc, Redux slice names, layer rules of a Node server
 * (process.env only in config, controllers pass errors to next, services never answer HTTP), and secrets/hosts in
 * source. Two profiles: `frontend` (React / React Native / Next.js) and `backend` (Node server). Zero dependencies,
 * Node >= 18.
 *
 * Usage:
 *   node check-conventions.mjs [paths...]        files or directories (default: the project root)
 *   node check-conventions.mjs --changed         files changed vs HEAD plus untracked files (git)
 * Options:
 *   --profile=<auto|frontend|backend>  default auto: backend when package.json has a server framework and no UI one
 *   --root=<dir>        project root used for role detection (default: current directory)
 *   --base=<ref>        with --changed, compare against <ref> instead of HEAD
 *   --max-lines=<n>     frontend effective-line limit (default 120)
 *   --strict            exit 1 on warnings as well as errors
 *   --json              machine-readable output
 *
 * Exit codes: 0 clean (or warnings only), 1 errors (or warnings with --strict), 2 usage/git problem.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CODE_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set([
  "node_modules", ".git", "ios", "android", ".expo", "dist", "build", "coverage", ".next", "web-build",
  "out", "Pods", "vendor", ".turbo", ".cache", "e2e-reports", ".vercel",
]);
const FRONTEND_ROLES = new Set([
  "app", "components", "hooks", "features", "utils", "constants", "context", "store", "providers", "i18n",
  "data", "plugins", "__tests__",
]);
const BACKEND_ROLES = new Set([
  "routes", "controllers", "services", "models", "middlewares", "schemas", "jobs", "lib", "utils", "constants",
  "config", "db", "docs", "emails", "streams", "tests",
]);
const UI_DEPS = ["react", "react-native", "expo", "next", "vite", "react-scripts", "vue", "svelte", "@angular/core"];
const SERVER_DEPS = ["express", "fastify", "koa", "@nestjs/core", "@hapi/hapi", "hono"];

const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const CAMEL = /^[a-z][A-Za-z0-9]*$/;
const CAMEL_WITH_ROLE = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)?$/;
const LOWERCASE_COMPONENT_FOLDERS = /^(components|common|shared|ui|v\d+)$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HOOK = /^use[A-Z][A-Za-z0-9]*$/;
const BACKEND_SUFFIX = Object.freeze({
  routes: ["route"],
  controllers: ["controller"],
  middlewares: ["middleware"],
  models: ["model"],
  schemas: ["schema"],
  jobs: ["job", "schedule"],
});

// ---------- arguments ----------
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => argv.includes(`--${name}`);
const ROOT = path.resolve(opt("root", "."));
const MAX_LINES = Number(opt("max-lines", "120"));
const STRICT = flag("strict");
const AS_JSON = flag("json");
const CHANGED = flag("changed");
const BASE = opt("base", "HEAD");
const targets = argv.filter((a) => !a.startsWith("--"));

const pkg = readJson(path.join(ROOT, "package.json")) ?? {};
const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
const HAS_FILE_ROUTER = Boolean(deps["expo-router"] || deps.next);
const HAS_BUNDLER = Boolean(deps.expo || deps["react-native"] || deps.next || deps.vite || deps["react-scripts"]);
const NODE_ESM = pkg.type === "module" && !HAS_BUNDLER;
const AUTO_PROFILE = SERVER_DEPS.some((d) => deps[d]) && !UI_DEPS.some((d) => deps[d]) ? "backend" : "frontend";
const PROFILE = ["frontend", "backend"].includes(opt("profile", "auto")) ? opt("profile") : AUTO_PROFILE;
const BACKEND = PROFILE === "backend";
const ROLE_DIRS = BACKEND ? BACKEND_ROLES : FRONTEND_ROLES;

// ---------- helpers ----------
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function walk(dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".maestro") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, out);
    } else if (CODE_EXT.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function collectFiles() {
  if (CHANGED) {
    let names;
    try {
      names = [
        ...git(["diff", "--name-only", "--diff-filter=ACMR", BASE]),
        ...git(["ls-files", "--others", "--exclude-standard"]),
      ];
    } catch {
      console.error("check-conventions: --changed needs a git repository with at least one commit.");
      process.exit(2);
    }
    return [...new Set(names)]
      .map((n) => path.join(ROOT, n))
      .filter((f) => CODE_EXT.has(path.extname(f)) && fs.existsSync(f))
      .filter((f) => !path.relative(ROOT, f).split(path.sep).some((s) => SKIP_DIRS.has(s)));
  }
  const roots = targets.length ? targets.map((t) => path.resolve(t)) : [ROOT];
  const files = [];
  for (const t of roots) {
    if (!fs.existsSync(t)) continue;
    if (fs.statSync(t).isDirectory()) walk(t, files);
    else if (CODE_EXT.has(path.extname(t))) files.push(t);
  }
  return [...new Set(files)];
}

/**
 * Blanks comments (and, for codeOnly, string contents) while keeping length and newlines,
 * so regex hits map back to the original line numbers.
 * @param {string} src
 * @returns {{noComments: string, codeOnly: string}}
 */
function strip(src) {
  let noComments = "";
  let codeOnly = "";
  const braces = [];
  let state = "code";
  const push = (a, b = a) => {
    noComments += a;
    codeOnly += b;
  };
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    const d = src[i + 1];
    if (state === "code") {
      if (c === "/" && d === "/") (state = "line"), push("  "), (i += 2);
      else if (c === "/" && d === "*") (state = "block"), push("  "), (i += 2);
      else if (c === '"' || c === "'") (state = c), push(c), i++;
      else if (c === "`") (state = "tpl"), push(c), i++;
      else {
        if (c === "{" && braces.length) braces[braces.length - 1]++;
        if (c === "}" && braces.length) {
          if (braces[braces.length - 1] === 0) {
            braces.pop();
            state = "tpl";
          } else braces[braces.length - 1]--;
        }
        push(c), i++;
      }
    } else if (state === "line") {
      if (c === "\n") (state = "code"), push(c);
      else push(" ");
      i++;
    } else if (state === "block") {
      if (c === "*" && d === "/") (state = "code"), push("  "), (i += 2);
      else push(c === "\n" ? "\n" : " "), i++;
    } else if (state === '"' || state === "'") {
      if (c === "\\" && d !== undefined) push(c + d, d === "\n" ? " \n" : "  "), (i += 2);
      else if (c === state) (state = "code"), push(c), i++;
      else if (c === "\n") (state = "code"), push(c), i++; // unterminated (e.g. apostrophe in JSX text)
      else push(c, " "), i++;
    } else {
      // template literal
      if (c === "\\" && d !== undefined) push(c + d, d === "\n" ? " \n" : "  "), (i += 2);
      else if (c === "`") (state = "code"), push(c), i++;
      else if (c === "$" && d === "{") braces.push(0), (state = "code"), push("${"), (i += 2);
      else push(c, c === "\n" ? "\n" : " "), i++;
    }
  }
  return { noComments, codeOnly };
}

const lineAt = (text, index) => text.slice(0, index).split("\n").length;
const hasJsx = (code) => /<\/[A-Za-z][\w.]*\s*>|<>|<\/>|<[A-Za-z][\w.]*(\s[^<>]*)?\/>/.test(code);
const importGroup = (spec) => (spec.startsWith(".") ? 2 : /^(@\/|~\/|#|src\/)/.test(spec) ? 1 : 0);

// ---------- role detection ----------
function describe(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const segs = rel.split("/");
  const roleIdx = segs.findIndex((s) => ROLE_DIRS.has(s));
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  const isTest =
    /(^|\/)(__tests__|tests)\//.test(rel) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel) || base === "jest.setup";
  return {
    rel,
    segs,
    ext,
    base,
    isTest,
    isRootFile: segs.length === 1,
    isScript: segs[0] === "scripts",
    role: roleIdx === -1 ? null : segs[roleIdx],
    rolePrefix: roleIdx === -1 ? null : segs.slice(0, roleIdx + 1).join("/"),
    roleFolders: roleIdx === -1 ? [] : segs.slice(roleIdx + 1, -1),
  };
}

const majorityCache = new Map();
function roleMajorityIsJsx(rolePrefix) {
  if (!majorityCache.has(rolePrefix)) {
    const files = walk(path.join(ROOT, rolePrefix));
    const jsx = files.filter((f) => /\.[jt]sx$/.test(f)).length;
    majorityCache.set(rolePrefix, jsx > files.length - jsx);
  }
  return majorityCache.get(rolePrefix);
}

// ---------- checks ----------
const findings = [];
const reportedFolders = new Set();
const sliceNames = new Map();
const add = (file, line, severity, rule, message) => findings.push({ file, line, severity, rule, message });

function checkFolderCharacters(d) {
  for (const [i, folder] of d.segs.slice(0, -1).entries()) {
    const key = d.segs.slice(0, i + 1).join("/");
    if (/[^A-Za-z0-9._()[\]+@-]/.test(folder) && !reportedFolders.has(key)) {
      reportedFolders.add(key);
      add(key, 0, "warn", "folder-characters", "Folder name contains characters other than letters, digits, - _ . ( ) [ ] + @.");
    }
  }
}

function checkFrontendNaming(d) {
  const where = d.rel;
  if (d.role === "components") {
    d.roleFolders.forEach((folder, i) => {
      const key = `${d.rolePrefix}/${d.roleFolders.slice(0, i + 1).join("/")}`;
      if (!PASCAL.test(folder) && !LOWERCASE_COMPONENT_FOLDERS.test(folder) && !reportedFolders.has(key)) {
        reportedFolders.add(key);
        add(key, 0, "warn", "component-folder-naming", "Component folders are PascalCase (only components/, common/, shared/, ui/ and v1/-style folders may be lowercase).");
      }
    });
    if (/sx$/.test(d.ext) && !PASCAL.test(d.base) && !HOOK.test(d.base) && d.base !== "index") {
      add(where, 1, "warn", "component-file-naming", "Component files are PascalCase and named after their default export.");
    }
  } else if (d.role === "hooks" && !d.isTest) {
    if (!HOOK.test(d.base) && d.base !== "index") add(where, 1, "warn", "hook-file-naming", "Hook files are named use<Name> after the hook they export.");
  } else if (["features", "utils", "constants", "store", "i18n", "data"].includes(d.role)) {
    if (!CAMEL.test(d.base)) add(where, 1, "warn", "module-file-naming", `Files in ${d.role}/ are camelCase.`);
    if (d.role === "features" && d.roleFolders[0] && !CAMEL.test(d.roleFolders[0])) {
      add(where, 1, "warn", "feature-folder-naming", "Feature (domain) folders are camelCase.");
    }
  } else if (d.role === "context" || d.role === "providers") {
    if (!PASCAL.test(d.base) && d.base !== "index") add(where, 1, "warn", "module-file-naming", `Files in ${d.role}/ are PascalCase (<Name>Provider, <Name>Content, <Name>Service).`);
  } else if (d.role === "plugins") {
    if (!/^with[A-Z][A-Za-z0-9]*$/.test(d.base)) add(where, 1, "warn", "plugin-file-naming", "Expo config plugins are named with<Name>.");
  } else if (d.role === "__tests__") {
    if (!/\.(test|spec)$/.test(d.base)) add(where, 1, "warn", "test-file-naming", "Files under __tests__/ are run as tests; name them <Source>.test.js (move helpers to test-utils/).");
  } else if (d.role === "app" && HAS_FILE_ROUTER) {
    const routeSegs = [...d.roleFolders, d.base];
    if (routeSegs.some((s) => s.startsWith("_") && s !== "_layout") || routeSegs.includes("components")) return;
    const ok = (s) =>
      KEBAB.test(s) || s === "_layout" || /^\([a-z0-9-]+\)$/.test(s) || /^\[{1,2}(\.\.\.)?[A-Za-z0-9_]+\]{1,2}$/.test(s) || /^\+[a-z-]+$/.test(s) || /^@[a-z0-9-]+$/.test(s);
    const bad = routeSegs.find((s) => !ok(s));
    if (bad) add(where, 1, "warn", "route-naming", `Route segment "${bad}" should be kebab-case, (group), [param], _layout, index or +special.`);
  }
}

function checkBackendNaming(d) {
  const where = d.rel;
  if (d.role === "tests") {
    const support = d.roleFolders.some((f) => ["helpers", "factories", "fixtures", "mocks", "__mocks__"].includes(f));
    if (!support && d.base !== "setup" && !/\.(test|spec)$/.test(d.base)) {
      add(where, 1, "warn", "test-file-naming", "Files under tests/ (outside helpers/, factories/, fixtures/) are tests: name them <subject>.test.js.");
    }
    return;
  }
  d.roleFolders.forEach((folder, i) => {
    const key = `${d.rolePrefix}/${d.roleFolders.slice(0, i + 1).join("/")}`;
    if (!/^_?[a-z][A-Za-z0-9]*$/.test(folder) && !reportedFolders.has(key)) {
      reportedFolders.add(key);
      add(key, 0, "warn", "server-folder-naming", "Server folders are lowercase or camelCase (v2/, admin/, dailyGoal/).");
    }
  });
  if (d.base === "index") return;
  const suffixes = BACKEND_SUFFIX[d.role];
  if (suffixes) {
    const match = new RegExp(`^[a-z][A-Za-z0-9]*\\.(${suffixes.join("|")})$`).test(d.base);
    if (!match && !(d.role === "models" && CAMEL.test(d.base))) {
      add(where, 1, "warn", "layer-file-naming", `Files in ${d.role}/ are named <camelName>.${suffixes.join(" | .")}.js.`);
    } else if (d.role === "models" && CAMEL.test(d.base)) {
      add(where, 1, "info", "layer-file-naming", "Model files end in .model.js; shared helpers in models/ are fine.");
    }
  } else if (!CAMEL_WITH_ROLE.test(d.base) && d.role !== "docs") {
    add(where, 1, "warn", "module-file-naming", `Files in ${d.role}/ are camelCase, with an optional .<role> suffix (dailyGoal.rules.js).`);
  }
}

function checkNaming(d) {
  if (d.isRootFile || d.isScript || !d.role) return;
  checkFolderCharacters(d);
  if (BACKEND) checkBackendNaming(d);
  else checkFrontendNaming(d);
}

function checkSecrets(d, src) {
  const file = d.rel;
  const secretPatterns = [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
    [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key id"],
    [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, "GitHub token"],
    [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, "Slack token"],
    [/\bsk_(live|test)_[A-Za-z0-9]{16,}\b/, "Stripe secret key"],
  ];
  if (!d.isTest) {
    // Tests legitimately use fake credentials in URIs and fixtures; only high-confidence key formats apply to them.
    secretPatterns.push([/mongodb(\+srv)?:\/\/[^\s"'`/:@]+:[^\s"'`/@]+@/, "database URI with credentials"]);
    secretPatterns.push([/(api[_-]?key|secret|password|private[_-]?key|auth[_-]?token)["']?\s*[:=]\s*["'`][A-Za-z0-9_\-+/=]{20,}["'`]/i, "credential-like literal"]);
  }
  for (const [re, label] of secretPatterns) {
    const m = re.exec(src);
    if (m) add(file, lineAt(src, m.index), "error", "possible-secret", `Looks like a ${label} in source. Move it to an untracked .env / secret store.`);
  }
  if (d.isTest || d.isRootFile || d.isScript) return;
  // A client's own API base URL belongs in env; a server calling a third-party API endpoint is usually fine (info).
  const configPatterns = [
    [/https:\/\/[0-9a-f]{32}@[\w.-]*sentry\.io/, "monitoring DSN", "warn"],
    [/["'`]https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|[\w.-]*ngrok[\w.-]*|[\w.-]+\.local)\b/, "local/dev host", "warn"],
    [/["'`]https?:\/\/[^"'`\s]+\/api\b/, "API base URL", BACKEND ? "info" : "warn"],
    [/\b\d{6,}-[a-z0-9]{20,}\.apps\.googleusercontent\.com\b/, "OAuth client id", "warn"],
  ];
  for (const [re, label, severity] of configPatterns) {
    const m = re.exec(src);
    if (m) add(file, lineAt(src, m.index), severity, "config-in-source", `Hardcoded ${label}. Read it from config/env (EXPO_PUBLIC_*, NEXT_PUBLIC_*, VITE_*, or the server's config.js).`);
  }
}

function checkImports(d, src, codeOnly) {
  const file = d.rel;
  const imports = [];
  const importRe = /^[ \t]*import\b(?!\s*\()/gm;
  let m;
  while ((m = importRe.exec(codeOnly))) {
    const open = codeOnly.slice(m.index).search(/["']/);
    if (open === -1) continue;
    const start = m.index + open;
    const close = src.indexOf(src[start], start + 1);
    if (close === -1) continue;
    const head = src.slice(m.index, start);
    const named = /\{([\s\S]*?)\}/.exec(head);
    imports.push({
      spec: src.slice(start + 1, close),
      line: lineAt(src, m.index),
      named: named ? named[1].split(",").map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]).filter(Boolean) : [],
      isDefaultReact: /^\s*import\s+React\b/.test(head),
    });
  }
  let groupReported = false;
  let alphaReported = false;
  imports.forEach((imp, i) => {
    const prev = imports[i - 1];
    if (prev) {
      const [ga, gb] = [importGroup(prev.spec), importGroup(imp.spec)];
      if (ga > gb && !groupReported) {
        groupReported = true;
        add(file, imp.line, "warn", "import-order", `"${imp.spec}" should come before "${prev.spec}" (packages, then aliases, then relative paths).`);
      } else if (ga === gb && prev.spec.toLowerCase() > imp.spec.toLowerCase() && !alphaReported) {
        alphaReported = true;
        add(file, imp.line, BACKEND ? "info" : "warn", "import-order", `"${imp.spec}" should come before "${prev.spec}" (alphabetical inside a group).`);
      }
    }
    if (!BACKEND) {
      const lower = (s) => s.toLowerCase();
      const sorted = [...imp.named].sort((x, y) => (lower(x) < lower(y) ? -1 : lower(x) > lower(y) ? 1 : 0));
      if (imp.named.join() !== sorted.join()) add(file, imp.line, "warn", "import-specifier-order", `Sort named imports: { ${sorted.join(", ")} }.`);
    }
    if (imp.spec.startsWith(".")) {
      const hasExt = /\.[A-Za-z0-9]+$/.test(imp.spec);
      if (NODE_ESM && !hasExt) {
        add(file, imp.line, "error", "import-extension", `Node ES modules need the file extension: "${imp.spec}.js".`);
      } else if (!NODE_ESM && /\.(jsx?|tsx?|mjs|cjs)$/.test(imp.spec)) {
        add(file, imp.line, "warn", "import-extension", `Drop the extension from "${imp.spec}".`);
      }
    }
    if (imp.isDefaultReact && !/\bReact\./.test(codeOnly)) {
      add(file, imp.line, "warn", "unused-react-import", "The automatic JSX runtime doesn't need `import React`; import only the hooks you use.");
    }
  });
}

function checkFrontendContent(d, src, noComments, codeOnly, jsx) {
  const file = d.rel;
  // Size (mirrors max-lines with skipComments + skipBlankLines)
  const effective = noComments.split("\n").filter((l) => l.trim()).length;
  if (effective > MAX_LINES) {
    const disabled = /eslint-disable[^\n]*max-lines/.test(src) ? " (max-lines is disabled in-file)" : "";
    add(file, 1, "warn", "max-lines", `${effective} effective lines > ${MAX_LINES}${disabled}. Split into child components or hooks.`);
  }
  const edf = /export\s+default\s+function\b/.exec(codeOnly);
  if (edf && jsx) add(file, lineAt(src, edf.index), "warn", "component-style", "Prefer `const Name = () => {}` + `export default Name;` (unless the project's convention differs).");
  const tid = /\b(testID|data-testid)=\{?\s*(["'`])([^"'`]*)\2/g;
  let m;
  while ((m = tid.exec(noComments))) {
    const value = src.slice(m.index, m.index + m[0].length).replace(/^[^"'`]*["'`]/, "").slice(0, -1);
    const staticParts = value.replace(/\$\{[^}]*\}/g, "");
    if (staticParts && !/^[a-z0-9-]*$/.test(staticParts)) {
      add(file, lineAt(src, m.index), "warn", "testid-format", `testID "${value}" should be kebab-case.`);
    }
  }
  if (/Slice$/.test(d.base)) {
    const slice = /createSlice\(\s*\{[\s\S]*?\bname:\s*["'`]([^"'`]*)["'`]/.exec(src);
    if (slice) {
      const expected = d.base.replace(/Slice$/, "");
      const line = lineAt(src, slice.index);
      if (slice[1] !== expected) add(file, line, "warn", "slice-name", `Slice name "${slice[1]}" should match the file/store key "${expected}".`);
      if (sliceNames.has(slice[1])) add(file, line, "error", "duplicate-slice-name", `Slice name "${slice[1]}" is also used in ${sliceNames.get(slice[1])}; action types will collide.`);
      else sliceNames.set(slice[1], file);
    }
  }
}

function checkBackendContent(d, src, codeOnly) {
  const file = d.rel;
  const isConfigModule = /(^|\/)config(\.[cm]?js|\/)/.test(d.rel);
  const env = /\bprocess\.env\b/.exec(codeOnly);
  if (env && !isConfigModule) add(file, lineAt(src, env.index), "warn", "env-outside-config", "Only the config module (src/config.js) reads process.env; import `config` instead.");
  if (d.role === "controllers" && /async\s*\(\s*req\s*,\s*res\b/.test(codeOnly) && !/\bnext\s*\(/.test(codeOnly)) {
    add(file, 1, "warn", "controller-errors", "Controllers wrap the handler in try/catch and pass errors to next(error).");
  }
  if (d.role === "services") {
    // `res.status(` / `res.send(` are Express-only calls; `res.json()` is skipped because fetch responses have it too.
    const http = /\bres\.(status|send|sendStatus|setHeader)\s*\(/.exec(codeOnly);
    if (http) add(file, lineAt(src, http.index), "warn", "service-http", "Services return values or throw AppError; only controllers answer HTTP.");
  }
}

function checkContent(d, src) {
  if (src.length > 1_000_000) return;
  checkSecrets(d, src);
  if (d.isRootFile || d.isScript) return;
  const { noComments, codeOnly } = strip(src);
  const file = d.rel;
  const jsx = !BACKEND && hasJsx(codeOnly);

  if (!BACKEND && !d.isTest && /\.[cm]?[jt]s$/.test(d.ext) && jsx) add(file, 1, "warn", "jsx-in-js-file", "File contains JSX; use .jsx/.tsx.");
  if (!BACKEND && !d.isTest && /sx$/.test(d.ext) && !jsx && !(d.rolePrefix && roleMajorityIsJsx(d.rolePrefix))) {
    add(file, 1, "warn", "jsx-extension-without-jsx", "No JSX in this file; use .js/.ts (unless the folder's convention is .jsx).");
  }

  // Tests may interleave imports with mocks; the remaining checks target source files.
  if (d.isTest) return;
  checkImports(d, src, codeOnly);

  const log = /\bconsole\.(log|debug|info|trace|warn|error)\s*\(/.exec(codeOnly);
  if (log && (BACKEND || /console\.(log|debug|info|trace)/.test(log[0]))) {
    add(file, lineAt(src, log.index), "warn", "console", BACKEND ? "Use the logger (lib/logger.js / req.log), never console." : "Remove console logging or route it to the monitoring/alert layer.");
  }
  const emptyDoc = /\/\*\*[\s*]*\*\//.exec(src);
  if (emptyDoc) add(file, lineAt(src, emptyDoc.index), "warn", "empty-jsdoc", "Empty JSDoc block; write a one-line description or remove it.");

  if (BACKEND) checkBackendContent(d, src, codeOnly);
  else checkFrontendContent(d, src, noComments, codeOnly, jsx);

  // Commented-out code (informational)
  const lines = src.split("\n");
  let run = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    const looksLikeCode = /^\/\/\s*(import |const |let |return\b|if \(|await |<\/?[A-Za-z]|[\w.]+\(.*\);?$|\}|\)|.*=>)/.test(t);
    run = looksLikeCode ? run + 1 : 0;
    if (run === 3) add(file, i - 1, "info", "commented-out-code", "Commented-out code; delete it (git keeps history).");
  }
}

// ---------- run ----------
const files = collectFiles();
for (const file of files) {
  const d = describe(file);
  checkNaming(d);
  let src = "";
  try {
    src = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }
  checkContent(d, src);
}

const order = { error: 0, warn: 1, info: 2 };
findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || order[a.severity] - order[b.severity]);
const count = (s) => findings.filter((f) => f.severity === s).length;
const summary = { profile: PROFILE, files: files.length, errors: count("error"), warnings: count("warn"), info: count("info") };

if (AS_JSON) {
  console.log(JSON.stringify({ summary, findings }, null, 2));
} else {
  console.log(`Conventions check (${PROFILE} profile) - ${files.length} file(s) under ${ROOT}`);
  let current = null;
  for (const f of findings) {
    if (f.file !== current) {
      current = f.file;
      console.log(`\n${f.file}`);
    }
    console.log(`  ${String(f.line || "-").padStart(4)}  ${f.severity.padEnd(5)}  ${f.rule.padEnd(26)} ${f.message}`);
  }
  console.log(`\n${summary.errors} error(s), ${summary.warnings} warning(s), ${summary.info} info`);
}
process.exit(summary.errors || (STRICT && summary.warnings) ? 1 : 0);
