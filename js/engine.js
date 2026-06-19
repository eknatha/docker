// ══════════════════════════════════════════════════════════════
//  DockerLab Offline Analysis Engine
//  Pure, deterministic, zero-network Dockerfile/Compose tooling.
//  Replaces the previous Anthropic API calls so every tool works
//  fully offline (GitHub Pages, file://, air-gapped, anywhere).
// ══════════════════════════════════════════════════════════════
(function (global) {
  'use strict';

  // ---- Dockerfile parser -------------------------------------------------
  // Returns an array of { n: lineNo, raw, instr, args } skipping blanks/comments,
  // and joining backslash line-continuations into a single logical instruction.
  function parseDockerfile(text) {
    const rawLines = text.replace(/\r/g, '').split('\n');
    const out = [];
    let buf = null;
    let startLine = 0;
    rawLines.forEach((line, idx) => {
      const lineNo = idx + 1;
      const trimmed = line.trim();
      if (buf !== null) {
        buf += ' ' + trimmed.replace(/\\$/, '').trim();
        if (!/\\\s*$/.test(line)) {
          pushInstr(out, startLine, buf);
          buf = null;
        }
        return;
      }
      if (!trimmed || trimmed.startsWith('#')) return;
      if (/\\\s*$/.test(line)) {
        buf = trimmed.replace(/\\$/, '').trim();
        startLine = lineNo;
        return;
      }
      pushInstr(out, lineNo, trimmed);
    });
    if (buf !== null) pushInstr(out, startLine, buf);
    return out;
  }

  function pushInstr(out, n, str) {
    const m = str.match(/^(\w+)\s*(.*)$/s);
    if (!m) return;
    out.push({ n, raw: str, instr: m[1].toUpperCase(), args: (m[2] || '').trim() });
  }

  // Known base-image size hints (compressed MB, approximate) for guidance only.
  const IMG_SIZES = {
    'alpine': 7, 'busybox': 4, 'scratch': 0,
    'node:alpine': 50, 'node:slim': 70, 'node': 380, 'node:bullseye': 380,
    'python:alpine': 50, 'python:slim': 45, 'python': 340,
    'ubuntu': 78, 'debian': 124, 'debian:slim': 30,
    'golang:alpine': 110, 'golang': 360, 'openjdk': 220, 'eclipse-temurin': 230,
    'nginx:alpine': 23, 'nginx': 142, 'postgres:alpine': 80, 'postgres': 240,
    'redis:alpine': 30, 'redis': 110, 'mysql': 540
  };

  function baseImageEstimate(from) {
    const img = from.toLowerCase().split(/\s+as\s+/)[0].trim();
    const name = img.split(':')[0];
    const tag = (img.split(':')[1] || 'latest');
    if (IMG_SIZES[img]) return IMG_SIZES[img];
    if (tag.includes('alpine') && IMG_SIZES[name + ':alpine'] != null) return IMG_SIZES[name + ':alpine'];
    if (tag.includes('slim') && IMG_SIZES[name + ':slim'] != null) return IMG_SIZES[name + ':slim'];
    if (IMG_SIZES[name]) return IMG_SIZES[name];
    if (tag.includes('alpine')) return 30;
    if (tag.includes('slim')) return 60;
    return null;
  }

  // ---- LINTER ------------------------------------------------------------
  // Produces { score, issues:[{sev, line, msg, fix}], fixed }
  function lint(text) {
    const ins = parseDockerfile(text);
    const issues = [];
    const add = (sev, line, msg, fix) => issues.push({ sev, line, msg, fix });

    const froms = ins.filter(i => i.instr === 'FROM');
    if (!froms.length) add('CRITICAL', 0, 'No FROM instruction found — a Dockerfile must start with FROM.', 'Add e.g. FROM node:20-alpine');

    froms.forEach(f => {
      const img = f.args.split(/\s+as\s+/i)[0].trim();
      if (/:latest$/i.test(img) || !img.includes(':')) {
        add('WARNING', f.n, `Base image "${img}" uses :latest (or no tag) — builds are non-reproducible.`, `Pin a version, e.g. ${img.split(':')[0]}:20-alpine`);
      }
      if (!/alpine|slim|scratch|distroless/i.test(img) && baseImageEstimate(img) > 150) {
        add('INFO', f.n, `Base image "${img}" is large. Consider an -alpine or -slim variant.`, `Try ${img.split(':')[0]}:alpine or a distroless image`);
      }
    });

    // USER root / missing USER
    const users = ins.filter(i => i.instr === 'USER');
    const lastUser = users[users.length - 1];
    if (!users.length) {
      add('WARNING', 0, 'No USER instruction — container runs as root by default.', 'Add a non-root user, e.g. USER node or USER 1001');
    } else if (/^(root|0)\b/.test(lastUser.args)) {
      add('CRITICAL', lastUser.n, 'Container explicitly runs as root (USER root).', 'Switch to a non-root user before CMD/ENTRYPOINT');
    }

    // apt-get update without install in same RUN; missing cleanup
    ins.filter(i => i.instr === 'RUN').forEach(r => {
      const a = r.args;
      if (/apt-get\s+update/.test(a) && !/apt-get\s+install/.test(a)) {
        add('WARNING', r.n, 'apt-get update in its own RUN layer causes stale-cache bugs.', 'Combine: RUN apt-get update && apt-get install -y …');
      }
      if (/apt-get\s+install/.test(a) && !/rm\s+-rf\s+\/var\/lib\/apt\/lists/.test(a)) {
        add('INFO', r.n, 'apt-get install without cleaning /var/lib/apt/lists bloats the layer.', 'Append && rm -rf /var/lib/apt/lists/*');
      }
      if (/apt-get\s+install/.test(a) && !/--no-install-recommends/.test(a)) {
        add('INFO', r.n, 'apt-get install without --no-install-recommends pulls extra packages.', 'Add --no-install-recommends');
      }
      if (/\bsudo\b/.test(a)) {
        add('WARNING', r.n, 'Use of sudo inside a build is unnecessary and a security smell.', 'Run as the appropriate USER instead of sudo');
      }
      if (/\bcd\s+\S+\s*$/.test(a)) {
        add('INFO', r.n, 'RUN cd does not persist to later layers.', 'Use WORKDIR instead of cd');
      }
    });

    // COPY . . before dependency install (cache-busting)
    const copyAllIdx = ins.findIndex(i => (i.instr === 'COPY' || i.instr === 'ADD') && /^\.\s+\.?/.test(i.args.trim()));
    const depInstallIdx = ins.findIndex(i => i.instr === 'RUN' && /(npm (ci|install)|pip install|go mod|bundle install|composer install)/.test(i.args));
    if (copyAllIdx > -1 && depInstallIdx > copyAllIdx) {
      add('WARNING', ins[copyAllIdx].n, 'COPY . . before installing dependencies busts the build cache on every source change.', 'Copy manifest first (package*.json / requirements.txt), install, then COPY . .');
    }

    // ADD vs COPY
    ins.filter(i => i.instr === 'ADD').forEach(r => {
      if (!/^https?:\/\//.test(r.args) && !/\.(tar|tgz|gz|bz2|xz)/.test(r.args)) {
        add('INFO', r.n, 'ADD used for a plain copy — COPY is preferred (ADD has surprising URL/tar behaviour).', 'Replace ADD with COPY');
      }
    });

    // Secrets in ENV/ARG
    ins.filter(i => i.instr === 'ENV' || i.instr === 'ARG').forEach(r => {
      if (/\b\w*(SECRET|PASSWORD|PASSWD|TOKEN|APIKEY|API_KEY|PRIVATE_?KEY|ACCESS_?KEY)\w*\s*[=\s]\s*\S/i.test(r.args)) {
        add('CRITICAL', r.n, 'Possible hard-coded secret in ' + r.instr + ' — it is baked into every image layer.', 'Pass secrets at runtime (--env-file, secrets, or BuildKit --secret)');
      }
    });

    // EXPOSE 22 / privileged ports
    ins.filter(i => i.instr === 'EXPOSE').forEach(r => {
      if (/\b22\b/.test(r.args)) add('WARNING', r.n, 'EXPOSE 22 (SSH) inside a container is an anti-pattern.', 'Use docker exec instead of running SSH');
    });

    // No HEALTHCHECK
    if (!ins.some(i => i.instr === 'HEALTHCHECK')) {
      add('INFO', 0, 'No HEALTHCHECK — orchestrators cannot detect an unhealthy container.', 'Add HEALTHCHECK CMD curl -f http://localhost:PORT/health || exit 1');
    }

    // CMD/ENTRYPOINT present + shell form
    const hasStart = ins.some(i => i.instr === 'CMD' || i.instr === 'ENTRYPOINT');
    if (!hasStart) add('CRITICAL', 0, 'No CMD or ENTRYPOINT — container has nothing to run.', 'Add CMD ["node","server.js"] (exec form)');
    ins.filter(i => i.instr === 'CMD' || i.instr === 'ENTRYPOINT').forEach(r => {
      if (!r.args.trim().startsWith('[')) {
        add('INFO', r.n, `${r.instr} uses shell form — signals (SIGTERM) are not forwarded to your process.`, `Use exec form: ${r.instr} ["executable","arg"]`);
      }
    });

    // .dockerignore reminder when COPY . .
    if (copyAllIdx > -1) {
      add('INFO', ins[copyAllIdx].n, 'COPY . . detected — ensure a .dockerignore excludes node_modules, .git, etc.', 'Create a .dockerignore file');
    }

    // Multi-stage hint
    if (froms.length === 1 && /(npm run build|go build|mvn |gradle |cargo build|webpack)/.test(text)) {
      add('INFO', 0, 'Build step detected in a single-stage image — build tools ship in your final image.', 'Use a multi-stage build to copy only artifacts into a slim runtime stage');
    }

    // Score
    const weight = { CRITICAL: 25, WARNING: 10, INFO: 3 };
    let score = 100;
    issues.forEach(i => { score -= (weight[i.sev] || 0); });
    score = Math.max(0, Math.min(100, score));

    return { score, issues, count: issues.length };
  }

  // ---- EXPLAINER ---------------------------------------------------------
  const INSTR_DOCS = {
    FROM: 'Sets the base image every later layer builds on. The foundation of the image.',
    WORKDIR: 'Sets the working directory for subsequent instructions; created if absent. Prefer it over RUN cd.',
    COPY: 'Copies files/dirs from build context into the image. Cache-friendly; preferred over ADD.',
    ADD: 'Like COPY but can fetch URLs and auto-extract local tar archives. Use COPY unless you need those.',
    RUN: 'Executes a command in a new layer at build time (installing packages, compiling, etc.).',
    CMD: 'Default command run when the container starts. Overridable at `docker run`. Only the last CMD applies.',
    ENTRYPOINT: 'Configures the container as an executable; CMD becomes its default arguments.',
    ENV: 'Sets environment variables available at build and runtime. Persisted in image metadata.',
    ARG: 'Build-time-only variable passed via --build-arg. Not present at runtime.',
    EXPOSE: 'Documents which ports the container listens on. Does not publish them (-p does).',
    VOLUME: 'Declares a mount point for external/persistent storage, bypassing the union filesystem.',
    USER: 'Sets the UID/username for subsequent RUN/CMD/ENTRYPOINT. Use a non-root user for security.',
    HEALTHCHECK: 'Tells Docker how to test that the container is still working.',
    LABEL: 'Adds key/value metadata to the image (maintainer, version, source, etc.).',
    SHELL: 'Overrides the default shell used for the shell form of RUN/CMD/ENTRYPOINT.',
    STOPSIGNAL: 'Sets the system call signal sent to the container to exit.',
    ONBUILD: 'Registers a trigger instruction to run when this image is used as a base for another build.'
  };

  function explain(text) {
    const ins = parseDockerfile(text);
    if (!ins.length) return { lines: [], note: 'No instructions found.' };
    let stage = 0;
    const lines = ins.map(i => {
      let detail = INSTR_DOCS[i.instr] || 'Custom or less-common instruction.';
      let extra = '';
      if (i.instr === 'FROM') {
        stage++;
        const asName = (i.args.match(/\s+as\s+(\S+)/i) || [])[1];
        extra = asName ? ` Starts build stage #${stage} named "${asName}".` : (ins.filter(x => x.instr === 'FROM').length > 1 ? ` Build stage #${stage}.` : '');
      }
      if (i.instr === 'COPY' && /--from=/.test(i.args)) extra = ' Copies artifacts from an earlier build stage (multi-stage pattern).';
      if ((i.instr === 'CMD' || i.instr === 'ENTRYPOINT')) extra = i.args.trim().startsWith('[') ? ' (exec form — recommended).' : ' (shell form — wraps in /bin/sh -c, signals not forwarded).';
      return { n: i.n, instr: i.instr, args: i.args, detail: detail + extra };
    });
    return { lines, stages: stage };
  }

  // ---- OPTIMIZER ---------------------------------------------------------
  function optimize(text) {
    const ins = parseDockerfile(text);
    const tips = [];
    const add = (impact, msg) => tips.push({ impact, msg });
    const froms = ins.filter(i => i.instr === 'FROM');
    const from = froms[0];
    let est = from ? baseImageEstimate(from.args) : null;

    if (from && !/alpine|slim|scratch|distroless/i.test(from.args)) {
      const base = from.args.split(':')[0].split(/\s/)[0];
      add('HIGH', `Switch base from "${from.args}" to ${base}:alpine or ${base}:slim — can cut 200–350 MB.`);
    }
    if (froms.length === 1 && /(npm run build|go build|mvn|gradle|cargo build|tsc|webpack|pip wheel)/.test(text)) {
      add('HIGH', 'Adopt a multi-stage build: compile in a builder stage, COPY --from only the artifacts into a slim runtime. Often 60–90% smaller.');
    }
    const runs = ins.filter(i => i.instr === 'RUN');
    if (runs.length > 3) {
      add('MEDIUM', `Found ${runs.length} RUN layers — chain related commands with && to reduce layer count and image size.`);
    }
    if (/apt-get install/.test(text) && !/rm -rf \/var\/lib\/apt\/lists/.test(text)) {
      add('MEDIUM', 'Clean apt cache in the same RUN: && rm -rf /var/lib/apt/lists/* (saves 20–40 MB).');
    }
    if (/pip install/.test(text) && !/--no-cache-dir/.test(text)) {
      add('MEDIUM', 'Add --no-cache-dir to pip install to avoid caching wheels in the image.');
    }
    if (/npm install\b/.test(text) && !/npm ci/.test(text)) {
      add('MEDIUM', 'Use `npm ci --only=production` instead of `npm install` for reproducible, smaller, dev-dep-free installs.');
    }
    const copyAllIdx = ins.findIndex(i => i.instr === 'COPY' && /^\.\s+\.?/.test(i.args.trim()));
    const depIdx = ins.findIndex(i => i.instr === 'RUN' && /(npm (ci|install)|pip install)/.test(i.args));
    if (copyAllIdx > -1 && depIdx > copyAllIdx) {
      add('HIGH', 'Reorder for layer caching: COPY manifest → install deps → COPY source. Avoids re-installing on every code change.');
    }
    if (!ins.some(i => i.instr === 'COPY' && /\.dockerignore/.test(i.args)) && copyAllIdx > -1) {
      add('LOW', 'Add a .dockerignore (node_modules, .git, *.log, dist) to shrink the build context.');
    }
    if (!tips.length) add('LOW', 'No obvious size wins found — this Dockerfile already follows good practices. 🎉');

    return { tips, estimate: est };
  }

  // ---- SECURITY ----------------------------------------------------------
  function security(text) {
    const ins = parseDockerfile(text);
    const findings = [];
    const add = (sev, line, msg, fix) => findings.push({ sev, line, msg, fix });

    const users = ins.filter(i => i.instr === 'USER');
    const lastUser = users[users.length - 1];
    if (!users.length || /^(root|0)\b/.test((lastUser || {}).args || '')) {
      add('CRITICAL', (lastUser || {}).n || 0, 'Container runs as root — a breakout has host-root-equivalent power.', 'Create and switch to a non-root user (USER 1001).');
    }
    ins.filter(i => i.instr === 'ENV' || i.instr === 'ARG').forEach(r => {
      if (/\b\w*(SECRET|PASSWORD|PASSWD|TOKEN|APIKEY|API_KEY|PRIVATE_?KEY|ACCESS_?KEY|AWS_)\w*\s*[=\s]\s*\S/i.test(r.args)) {
        add('CRITICAL', r.n, `Hard-coded credential in ${r.instr} — permanently embedded in image history.`, 'Inject at runtime or use BuildKit --secret (never bake secrets).');
      }
    });
    ins.filter(i => i.instr === 'FROM').forEach(f => {
      if (/:latest$/i.test(f.args) || !f.args.split(/\s+as\s+/i)[0].includes(':')) {
        add('WARNING', f.n, 'Unpinned base image (:latest) — you cannot audit or reproduce what ships.', 'Pin to a specific, scanned tag or digest (@sha256:…).');
      }
    });
    ins.filter(i => i.instr === 'EXPOSE').forEach(r => {
      if (/\b22\b/.test(r.args)) add('WARNING', r.n, 'SSH (port 22) exposed — enlarges attack surface.', 'Remove SSH; use docker exec.');
    });
    if (/curl[^|]*\|\s*(sudo\s+)?(sh|bash)/.test(text) || /wget[^|]*\|\s*(sudo\s+)?(sh|bash)/.test(text)) {
      add('CRITICAL', 0, 'Piping a downloaded script straight into a shell (curl | sh) — unverified remote code execution.', 'Download, verify a checksum/signature, then run.');
    }
    ins.filter(i => i.instr === 'ADD').forEach(r => {
      if (/^https?:\/\//.test(r.args)) add('WARNING', r.n, 'ADD from a URL fetches unverified remote content.', 'Download with checksum verification in a RUN step.');
    });
    if (/--privileged/.test(text)) add('CRITICAL', 0, '--privileged grants nearly all host capabilities.', 'Drop it; add only the specific --cap-add you need.');
    if (!ins.some(i => i.instr === 'HEALTHCHECK')) {
      add('INFO', 0, 'No HEALTHCHECK — failures may go undetected.', 'Add a HEALTHCHECK probe.');
    }
    if (/chmod\s+777/.test(text)) add('WARNING', 0, 'chmod 777 grants world-writable permissions.', 'Use least-privilege (e.g. 755 / 644).');

    if (!findings.length) add('PASS', 0, 'No common security misconfigurations detected. Still run Trivy/Grype for CVE scanning.', '');

    const score = Math.max(0, 100 - findings.reduce((a, f) => a + ({ CRITICAL: 30, WARNING: 12, INFO: 4, PASS: 0 }[f.sev] || 0), 0));
    return { findings, score };
  }

  // ---- GENERATOR ---------------------------------------------------------
  const TEMPLATES = {
    'Node.js': (env) => env === 'development'
      ? `FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nEXPOSE 3000\nCMD ["npm","run","dev"]`
      : `# ---- build ----\nFROM node:20-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build || true\n\n# ---- runtime ----\nFROM node:20-alpine\nWORKDIR /app\nENV NODE_ENV=production\nCOPY package*.json ./\nRUN npm ci --only=production && npm cache clean --force\nCOPY --from=build /app .\nUSER node\nEXPOSE 3000\nHEALTHCHECK --interval=30s CMD wget -qO- http://localhost:3000/health || exit 1\nCMD ["node","server.js"]`,
    'Python': () => `FROM python:3.12-slim AS build\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir --prefix=/install -r requirements.txt\n\nFROM python:3.12-slim\nWORKDIR /app\nCOPY --from=build /install /usr/local\nCOPY . .\nRUN useradd -m appuser\nUSER appuser\nEXPOSE 8000\nHEALTHCHECK --interval=30s CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/health')" || exit 1\nCMD ["python","app.py"]`,
    'Go': () => `FROM golang:1.22-alpine AS build\nWORKDIR /src\nCOPY go.* ./\nRUN go mod download\nCOPY . .\nRUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /app .\n\nFROM scratch\nCOPY --from=build /app /app\nEXPOSE 8080\nUSER 1001\nENTRYPOINT ["/app"]`,
    'Java': () => `FROM eclipse-temurin:21-jdk-alpine AS build\nWORKDIR /app\nCOPY . .\nRUN ./mvnw -q clean package -DskipTests\n\nFROM eclipse-temurin:21-jre-alpine\nWORKDIR /app\nCOPY --from=build /app/target/*.jar app.jar\nRUN addgroup -S app && adduser -S app -G app\nUSER app\nEXPOSE 8080\nHEALTHCHECK --interval=30s CMD wget -qO- http://localhost:8080/actuator/health || exit 1\nENTRYPOINT ["java","-jar","app.jar"]`,
    'Rust': () => `FROM rust:1.78-slim AS build\nWORKDIR /app\nCOPY . .\nRUN cargo build --release\n\nFROM debian:bookworm-slim\nWORKDIR /app\nCOPY --from=build /app/target/release/app /app/app\nRUN useradd -m appuser\nUSER appuser\nEXPOSE 8080\nCMD ["/app/app"]`,
    'PHP': () => `FROM composer:2 AS vendor\nWORKDIR /app\nCOPY composer.* ./\nRUN composer install --no-dev --no-scripts --optimize-autoloader\n\nFROM php:8.3-fpm-alpine\nWORKDIR /var/www\nRUN docker-php-ext-install pdo pdo_mysql opcache\nCOPY --from=vendor /app/vendor ./vendor\nCOPY . .\nRUN chown -R www-data:www-data /var/www\nUSER www-data\nEXPOSE 9000\nCMD ["php-fpm"]`,
    'Ruby': () => `FROM ruby:3.3-slim AS build\nWORKDIR /app\nCOPY Gemfile* ./\nRUN bundle install --without development test\nCOPY . .\n\nFROM ruby:3.3-slim\nWORKDIR /app\nCOPY --from=build /usr/local/bundle /usr/local/bundle\nCOPY --from=build /app /app\nRUN useradd -m appuser && chown -R appuser /app\nUSER appuser\nEXPOSE 3000\nCMD ["rails","server","-b","0.0.0.0"]`,
    '.NET': () => `FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build\nWORKDIR /src\nCOPY *.csproj ./\nRUN dotnet restore\nCOPY . .\nRUN dotnet publish -c Release -o /app\n\nFROM mcr.microsoft.com/dotnet/aspnet:8.0\nWORKDIR /app\nCOPY --from=build /app .\nUSER $APP_UID\nEXPOSE 8080\nENTRYPOINT ["dotnet","App.dll"]`,
    'Next.js': () => `FROM node:20-alpine AS deps\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\n\nFROM node:20-alpine AS build\nWORKDIR /app\nCOPY --from=deps /app/node_modules ./node_modules\nCOPY . .\nRUN npm run build\n\nFROM node:20-alpine\nWORKDIR /app\nENV NODE_ENV=production\nCOPY --from=build /app/.next/standalone ./\nCOPY --from=build /app/.next/static ./.next/static\nCOPY --from=build /app/public ./public\nUSER node\nEXPOSE 3000\nCMD ["node","server.js"]`,
    'React': () => `FROM node:20-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\n\nFROM nginx:alpine\nCOPY --from=build /app/dist /usr/share/nginx/html\nEXPOSE 80\nHEALTHCHECK CMD wget -qO- http://localhost/ || exit 1\nCMD ["nginx","-g","daemon off;"]`
  };

  function generate(lang, env, desc) {
    const base = (TEMPLATES[lang] || TEMPLATES['Node.js'])(env);
    const notes = [];
    desc = (desc || '').toLowerCase();
    if (/redis|postgres|mysql|mongo/.test(desc)) notes.push('# Tip: define your DB/cache as a separate service in docker-compose.yaml, not inside this image.');
    if (/port\s*(\d{2,5})/.test(desc)) {
      const p = desc.match(/port\s*(\d{2,5})/)[1];
      notes.push(`# Note: you mentioned port ${p} — adjust the EXPOSE line and your app's listen port accordingly.`);
    }
    if (/ffmpeg|imagemagick|libvips|build-essential/.test(desc)) notes.push('# Tip: install OS build deps in the BUILD stage only so they do not ship in the runtime image.');
    return { dockerfile: base, notes, lang, env };
  }

  // ---- COMPOSE EXPLAINER -------------------------------------------------
  function explainCompose(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const services = [];
    let cur = null, inServices = false, baseIndent = null;
    const volumes = [], networks = [];
    let section = null;

    lines.forEach(line => {
      if (!line.trim() || line.trim().startsWith('#')) return;
      const indent = line.match(/^\s*/)[0].length;
      const t = line.trim();

      if (/^services:\s*$/.test(t)) { inServices = true; section = 'services'; return; }
      if (/^volumes:\s*$/.test(t)) { inServices = false; section = 'volumes'; return; }
      if (/^networks:\s*$/.test(t)) { inServices = false; section = 'networks'; return; }
      if (/^version:/.test(t)) return;

      if (section === 'volumes' && /^\S+:/.test(t)) volumes.push(t.replace(/:.*$/, ''));
      if (section === 'networks' && /^\S+:/.test(t)) networks.push(t.replace(/:.*$/, ''));

      if (inServices) {
        if (baseIndent === null && indent > 0) baseIndent = indent;
        if (indent === baseIndent && /^[\w.-]+:\s*$/.test(t)) {
          cur = { name: t.replace(/:.*/, ''), image: null, build: null, ports: [], depends: [], env: [], volumes: [], healthcheck: false };
          services.push(cur);
        } else if (cur) {
          if (/^image:\s*/.test(t)) cur.image = t.replace(/^image:\s*/, '');
          if (/^build:/.test(t)) cur.build = t.replace(/^build:\s*/, '') || '.';
          if (/^\s*-\s*["']?\d+:\d+/.test(line) || /^-\s*["']?\d+:\d+/.test(t)) cur.ports.push(t.replace(/^-\s*/, '').replace(/["']/g, ''));
          if (/healthcheck:/.test(t)) cur.healthcheck = true;
          if (/condition:|^-\s*\w+$/.test(t) && cur && /service_/.test(t)) { /* depends handled below */ }
        }
      }
    });

    // crude depends_on capture
    const dep = text.match(/depends_on:\s*([\s\S]*?)(?=\n\s*\w+:|\n\S|$)/g);
    return { services, volumes, networks };
  }

  // ---- NETWORK / DEBUGGER knowledge bases --------------------------------
  const NET_TOPICS = [
    { k: ['dns', 'resolve', 'service name', 'hostname'], title: 'Service Discovery & DNS', body: 'On a user-defined bridge or Compose network, Docker runs an embedded DNS server at 127.0.0.11. Containers reach each other by service/container name — e.g. service "app" connects to "db" simply via the hostname `db` on its normal port (Postgres 5432, etc.). No links or IPs needed. This does NOT work on the default bridge, only user-defined networks (which Compose creates automatically).' },
    { k: ['bridge', 'default network'], title: 'Bridge Networking', body: 'The default network driver. Containers get a private IP on the docker0 bridge and reach the outside via NAT. Use a *user-defined* bridge (not the default) to get automatic DNS-based service discovery and isolation between app groups.' },
    { k: ['host network', 'host mode'], title: 'Host Networking', body: 'With `--network host` the container shares the host\'s network stack directly — no NAT, no port mapping, lowest latency, but zero isolation and port conflicts with the host. Linux only.' },
    { k: ['overlay', 'swarm', 'multi-host'], title: 'Overlay Networking', body: 'Overlay networks span multiple Docker hosts (Swarm / multi-host). They use VXLAN tunnels so containers on different machines communicate as if on one L2 network. The basis for multi-host service discovery.' },
    { k: ['macvlan'], title: 'Macvlan', body: 'Assigns containers a real MAC/IP on the physical LAN, making them appear as physical devices on your network. Useful for legacy apps expecting a routable IP, but needs promiscuous mode and careful subnet planning.' },
    { k: ['port', 'publish', 'expose', '-p'], title: 'Ports: EXPOSE vs publish', body: 'EXPOSE only documents a port. To actually reach it from the host you must publish with `-p HOST:CONTAINER` (or `ports:` in Compose). Container-to-container traffic on the same network needs neither — they talk on the container port directly.' }
  ];

  function explainNetwork(q) {
    const ql = (q || '').toLowerCase();
    const hits = NET_TOPICS.filter(t => t.k.some(k => ql.includes(k)));
    return { topics: hits.length ? hits : NET_TOPICS };
  }

  const ERROR_KB = [
    { k: ['port is already allocated', 'address already in use', 'bind: address'], title: 'Port already in use', cause: 'Another process (or a previous container) already holds the host port you are publishing.', fix: ['Find it: `docker ps` then `sudo lsof -i :PORT`', 'Stop the conflicting container, or publish a different host port: `-p 3001:3000`', 'Remove dead containers: `docker rm -f $(docker ps -aq)`'] },
    { k: ['no space left on device'], title: 'No space left on device', cause: 'Docker\'s storage area is full of dangling images, stopped containers, build cache, or volumes.', fix: ['Reclaim space: `docker system prune -af --volumes`', 'Inspect usage: `docker system df`', 'Remove unused build cache: `docker builder prune`'] },
    { k: ['enotfound', 'getaddrinfo', 'temporary failure in name resolution', 'could not resolve'], title: 'DNS / name resolution failure', cause: 'The container cannot resolve a hostname — network or DNS misconfiguration, or no internet during build.', fix: ['Check connectivity: `docker run --rm alpine ping -c1 1.1.1.1`', 'Set a DNS server: `--dns 8.8.8.8` or in daemon.json', 'On a user-defined network, reference services by service name, not localhost'] },
    { k: ['permission denied', 'eacces', 'operation not permitted'], title: 'Permission denied', cause: 'The container user lacks rights on a file/volume, or you switched to a non-root USER without fixing ownership.', fix: ['chown files to the runtime user in the Dockerfile: `RUN chown -R appuser /app`', 'For bind mounts, match host UID/GID', 'Verify the USER has access to the working directory'] },
    { k: ['cannot connect to the docker daemon', 'is the docker daemon running'], title: 'Cannot connect to Docker daemon', cause: 'The Docker daemon is not running, or your user lacks access to the socket.', fix: ['Start it: `sudo systemctl start docker`', 'Add your user to the docker group: `sudo usermod -aG docker $USER` then re-login', 'On Mac/Windows make sure Docker Desktop is running'] },
    { k: ['oomkilled', 'out of memory', 'killed'], title: 'Container OOM-killed', cause: 'The container exceeded its memory limit and the kernel killed it.', fix: ['Raise the limit: `--memory=512m`', 'Profile and reduce app memory usage', 'Check exit: `docker inspect --format "{{.State.OOMKilled}}" NAME`'] },
    { k: ['manifest unknown', 'not found', 'pull access denied', 'repository does not exist'], title: 'Image pull failed', cause: 'The image name/tag is wrong, the registry needs auth, or the image is private.', fix: ['Verify name and tag exactly', 'Log in: `docker login`', 'For private registries, check credentials/permissions'] },
    { k: ['exec format error'], title: 'exec format error', cause: 'Architecture mismatch — e.g. an arm64 image on amd64 (or vice-versa), common on Apple Silicon.', fix: ['Build/pull for the right platform: `--platform linux/amd64`', 'Use buildx for multi-arch images', 'Check the base image supports your CPU arch'] }
  ];

  function diagnose(log) {
    const l = (log || '').toLowerCase();
    const hits = ERROR_KB.filter(e => e.k.some(k => l.includes(k)));
    return { matches: hits };
  }

  // ---- export ------------------------------------------------------------
  global.DLEngine = {
    parseDockerfile, lint, explain, optimize, security,
    generate, explainCompose, explainNetwork, diagnose, baseImageEstimate
  };
})(window);
