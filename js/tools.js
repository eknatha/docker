// ══════════════════════════════════════════════════════════════
//  Tool runners — wire the offline DLEngine to the existing UI.
//  Replaces the old callClaude / TOOL_PROMPTS / runTool block.
// ══════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const E = window.DLEngine;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const SEV_CLASS = { CRITICAL: 'sev-err', ERROR: 'sev-err', WARNING: 'sev-warn', WARN: 'sev-warn', INFO: 'sev-info', PASS: 'sev-ok', OK: 'sev-ok' };
  const SEV_LABEL = { CRITICAL: 'CRITICAL', WARNING: 'WARN', INFO: 'INFO', PASS: 'PASS' };

  function issueLine(sev, line, msg, fix) {
    const where = line ? `<span style="color:var(--muted)">L${line}</span> ` : '';
    const fixHtml = fix ? `<div style="color:var(--green);margin-top:2px">↳ ${esc(fix)}</div>` : '';
    return `<div class="issue-line"><span class="sev ${SEV_CLASS[sev] || 'sev-info'}">${SEV_LABEL[sev] || sev}</span><span>${where}${esc(msg)}${fixHtml}</span></div>`;
  }

  function scoreBadge(score) {
    const color = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--red)';
    return `<span style="font-family:var(--display);font-weight:800;color:${color}">${score}/100</span>`;
  }

  function show(outId, html) { const el = $(outId); el.classList.remove('placeholder'); el.innerHTML = html; }

  // ---- individual renderers ----
  function runLinter(input) {
    const r = E.lint(input);
    let h = `<div style="margin-bottom:10px;font-size:1.05rem">Score: ${scoreBadge(r.score)} · ${r.count} issue${r.count === 1 ? '' : 's'}</div>`;
    if (!r.issues.length) h += issueLine('PASS', 0, 'No issues found — clean Dockerfile! 🎉', '');
    else h += r.issues.sort((a, b) => ({ CRITICAL: 0, WARNING: 1, INFO: 2 }[a.sev] - { CRITICAL: 0, WARNING: 1, INFO: 2 }[b.sev])).map(i => issueLine(i.sev, i.line, i.msg, i.fix)).join('');
    const bar = $('linter-score'); if (bar) bar.innerHTML = scoreBadge(r.score);
    show('linter-result', h);
  }

  function runExplainer(input) {
    const r = E.explain(input);
    if (!r.lines.length) return show('explainer-result', issueLine('INFO', 0, 'No instructions found.', ''));
    const intro = r.stages > 1 ? `<div style="color:var(--cyan);margin-bottom:10px">🧱 Multi-stage build with ${r.stages} stages.</div>` : '';
    const h = intro + r.lines.map(l =>
      `<div style="margin-bottom:10px;border-left:2px solid var(--border2);padding-left:10px">
        <div><code>${esc(l.instr)}</code> <span style="color:var(--muted)">${esc(l.args)}</span> <span style="color:var(--muted);font-size:11px">· L${l.n}</span></div>
        <div style="color:var(--text);font-size:13px;margin-top:2px">${esc(l.detail)}</div>
      </div>`).join('');
    show('explainer-result', h);
  }

  function runOptimizer(input) {
    const r = E.optimize(input);
    const estLine = r.estimate != null ? `<div style="margin-bottom:10px">Estimated base image size: <strong>~${r.estimate} MB</strong></div>` : '';
    const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const colors = { HIGH: 'var(--red)', MEDIUM: 'var(--yellow)', LOW: 'var(--muted)' };
    const h = estLine + r.tips.sort((a, b) => rank[a.impact] - rank[b.impact]).map(t =>
      `<div class="issue-line"><span class="sev" style="background:${colors[t.impact]}22;color:${colors[t.impact]}">${t.impact}</span><span>${esc(t.msg)}</span></div>`).join('');
    show('optimizer-result', h);
  }

  function runSecurity(input) {
    const r = E.security(input);
    let h = `<div style="margin-bottom:10px;font-size:1.05rem">Security score: ${scoreBadge(r.score)}</div>`;
    h += r.findings.sort((a, b) => ({ CRITICAL: 0, WARNING: 1, INFO: 2, PASS: 3 }[a.sev] - { CRITICAL: 0, WARNING: 1, INFO: 2, PASS: 3 }[b.sev]))
      .map(f => issueLine(f.sev, f.line, f.msg, f.fix)).join('');
    show('security-result', h);
  }

  function runGenerator(lang, env, desc) {
    const r = E.generate(lang, env, desc);
    const notes = r.notes.length ? '\n\n' + r.notes.join('\n') : '';
    const code = r.dockerfile + notes;
    show('generator-result', `<pre style="background:var(--bg3);padding:12px;border-radius:6px;overflow-x:auto;font-size:12px;border:1px solid var(--border);margin:0;white-space:pre-wrap">${esc(code)}</pre>`);
    $('generator-result').dataset.copy = code;
  }

  function runCompose(input) {
    const r = E.explainCompose(input);
    if (!r.services.length) return show('compose-result', issueLine('INFO', 0, 'No services detected — is this a valid compose file?', ''));
    const svc = r.services.map(s => {
      const rows = [];
      rows.push(`<strong style="color:var(--blue-l)">${esc(s.name)}</strong>`);
      if (s.image) rows.push(`image: <code>${esc(s.image)}</code>`);
      if (s.build) rows.push(`build: <code>${esc(s.build)}</code> (built from a local Dockerfile)`);
      if (s.ports.length) rows.push(`ports: ${s.ports.map(p => `<code>${esc(p)}</code>`).join(', ')} <span style="color:var(--muted)">(host:container)</span>`);
      if (s.healthcheck) rows.push(`<span style="color:var(--green)">✓ healthcheck defined</span>`);
      return `<div style="margin-bottom:12px;border-left:2px solid var(--border2);padding-left:10px">${rows.join('<br>')}</div>`;
    }).join('');
    let extra = '';
    if (r.volumes.length) extra += `<div style="margin-top:8px">📦 Named volumes: ${r.volumes.map(v => `<code>${esc(v)}</code>`).join(', ')} — persist data beyond container life.</div>`;
    if (r.networks.length) extra += `<div>🌐 Networks: ${r.networks.map(v => `<code>${esc(v)}</code>`).join(', ')}.</div>`;
    extra += `<div style="margin-top:8px;color:var(--muted)">Services share an auto-created network and resolve each other by service name via Docker's embedded DNS (127.0.0.11).</div>`;
    show('compose-result', svc + extra);
  }

  function runNetwork(q) {
    const r = E.explainNetwork(q);
    const h = r.topics.map(t =>
      `<div style="margin-bottom:12px"><div style="color:var(--cyan);font-weight:600">🌐 ${esc(t.title)}</div><div style="margin-top:3px">${esc(t.body)}</div></div>`).join('');
    show('network-result', h);
  }

  function runDebugger(log) {
    const r = E.diagnose(log);
    if (!r.matches.length) {
      return show('debugger-result', issueLine('INFO', 0, 'No known signature matched. Check container logs with `docker logs <name>`, inspect with `docker inspect`, and search the exact error string.', ''));
    }
    const h = r.matches.map(m =>
      `<div style="margin-bottom:14px">
        <div style="color:var(--red);font-weight:600">🐛 ${esc(m.title)}</div>
        <div style="margin:3px 0"><span style="color:var(--muted)">Cause:</span> ${esc(m.cause)}</div>
        <div style="color:var(--green)">Fix:</div>
        <ul style="margin:2px 0 0 18px">${m.fix.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      </div>`).join('');
    show('debugger-result', h);
  }

  // ---- dispatcher (same signature the buttons call) ----
  window.runTool = function (tool) {
    try {
      if (tool === 'linter') { const v = $('linter-input').value.trim(); if (!v) return alert('Please paste a Dockerfile first.'); return runLinter(v); }
      if (tool === 'explainer') { const v = $('explainer-input').value.trim(); if (!v) return alert('Please paste a Dockerfile first.'); return runExplainer(v); }
      if (tool === 'compose') { const v = $('compose-input').value.trim(); if (!v) return alert('Please paste a compose file first.'); return runCompose(v); }
      if (tool === 'generator') { return runGenerator($('gen-lang').value, $('gen-env').value, $('generator-input').value.trim()); }
      if (tool === 'optimizer') { const v = $('optimizer-input').value.trim(); if (!v) return alert('Please paste a Dockerfile first.'); return runOptimizer(v); }
      if (tool === 'debugger') { const v = $('debugger-input').value.trim(); if (!v) return alert('Please paste your error output first.'); return runDebugger(v); }
      if (tool === 'security') { const v = $('security-input').value.trim(); if (!v) return alert('Please paste a Dockerfile first.'); return runSecurity(v); }
      if (tool === 'network') { const v = $('network-input').value.trim(); if (!v) return alert('Please enter your networking question.'); return runNetwork(v); }
    } catch (e) {
      console.error(e);
      const out = $(tool + '-result');
      if (out) { out.classList.remove('placeholder'); out.innerHTML = `<span style="color:var(--red)">⚠ Something went wrong parsing that input. Check the format and try again.</span>`; }
    }
  };

  // copyOutput now reads either the dataset payload or text content
  window.copyOutput = function (id) {
    const el = $(id);
    const text = el.dataset.copy || el.textContent;
    navigator.clipboard.writeText(text).then(() => {
      const bar = el.closest('.output-area').querySelector('.btn');
      if (bar) { const t = bar.textContent; bar.textContent = '✓ Copied'; setTimeout(() => bar.textContent = t, 1200); }
    }).catch(() => {});
  };
})();
