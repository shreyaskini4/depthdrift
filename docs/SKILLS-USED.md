# Skills Inventory & Usage for Drift UI Polish

This document inventories every skill available in the Drift workspace (`d:\projects\particle effects`), global configuration, built-in Antigravity skills, and installed plugins, noting when each applies and highlighting those relevant to Drift's end-to-end UI polish.

---

## 1. Relevant Skills for Drift UI Polish

| Skill | Location | Relevance & Application |
| --- | --- | --- |
| **unslop** | `.agent/skills/unslop/SKILL.md` (mirrored at `.agents/skills/unslop/SKILL.md`) | **Primary.** Audits AI-slop tells (neon cyan/blue washes, glows, heavy weights, tracking, off-grid spacing, looping motion, all-caps) and drives the 9-pass polish (`Spacing`, `Color`, `Icons`, `Copy`, `Type`, `Layout`, `Details`, `Visuals`, `Motion`). |
| **web-design-guidelines** | `C:\Users\shrey\.gemini\config\skills\web-design-guidelines\SKILL.md` | **Primary.** Audits layout & 4px/8px spacing, single primary CTA per view, WCAG AA contrast (4.5:1 / 3:1), touch targets (24x24px min, 44x44px touch), `:focus-visible` outlines, `aria-label` on icon buttons, and async state coverage (loading, empty, error, success). |
| **design-critique** | `C:\Users\shrey\.gemini\config\skills\design-critique\SKILL.md` | **Primary.** Evaluates 2-second first impression, visual hierarchy & scan flow, cognitive load, typography & spacing rhythm, and affordance/usability. |
| **design-design-critique** | `C:\Users\shrey\.gemini\config\skills\design-design-critique\SKILL.md` | **Supporting.** Structured design feedback on usability, hierarchy, and consistency for mockups and UI layouts. |
| **a11y-debugging** | `C:\Users\shrey\.gemini\config\plugins\chrome-devtools-plugin\skills\a11y-debugging\SKILL.md` | **Primary.** Accessibility tree vs. DOM visibility, heading hierarchy, orphaned form inputs, keyboard focus/traps, tap target sizing, and color contrast checks. |
| **review-animations** | `C:\Users\shrey\.gemini\config\skills\review-animations\SKILL.md` | **Primary.** Audits motion justification, 150–300ms micro-interaction durations, snappy deceleration easing, GPU-only properties (`transform`, `opacity`), `prefers-reduced-motion`, and `visibilitychange` pausing. |
| **verification-before-completion** | `C:\Users\shrey\.gemini\config\skills\verification-before-completion\SKILL.md` | **Primary.** Requires running build, lint, tests, and visual verification across viewports before claiming any polish pass is complete. |

---

## 2. Complete Workspace & Global Skill Catalog

### Workspace Skills (`.agent/skills`, `.agents/skills`)
- **unslop** (`.agent/skills/unslop`, `.agents/skills/unslop`): Turns vibecoded UI into a designed interface with its own character across 9 ordered passes. *(Relevant — Primary)*

### Global Skills (`C:\Users\shrey\.gemini\config\skills`)
- **brainstorming**: Interactive design exploration before creating features or modifying behavior. *(Use before major new feature design)*
- **codeql**: Interprocedural dataflow and taint analysis SAST scanning via CodeQL. *(Security scanning)*
- **context7**: Fetch up-to-date library and framework documentation. *(Use when checking Three.js / ONNX Runtime Web APIs)*
- **dependency-audit**: Audit project dependencies and lockfiles for CVEs and supply-chain risks. *(Security audit)*
- **design-critique**: Structured visual critique across 5 heuristic lenses. *(Relevant — Primary)*
- **design-design-critique**: Structured design feedback on usability, hierarchy, and consistency. *(Relevant — Supporting)*
- **diagnosing-superpowers**: Diagnose why an agent session went wrong or stalled. *(Meta-debugging)*
- **differential-review**: Security-focused differential review of commits/PRs with blast-radius analysis. *(Code review)*
- **dispatching-parallel-agents**: Coordinate 2+ independent tasks without shared state. *(Orchestration)*
- **executing-plans**: Inline execution of an implementation plan. *(Execution)*
- **finishing-a-development-branch**: Integration checklist after implementation and tests pass. *(Git workflow)*
- **owasp-audit**: Audit source code against OWASP Top 10:2025 categories. *(Security audit)*
- **receiving-code-review**: Technical rigor and verification when addressing code review feedback. *(Review)*
- **requesting-code-review**: Pre-merge verification and review request workflow. *(Review)*
- **review-animations**: Strict motion design reviewer for CSS/JS transitions and `prefers-reduced-motion`. *(Relevant — Primary)*
- **sarif-parsing**: Parse, filter, and deduplicate SARIF static analysis output. *(Security tooling)*
- **secrets-audit**: Scan source code and git history for leaked credentials. *(Security audit)*
- **semgrep**: Run Semgrep SAST rulesets across a codebase. *(Security scanning)*
- **shadcn-ui**: Best practices for shadcn/ui, Radix UI, and Tailwind CSS. *(Not applicable — Drift uses vanilla TypeScript + CSS)*
- **subagent-driven-development**: Execute implementation plans via subagents. *(Orchestration)*
- **systematic-debugging**: Root-cause investigation before proposing fixes for bugs or test failures. *(Debugging)*
- **test-driven-development**: Write failing tests before implementation code. *(Testing)*
- **using-git-worktrees**: Isolate feature work via git worktrees. *(Git workflow)*
- **using-superpowers**: Establish skill discovery and invocation discipline at session start. *(Session workflow)*
- **vercel-react-best-practices**: React/Next.js performance optimization. *(Not applicable — Drift is vanilla TS + Three.js)*
- **verification-before-completion**: Run verification commands and confirm output before claiming completion. *(Relevant — Primary)*
- **web-design-guidelines**: Audit UI against Vercel Web Interface Guidelines (layout, contrast, a11y, async states). *(Relevant — Primary)*
- **writing-plans**: Author multi-step implementation plans from specs. *(Planning)*
- **writing-skills**: Create, edit, and verify `SKILL.md` files. *(Skill authoring)*

### Built-in Antigravity Skills (`C:\Users\shrey\.gemini\antigravity\builtin\skills`)
- **agy-customizations**: Guide to Antigravity customization discovery, priority, skills, rules, plugins, hooks, and MCP servers. *(System reference)*
- **antigravity_guide**: Comprehensive guide for Google Antigravity IDE, CLI, and Python SDK. *(System reference)*
- **automation**: Design and create scheduled background automations. *(Scheduling)*
- **conversations**: Manage local Antigravity conversations over HTTP+JSON. *(Conversation management)*
- **generative_ui**: Render rich interactive HTML widgets inline or as artifacts. *(UI widgets)*
- **mcp-app-development**: Build, package, and debug MCP Apps with interactive UI. *(MCP UI)*
- **migrate-agent-settings**: Migrate configs from Claude Code/Codex/Cursor/Gemini CLI into an Antigravity plugin. *(Migration)*
- **migrate-workflows**: Migrate legacy workflows to modern `SKILL.md` skills. *(Migration)*
- **native_swarm**: Coordinate native swarm workers on a shared board. *(Swarm orchestration)*
- **permissioned-github**: Permissioned GitHub operations. *(GitHub)*
- **plugin**: Manage, install, or author Antigravity plugins. *(Plugin management)*
- **run-workflow**: Write and execute Python workflow scripts via `run_workflow`. *(Workflow orchestration)*
- **swarm_monitor**: Monitor native swarm workers for stalls. *(Swarm internal)*
- **swarm_narrator**: Narrate swarm progress. *(Swarm internal)*
- **swarm_pane**: Maintain Swarm UI overview and timeline. *(Swarm internal)*
- **ui-plugin-navigation**: Surface one-click pills to open UI plugin panels. *(Plugin UI)*

### Plugin Skills (`C:\Users\shrey\.gemini\config\plugins`)
- **a11y-debugging** (`chrome-devtools-plugin`): Accessibility debugging via Chrome DevTools (ARIA, focus, tap targets, contrast). *(Relevant — Primary)*
- **chrome-devtools** (`chrome-devtools-plugin`): Browser automation, performance analysis, and network inspection via Chrome DevTools MCP. *(Relevant — Supporting)*
- **cookie-debugging** (`chrome-devtools-plugin`): Inspect/debug cookies and session auth state. *(Auth/cookies)*
- **debug-optimize-lcp** (`chrome-devtools-plugin`): Debug and optimize Largest Contentful Paint. *(Web perf)*
- **memory-leak-debugging** (`chrome-devtools-plugin`): Capture and compare heap snapshots for JS memory leaks. *(Memory perf)*
- **troubleshooting** (`chrome-devtools-plugin`): Troubleshoot Chrome DevTools MCP connection/target issues. *(DevTools debugging)*
- **gemini-api-dev** (`gemini-api`): Write code calling the Gemini API (`google-genai` / `@google/genai`). *(Gemini SDK)*
- **gemini-live-api-dev** (`gemini-api`): Build real-time WebSocket streaming apps with Gemini Live API. *(Gemini Live)*
- **gemini-omni-flash-api** (`gemini-api`): Generative video editing and generation via Gemini Omni 1.2 Flash. *(Gemini Video)*
