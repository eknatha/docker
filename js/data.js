// ══════════════════════════════════════════════════════════════
//  Data loader — fetches the six JSON datasets from the repo's
//  /data directory and exposes them as the globals app.js expects.
//  Works offline: served over http(s) it fetches; if fetch fails
//  (e.g. file://), it shows a clear message instead of a blank page.
// ══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const FILES = {
    QUIZ_ALL: 'data/quiz.json',
    CHEAT_DATA: 'data/cheatsheet.json',
    MODULES: 'data/modules.json',
    BP_DATA: 'data/best-practices.json',
    LIBRARY: 'data/library.json',
    DCA_DOMAINS: 'data/dca.json'
  };

  async function boot() {
    try {
      const entries = await Promise.all(
        Object.entries(FILES).map(async ([key, path]) => {
          const res = await fetch(path, { cache: 'force-cache' });
          if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
          return [key, await res.json()];
        })
      );
      entries.forEach(([key, val]) => { window[key] = val; });

      // Stamp real counts into the UI so headline numbers never drift again.
      stampCounts();

      // Data is ready — signal app.js to initialise.
      if (typeof window.initDockerLab === 'function') window.initDockerLab();
      document.dispatchEvent(new Event('dl-data-ready'));
    } catch (err) {
      console.error('DockerLab data load failed:', err);
      showLoadError(err);
    }
  }

  function stampCounts() {
    const cmdCount = (window.CHEAT_DATA || []).reduce((a, c) => a + ((c.items && c.items.length) || 0), 0);
    const bpCount = (window.BP_DATA || []).reduce((a, c) => a + ((c.rules && c.rules.length) || 0), 0);
    const quizCount = (window.QUIZ_ALL || []).length;
    const modCount = (window.MODULES || []).length;
    const libCount = (window.LIBRARY || []).length;

    setText('[data-count="commands"]', cmdCount + '+');
    setText('[data-count="bestpractices"]', bpCount + '+');
    setText('[data-count="quiz"]', String(quizCount));
    setText('[data-count="modules"]', String(modCount));
    setText('[data-count="library"]', String(libCount));
  }

  function setText(sel, val) {
    document.querySelectorAll(sel).forEach(el => { el.textContent = val; });
  }

  function showLoadError(err) {
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#080b0f;color:#e6edf3;font-family:monospace;padding:2rem;text-align:center';
    banner.innerHTML = `<div style="max-width:540px">
      <div style="font-size:2rem;margin-bottom:1rem">🐳⚠️</div>
      <h2 style="margin-bottom:.75rem">Couldn't load DockerLab data</h2>
      <p style="color:#6e8098;line-height:1.6">The JSON datasets in <code>/data</code> couldn't be fetched.<br>
      This happens when opening <code>index.html</code> directly from disk (<code>file://</code>),
      because browsers block <code>fetch()</code> on local files.</p>
      <p style="margin-top:1rem;color:#5b96f7">Run a local server instead:</p>
      <pre style="background:#161b22;padding:12px;border-radius:6px;margin-top:.5rem;text-align:left;overflow-x:auto">python3 -m http.server 8080
# then open http://localhost:8080</pre>
      <p style="margin-top:1rem;font-size:12px;color:#6e8098">${(err && err.message) || err}</p>
    </div>`;
    document.body.appendChild(banner);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
