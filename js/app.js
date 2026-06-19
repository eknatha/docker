// ══════════════════════════════════════════════════════════════
//  App logic — theme, navigation, quiz engine, and all renderers.
//  Data (QUIZ_ALL, CHEAT_DATA, MODULES, BP_DATA, LIBRARY, DCA_DOMAINS)
//  is provided as globals by js/data.js before this runs.
// ══════════════════════════════════════════════════════════════

// Render-once guard flags + per-section filter state (each section lazily
// renders on first visit; filter state tracks the active category chip).
let cheatRendered = false, modulesRendered = false, bpRendered = false,
    libRendered = false, dcaRendered = false;
let activeBpFilter = 'ALL', activeLibFilter = 'All';
// Library filter chips, derived from the data so they never drift.
let LIB_CATS = ['All'];
// ─── core: theme, nav ───
// ══════════════════════════════════════════════
//  THEME TOGGLE
// ══════════════════════════════════════════════
function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light');
  document.getElementById('theme-btn').textContent = isLight ? '🌞' : '🌙';
  localStorage.setItem('dl-theme', isLight ? 'light' : 'dark');
}
(function(){
  const saved = localStorage.getItem('dl-theme');
  if (saved === 'light') { document.documentElement.classList.add('light'); }
})();

// ══════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.bnav-item').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  const tab = document.getElementById('tab-' + name);
  if (tab) tab.classList.add('active');
  const bnav = document.getElementById('bnav-' + name);
  if (bnav) bnav.classList.add('active');
  window.scrollTo(0, 0);
  if (name === 'cheatsheet') renderCheatsheet();
  if (name === 'learn') renderModules();
  if (name === 'bestpractices') renderBestPractices();
  if (name === 'library') renderLibrary();
  if (name === 'dca') renderDCA();
}

function showTool(name) {
  showPage('tools');
  document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));
  document.getElementById('tool-' + name).classList.add('active');
  const si = document.getElementById('sitem-' + name);
  if (si) si.classList.add('active');
}



// ─── quiz engine ───
//  QUIZ ENGINE
// ══════════════════════════════════════════════
const QUIZ_CATS = ['ALL','BASICS','DOCKERFILE','NETWORKING','STORAGE','COMPOSE','SECURITY'];
let currentQ = 0, xp = 0, answered = false, activeFilter = 'ALL', filteredQuiz = [];

function initQuizFilters() {
  const el = document.getElementById('quiz-filters');
  if (!el) return;
  el.innerHTML = QUIZ_CATS.map(c =>
    `<button class="qf-btn${c==='ALL'?' active qf-ALL':''} qf-${c}" onclick="setQuizFilter('${c}')">${c === 'ALL' ? 'All Topics' : c.charAt(0)+c.slice(1).toLowerCase()}</button>`
  ).join('');
  applyFilter();
}

function setQuizFilter(cat) {
  activeFilter = cat;
  document.querySelectorAll('.qf-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`.qf-${cat}`).forEach(b => b.classList.add('active'));
  applyFilter();
}

function applyFilter() {
  filteredQuiz = activeFilter === 'ALL' ? [...QUIZ_ALL] : QUIZ_ALL.filter(q => q.cat === activeFilter);
  // Shuffle
  for (let i = filteredQuiz.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [filteredQuiz[i], filteredQuiz[j]] = [filteredQuiz[j], filteredQuiz[i]];
  }
  currentQ = 0; xp = 0; answered = false;
  const countEl = document.getElementById('quiz-count');
  if (countEl) countEl.textContent = `${filteredQuiz.length} questions in this set`;
  if (document.getElementById('q-xp')) document.getElementById('q-xp').textContent = '⚡ 0 XP';
  document.getElementById('quiz-game').style.display = 'block';
  document.getElementById('quiz-result').style.display = 'none';
  renderQuestion();
}

function renderQuestion() {
  if (!filteredQuiz.length) return;
  const q = filteredQuiz[currentQ];
  document.getElementById('q-fill').style.width = ((currentQ + 1) / filteredQuiz.length * 100) + '%';
  document.getElementById('q-num').textContent = `Question ${currentQ + 1} / ${filteredQuiz.length}`;
  document.getElementById('q-cat').textContent = q.cat;
  document.getElementById('q-text').textContent = q.q;
  document.getElementById('q-explain').textContent = q.exp;
  document.getElementById('q-explain').classList.remove('show');
  document.getElementById('next-btn').style.display = 'none';
  answered = false;
  const keys = ['A','B','C','D'];
  document.getElementById('q-opts').innerHTML = q.opts.map((o,i) =>
    `<div class="q-opt" onclick="answerQ(this,${i===q.ans})">
      <span class="opt-key">${keys[i]}</span>${o}
    </div>`).join('');
}

function answerQ(el, correct) {
  if (answered) return;
  answered = true;
  document.querySelectorAll('.q-opt').forEach(o => o.classList.add('disabled'));
  el.classList.add(correct ? 'correct' : 'wrong');
  if (!correct) {
    const q = filteredQuiz[currentQ];
    document.querySelectorAll('.q-opt')[q.ans].classList.add('correct');
  } else {
    xp += 10;
    document.getElementById('q-xp').textContent = '⚡ ' + xp + ' XP';
  }
  document.getElementById('q-explain').classList.add('show');
  document.getElementById('next-btn').style.display = 'inline-flex';
}

function nextQuestion() {
  currentQ++;
  if (currentQ >= filteredQuiz.length) showResult();
  else renderQuestion();
}

function skipQuestion() {
  currentQ++;
  if (currentQ >= filteredQuiz.length) showResult();
  else renderQuestion();
}

function showResult() {
  document.getElementById('quiz-game').style.display = 'none';
  document.getElementById('quiz-result').style.display = 'block';
  const pct = Math.round(xp / (filteredQuiz.length * 10) * 100);
  document.getElementById('result-score').textContent = xp + ' XP';
  const label = pct >= 90 ? '🏆 Container Expert!' : pct >= 70 ? '🎯 Solid Knowledge!' : pct >= 50 ? '📚 Keep Learning!' : '🌱 Just Getting Started';
  document.getElementById('result-label').textContent = `${pct}% correct — ${label}`;
}

function restartQuiz() {
  applyFilter();
}

// ══════════════════════════════════════════════

// ─── cheatsheet render ───
function renderCheatsheet() {
  if (cheatRendered) return;
  cheatRendered = true;
  const grid = document.getElementById('cheat-grid');
  grid.innerHTML = CHEAT_DATA.map(section =>
    `<div class="cheat-card" data-cat="${section.cat}">
      <div class="cheat-cat">${section.cat}</div>
      ${section.items.map(item =>
        `<div class="cheat-item" onclick="copyCmd(this,'${item.cmd.replace(/'/g,"\\'")}')">
          <span class="cheat-cmd">${escHtml(item.cmd)}</span>
          <span class="cheat-desc">${item.desc}</span>
          <span class="copy-icon">⎘</span>
        </div>`).join('')}
    </div>`).join('');
}

function filterCheat(val) {
  renderCheatsheet();
  const q = val.toLowerCase();
  document.querySelectorAll('.cheat-item').forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(q) ? '' : 'none';
  });
  document.querySelectorAll('.cheat-card').forEach(card => {
    const visible = [...card.querySelectorAll('.cheat-item')].some(i => i.style.display !== 'none');
    card.style.display = visible ? '' : 'none';
  });
}

function copyCmd(el, cmd) {
  navigator.clipboard.writeText(cmd).catch(() => {});
  const icon = el.querySelector('.copy-icon');
  icon.textContent = '✓';
  icon.classList.add('copied-flash');
  setTimeout(() => { icon.textContent = '⎘'; icon.classList.remove('copied-flash'); }, 1500);
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════

// ─── modules render ───
function renderModules() {
  if (modulesRendered) return;
  modulesRendered = true;
  const list = document.getElementById('modules-list');
  list.innerHTML = MODULES.map((m,i) =>
    `<div class="module-card">
      <div class="module-header" onclick="toggleModule(${i})">
        <div class="mod-num" style="color:${m.color};border-color:${m.color}40;background:${m.color}18">${m.num}</div>
        <div style="flex:1">
          <div class="mod-title">${m.title}</div>
          <div class="mod-meta">${m.topics.length} topics · ${m.duration}</div>
        </div>
        <div class="mod-arrow" id="arrow-${i}">▸</div>
      </div>
      <div class="module-body" id="body-${i}">
        <ul class="topic-list">
          ${m.topics.map(t => `<li>${t}</li>`).join('')}
        </ul>
        <div class="mod-tags">${m.tags.map(t => `<span class="mod-tag">${t}</span>`).join('')}</div>
        <div style="margin-top:14px">
          <button class="btn btn-sm btn-ghost" onclick="showTool('linter')">Practice with AI Tools →</button>
        </div>
      </div>
    </div>`).join('');
}

function toggleModule(i) {
  const body = document.getElementById('body-' + i);
  const arrow = document.getElementById('arrow-' + i);
  const open = body.classList.toggle('open');
  arrow.style.transform = open ? 'rotate(90deg)' : '';
  arrow.style.transition = '.3s';
}

// ══════════════════════════════════════════════

// ─── best practices render ───
function renderBestPractices() {
  if (bpRendered) return;
  bpRendered = true;
  const cats = ['ALL', ...BP_DATA.map(b => b.cat)];
  document.getElementById('bp-filters').innerHTML = cats.map(c =>
    `<button class="bp-filter${c==='ALL'?' active':''}" onclick="filterBP('${c}')">${c==='ALL'?'All Categories':c}</button>`
  ).join('');
  renderBPCards();
}

function filterBP(cat) {
  activeBpFilter = cat;
  document.querySelectorAll('.bp-filter').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderBPCards();
}

function renderBPCards() {
  const filtered = activeBpFilter === 'ALL' ? BP_DATA : BP_DATA.filter(b => b.cat === activeBpFilter);
  const sevLabel = {critical:'Critical',important:'Important',recommended:'Recommended'};
  const sevClass = {critical:'sev-critical',important:'sev-important',recommended:'sev-recommended'};
  const dotColor = {critical:'var(--red)',important:'var(--orange)',recommended:'var(--blue-l)'};
  document.getElementById('bp-grid').innerHTML = filtered.map((section, si) =>
    `<div class="bp-card">
      <div class="bp-card-top" onclick="toggleBP(${si})">
        <div class="bp-icon" style="background:${section.color}">${section.icon}</div>
        <div class="bp-info">
          <div class="bp-title">${section.cat}</div>
          <div class="bp-meta">${section.rules.length} rules · ${section.rules.filter(r=>r.sev==='critical').length} critical</div>
        </div>
        <div class="mod-arrow" id="bparrow-${si}">▸</div>
      </div>
      <div class="bp-body open" id="bpbody-${si}">
        ${section.rules.map(r => `
          <div class="bp-rule">
            <div class="bp-dot" style="background:${dotColor[r.sev]}"></div>
            <div class="bp-rule-text">${r.text}</div>
            <span class="bp-severity ${sevClass[r.sev]}">${sevLabel[r.sev]}</span>
          </div>`).join('')}
      </div>
    </div>`).join('');
}

function toggleBP(i) {
  const body = document.getElementById('bpbody-' + i);
  const arrow = document.getElementById('bparrow-' + i);
  const open = body.classList.toggle('open');
  arrow.style.transform = open ? 'rotate(90deg)' : '';
  arrow.style.transition = '.3s';
}

// ══════════════════════════════════════════════

// ─── library render ───
function renderLibrary() {
  if (!libRendered) {
    libRendered = true;
    document.getElementById('lib-filters').innerHTML = LIB_CATS.map(c =>
      `<button class="lib-filter${c==='All'?' active':''}" onclick="filterLib('${c}')">${c}</button>`
    ).join('');
  }
  renderLibCards();
}

function filterLib(cat) {
  activeLibFilter = cat;
  document.querySelectorAll('.lib-filter').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderLibCards();
}

function renderLibCards() {
  const filtered = activeLibFilter === 'All' ? LIBRARY : LIBRARY.filter(l => l.category === activeLibFilter);
  document.getElementById('lib-grid').innerHTML = filtered.map((item, i) => {
    const highlighted = item.code
      .replace(/(FROM|RUN|COPY|WORKDIR|ENV|USER|EXPOSE|ENTRYPOINT|CMD|HEALTHCHECK|ARG|LABEL|SHELL|ADD|AS)/g, '<span class="df-kw">$1</span>')
      .replace(/(#[^\n]*)/g, '<span class="df-cmt">$1</span>')
      .replace(/"([^"]+)"/g, '<span class="df-str">"$1"</span>');
    return `<div class="lib-card">
      <div class="lib-card-top">
        <span class="lib-lang-badge" style="background:${item.bg};color:${item.color}">${item.lang}</span>
        <div style="flex:1">
          <div class="lib-card-title">${item.title}</div>
          <div class="lib-card-meta">Final size: ${item.size}</div>
          <div class="lib-tags">${item.tags.map(t=>`<span class="lib-tag">${t}</span>`).join('')}</div>
        </div>
      </div>
      <div class="lib-code-wrap">
        <pre class="lib-code" id="libcode-${i}">${highlighted}</pre>
        <button class="lib-copy-btn" onclick="copyLibCode(${i})">⎘ Copy</button>
      </div>
      <div class="lib-notes">${item.notes}</div>
    </div>`;
  }).join('');
}

function copyLibCode(i) {
  const el = document.getElementById('libcode-' + i);
  const text = el.innerText || el.textContent;
  navigator.clipboard.writeText(text).catch(()=>{});
  const btn = el.parentElement.querySelector('.lib-copy-btn');
  btn.textContent = '✓ Copied!';
  setTimeout(() => btn.textContent = '⎘ Copy', 1800);
}

// ══════════════════════════════════════════════

// ─── dca render ───
function renderDCA() {
  if (dcaRendered) return;
  dcaRendered = true;
  document.getElementById('dca-domains').innerHTML = DCA_DOMAINS.map((d, i) => `
    <div class="dca-domain">
      <div class="dca-domain-top" onclick="toggleDCA(${i})">
        <div class="dca-domain-num" style="background:${d.bg};color:${d.color}">${d.num}</div>
        <div class="dca-domain-info">
          <div class="dca-domain-title">${d.title}</div>
          <div class="dca-domain-pct">${d.pct}% of exam · ${d.topics.length} objectives</div>
        </div>
        <div class="mod-arrow" id="dcaarrow-${i}">▸</div>
      </div>
      <div class="dca-pct-bar"><div class="dca-pct-fill" style="width:${d.pct*4}%;background:${d.color}"></div></div>
      <div class="dca-domain-body" id="dcabody-${i}">
        <ul class="dca-topic-list">
          ${d.topics.map(t => `<li>${t}</li>`).join('')}
        </ul>
        <div style="margin-top:10px">
          <button class="btn btn-sm btn-ghost" onclick="showPage('quiz')">Practice quiz →</button>
        </div>
      </div>
    </div>`).join('');
}

function toggleDCA(i) {
  const body = document.getElementById('dcabody-' + i);
  const arrow = document.getElementById('dcaarrow-' + i);
  const open = body.classList.toggle('open');
  arrow.style.transform = open ? 'rotate(90deg)' : '';
  arrow.style.transition = '.3s';
}

// ══════════════════════════════════════════════
//  INIT — called by js/data.js once datasets are loaded
// ══════════════════════════════════════════════
window.initDockerLab = function initDockerLab() {
  // Derive library filter categories from the loaded data.
  LIB_CATS = ['All', ...Array.from(new Set((window.LIBRARY || []).map(l => l.category)))];

  initQuizFilters();          // needs QUIZ_ALL

  // Scroll reveal
  const observer = new IntersectionObserver(entries =>
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
    { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
};

// Theme icon can be applied immediately (no data needed)
(function(){
  const btn = document.getElementById('theme-btn');
  if (btn && document.documentElement.classList.contains('light')) btn.textContent = '🌞';
})();