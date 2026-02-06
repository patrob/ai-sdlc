# AI-SDLC Product Roadmap

## Phase 1: Stabilize Core ✅

Goal: Make existing stages production-quality for external users.

| Item | Status | Description |
|------|--------|-------------|
| 1.1 Decompose Large Modules | Deferred | Split implementation.ts (61KB), review.ts (83KB), commands.ts (135KB) |
| 1.2 Cost & Duration Tracking | ✅ Done | `CostTracker`, `TokenUsage`, `ProviderQueryResult`, `CostLimitConfig` |
| 1.3 Structured Event System | ✅ Done | `EventBus`, `SDLCEvent` types, Console/File subscribers, wired into PhaseExecutor + runner |
| 1.4 Pluggable Error Classification | ✅ Done | `IErrorClassifier` interface, Python/Go/Rust classifiers, `ErrorClassifierRegistry` |
| 1.5 Mock/Dry-Run Provider | ✅ Done | `MockProvider` with response queue/factory/recording, `DryRunProvider` |
| 1.6 Integration Test Suite | Deferred | E2E tests with mock provider for cost-free CI |

---

## Phase 2: Close the Loop

Goal: Complete the cycle from story to merged code with human-in-the-loop infrastructure.

### 2.1 PR Merge Stage

**Foundation exists:** `MergeConfig` type, `MergeStrategy`, `DEFAULT_MERGE_CONFIG`, `validateMergeConfig()`, `createPullRequest()`, `gh-cli.ts`

**To build:**
- New `src/agents/merge.ts`: Merge agent that polls `gh pr checks`, auto-merges on all-green
- Add `merge` to `ActionType` union
- Add `merge` case to `executeAction()` in runner
- Wire into kanban state assessor (recommend merge after PR created)
- Handle: flaky checks (retry vs fail), branch protection, merge conflicts, rate limiting
- MVP: Poll checks → auto-merge on green → fail on timeout → emit events
- Full: Conflict detection, auto-rebase, approval workflows, branch cleanup

### 2.2 Human-in-the-Loop Infrastructure

**Foundation exists:** `blocked` status, `moveToBlocked()`, `unblock` command, stage gates

**To build:**
- New `src/core/notification.ts`: `NotificationChannel` interface, Console/File channels
- New `NotificationConfig` type
- `ai-sdlc approve <story-id>` — approve blocked story and resume
- `ai-sdlc feedback <story-id> "message"` — add feedback, restart from appropriate phase
- Story state: `blocked_awaiting_human` with structured context
- Emit events via EventBus when human action needed
- MVP: Console + file notifications, manual approve/feedback commands
- Full: Slack/Teams/email, web dashboard, approval workflows

### 2.3 Smarter Ideation

**Foundation exists:** `createStory()`, `add` command, `IProvider` abstraction

**To build:**
- Enhance `add` command: AI-generated acceptance criteria with `--ai` flag
- New `src/agents/ideation.ts`: AI-powered story refinement during creation
- Story decomposition: detect large stories, suggest splits
- Backlog dedup: compare new story against existing stories
- MVP: AI-assisted AC generation during `add`
- Full: Auto-decomposition, dedup, priority suggestions

---

## Phase 3: Autonomous Operations

Goal: Enable continuous operation with minimal human oversight.

### 3.1 Monitoring / Self-Healing Loop
- New `src/agents/monitor.ts`: watch deployed apps for errors
- Configurable log sources (stdout, files, cloud logging APIs)
- Pattern detection: error rate spikes, new exceptions, perf degradation
- Auto-create bug stories linked to deployment/commit/log evidence
- MVP: File/stdout log watching with regex patterns, manual trigger for story creation
- Full: Cloud log integration (CloudWatch, Datadog), anomaly detection

### 3.2 Exploration / Bug Bounty
- New `src/agents/explorer.ts`: Playwright-based app interaction
- Auto-detect start command (leveraging CommandDiscovery)
- UX analysis: accessibility, performance, screenshot comparison
- Generate stories with reproduction steps
- MVP: Start app, hit known routes, report HTTP/console errors
- Full: AI-guided exploration, visual regression, accessibility audits

### 3.3 Feedback Integration
- New `src/agents/feedback.ts`: ingest user feedback from multiple sources
- Channels: GitHub Issues, email, in-app widgets, Slack
- Prompt injection defense for external input
- Story generation with auto-triage (bug vs feature vs enhancement)
- MVP: GitHub Issues as source, AI-assisted triage with human approval gate
- Full: Multi-channel, auto-triage, sentiment analysis

### 3.4 Daemon Evolution
- Extend `src/cli/daemon.ts`
- Health monitoring endpoint, graceful degradation
- Story prioritization beyond FIFO
- Multi-story concurrent processing

---

## Phase 4: Intelligence Layer

Goal: Build learning, optimization, and cross-project intelligence.

### 4.1 Knowledge Base / Codebase Memory
- Persist research findings, coding patterns across stories
- `.ai-sdlc/knowledge/` directory, evolve to vector store
- Shared across all agents to reduce redundant analysis

### 4.2 Cost Optimization Engine
- Model routing: cheap models for simple tasks, expensive for complex
- Context compression, response caching
- Per-story budgets with automatic model downgrading

### 4.3 Quality Metrics & Learning
- Track success rates per stage, story type, tech stack
- Adapt prompts/strategies based on historical outcomes
- "Team health" reporting

### 4.4 Multi-Repo & Monorepo Support
- `ProjectConfig` already supports monorepo paths
- Multi-repo workspace concept with cross-repo stories
- Coordinated PRs across repos

---

## Cross-Cutting Concerns

### Tech Stack Independence
- Stack detector (13+), command discovery, provider abstraction (solid)
- Error classification now pluggable (Phase 1.4 ✅)
- Validation: Run full pipeline on Python project E2E

### Safety & Guardrails
- Existing: Circuit breakers, error fingerprinting, input sanitization, path traversal prevention
- Needed: Sandboxed execution, mandatory human gates for destructive ops, cost ceilings, prompt injection defense, audit logging

### Observability
- Existing: StoryLogger, per-story logs, --verbose mode
- Cost tracking now available (Phase 1.2 ✅)
- Event stream now available (Phase 1.3 ✅)
- Future: OpenTelemetry integration, dashboard

### Human-in-the-Loop
- Existing: Stage gates, unblock command, --step, --continue
- Phase 2.2 adds notification system, approve/reject/feedback commands

---

## Key Architecture Files

| File | Role |
|------|------|
| `src/providers/types.ts` | Provider abstraction with cost tracking |
| `src/agents/implementation.ts` | Largest agent (61KB) — decompose target |
| `src/agents/review.ts` | Second largest (83KB) — decompose target |
| `src/core/phase-executor.ts` | Agent orchestration engine |
| `src/cli/runner.ts` | Workflow sequencer — `executeAction()` |
| `src/core/config.ts` | Config patterns (`DEFAULT_*` + `validate*`) |
| `src/types/index.ts` | Core types including `MergeConfig` |
| `src/core/stack-detector.ts` | Stack detection for tech independence |
| `src/core/command-discovery.ts` | Build/test/lint command auto-detection |
| `src/services/error-classifier-types.ts` | Pluggable error classification |
| `src/core/cost-tracker.ts` | Token usage accumulation + limits |
| `src/core/event-bus.ts` | Structured event system |
