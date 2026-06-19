
|---|---|
| 🔍 **Dockerfile Linter** | Scores your Dockerfile, lists errors/warnings with severity, outputs a fixed version |
| 📖 **Dockerfile Explainer** | Line-by-line breakdown of any Dockerfile instruction |
| 🎼 **Compose Explainer** | Full analysis of docker-compose.yaml — services, networking, dependencies |
| 🛠️ **Dockerfile Generator** | Pick language + environment, describe your app → production-ready Dockerfile |
| 📉 **Image Optimizer** | Size reduction recommendations + optimized Dockerfile with estimated savings |
| 🐛 **Error Troubleshooter** | Paste any docker error → root cause analysis + step-by-step fix |
| 🔒 **Security Auditor** | Security score out of 10, issues by severity, hardened Dockerfile |
| 🌐 **Network Explainer** | Clear answers to any Docker networking question with examples |

### 🧠 100-Question Quiz
- 100 questions across 6 categories: Basics, Dockerfile, Networking, Storage, Compose, Security
- **Topic filter** — drill into a specific domain or practice all at once
- Questions shuffle randomly on every session
- XP tracking (10 XP per correct answer) with performance label at the end
- Instant feedback with correct/wrong highlighting and detailed explanations

### ⌘ Cheatsheet — 150+ Commands
- 10 categories: Container Basics, Management, Exec & Inspect, Images, Registry, Volumes, Networking, Cleanup, Compose, Debugging
- Live search filter across all commands
- Click-to-copy with visual flash feedback

### 📂 Real-World Dockerfile Library
Production-ready, copy-paste Dockerfiles for 8 popular stacks:

| Stack | Final Size | Key Techniques |
|---|---|---|
| **Node.js** (Express API) | ~45MB | Multi-stage, alpine, dumb-init, healthcheck |
| **Python** (FastAPI/Django) | ~160MB | Virtualenv, slim, non-root |
| **Go** (REST API) | ~12MB | FROM scratch, static binary, CGO_ENABLED=0 |
| **Next.js** (standalone) | ~180MB | Standalone output, node user |
| **Java** (Spring Boot) | ~220MB | Layered JAR, JRE-only final stage |
| **Rust** (Axum API) | ~15MB | cargo-chef, distroless, musl target |
| **PHP** (Laravel) | ~500MB | PHP-FPM, Composer, OPcache |
| **React** (Vite + Nginx) | ~25MB | Static build, SPA routing, gzip |

Each Dockerfile includes syntax highlighting, a click-to-copy button, and notes explaining the key decisions.

### ✅ Best Practices Guide — 60+ Rules
- 6 categories: Image & Dockerfile, Security, Networking, Storage, Compose, Performance & CI/CD
- Severity levels: Critical · Important · Recommended
- Category filter to focus on a specific area
- All cards expandable/collapsible

### 🏅 DCA Cert Prep Guide
Complete study guide for the **Docker Certified Associate** exam:
- Exam overview: 55 questions, 90 minutes, ≥65% to pass
- All **6 official exam domains** with percentage weighting and every learning objective
- Study tips and exam strategy
- Curated resources: official exam page, Docker docs, Play With Docker, community guides

### 📚 10 Learning Modules
Structured curriculum from zero to production:

1. Container Fundamentals
2. Writing Your First Dockerfile
3. Image Optimization
4. Docker Networking
5. Volumes & Persistent Storage
6. Docker Compose
7. Container Security
8. Registry & Image Distribution
9. CI/CD with Docker
10. Production Patterns & Kubernetes

### 🌙 Theme Toggle
Dark (terminal) and light mode with system-preference detection. Preference saved to localStorage.

### 📱 Mobile-First Design
- Fixed **bottom navigation bar** on mobile — Tools, Quiz, Cheatsheet, Library, DCA, Guides
- Collapses top nav on small screens
- Respects iOS safe-area-inset for notched devices

---

## 🚀 Getting Started

### Option 1 — Use it live
Visit [docker.eknathalabs.com](https://docker.eknathalabs.com) — no signup, no install.


---

## 🏗️ Architecture

This is a **zero-dependency, single-file web app**. No framework, no bundler, no backend.

```
index.html
├── CSS
│   ├── Custom properties (dark + light theme)
│   ├── Responsive layout with mobile bottom nav
│   └── Component styles for all 8 pages
├── HTML — 8 pages: Home, Tools, Quiz, Cheatsheet, Learn,
│          Best Practices, Dockerfile Library, DCA Prep
└── JavaScript
    ├── Navigation      — Page switching, bottom nav sync, tab highlight
    ├── Theme toggle    — Dark/light with localStorage persistence
    ├── Claude API      — fetch() calls to Anthropic /v1/messages
    ├── Quiz Engine     — 100 Q, topic filter, shuffle, XP tracking
    ├── Cheatsheet      — Dynamic render, live search, clipboard copy
    ├── Dockerfile Lib  — 8 stacks, syntax highlighting, copy button
    ├── DCA Guide       — Domain accordion, progress bars, resources
    ├── Best Practices  — Category filter, severity badges, accordion
    └── Modules         — Accordion expand/collapse, topic lists
```

### AI Integration
All 8 tools call the Anthropic Claude API directly from the browser:

```javascript
const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }]
  })
});
```

Each tool has a carefully crafted prompt that instructs the model to return structured, severity-labelled output rendered as HTML.

---

## 📁 Project Structure

```
docker-eknathalabs/
├── index.html          # Everything — single file app
├── README.md           # This file
└── LICENSE             # MIT
```

---

## 🎨 Design

- **Theme** — Dark terminal aesthetic + light mode toggle. Docker blue (`#1D63ED`) and orange (`#F7941D`) accents
- **Fonts** — IBM Plex Mono (code/body) + Syne (display/headings)
- **Background** — Subtle 48px grid overlay with radial blue glow on hero
- **Animations** — Fade-up on load, blinking cursor, bouncing whale emoji, scroll reveal
- **Responsive** — Mobile bottom nav, collapses sidebar on small screens, safe-area insets

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript (no framework) |
| AI | Anthropic Claude API (`claude-sonnet-4-20250514`) |
| Fonts | Google Fonts (IBM Plex Mono, Syne) |
| Hosting | GitHub Pages / Custom domain |
| Build | None — zero build step |

---

## 🔗 EknathaLabs Ecosystem

DockerLab is part of a growing suite of free Platform Engineering learning tools:

| Tool | URL | Focus |
|---|---|---|
| 🐳 **DockerLab** | [docker.eknathalabs.com](https://docker.eknathalabs.com) | Container engineering |
| ☸️ **KubeLab** | [kubelab.eknathalabs.com](https://kubelab.eknathalabs.com) | Kubernetes / CKA prep |
| 🏗️ **Terraform Mission Control** | [terraform.eknathalabs.com](https://terraform.eknathalabs.com) | IaC / Terraform gamified |
| 🐧 **Linux Lab** | [linux.eknathalabs.com](https://linux.eknathalabs.com) | Linux fundamentals |
| 🐧 **Linux Command Explainer** | [eknatha.github.io/linux-command-explainer](https://eknatha.github.io/linux-command-explainer/) | CLI explainer |
| 💼 **Interview Prep** | [eknatha.github.io/interview-prep](https://eknatha.github.io/interview-prep/) | DevOps interviews |
| 📄 **Resumelytics** | [eknatha.github.io/resumelytics](https://eknatha.github.io/resumelytics/) | Resume analyzer |
| 🐙 **GitHub Profile Analyzer** | [eknatha.github.io/github-profile-analyzer](https://eknatha.github.io/github-profile-analyzer/) | GitHub stats |

---

## 🤝 Contributing

Contributions are welcome! Here's how:

```bash
# 1. Fork the repo
# 2. Create a feature branch
git checkout -b feature/add-docker-swarm-module

# 3. Make your changes to index.html
# 4. Test locally by opening in browser
open index.html

# 5. Submit a PR with a clear description
```

### Ideas for contribution
- Add more quiz questions (target: 150+)
- Add more Dockerfile examples to the library (Ruby, Elixir, Bun, Deno)
- Add more cheatsheet commands
- Add new learning modules (Docker Swarm, BuildKit advanced)
- Add keyboard shortcuts for quiz (A/B/C/D keys)
- Add `docker run → compose` converter tool
- Add daily challenge + streak tracker
- Add shareable quiz result card

---

## 📄 License

MIT License — free to use, modify, and distribute. See [LICENSE](LICENSE) for details.

---

## 👤 Author

Built by **Eknatha Reddy** — Engineer

- 🌐 [eknathalabs.com](https://eknathalabs.com)
- 🐙 [github.com/eknatha](https://github.com/eknatha)

---

<p align="center">
  <strong>Free · No signup · Built by a Platform Engineer</strong><br>
  <a href="https://docker.eknathalabs.com">docker.eknathalabs.com</a>
</p>
