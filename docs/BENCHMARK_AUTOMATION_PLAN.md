# AI-SDLC Benchmark Automation Plan

## Purpose

Define an automated benchmark system to tune the ai-sdlc harness safely and continuously.

Primary goals:
- Detect regressions in workflow quality before merge
- Compare providers/config variants with objective metrics
- Create a repeatable tuning loop for prompts, policies, and orchestration logic

---

## Principles

1. **Harness-first evaluation**
   - Measure end-to-end workflow outcomes (story → artifacts → tests), not just model outputs.

2. **Objective gates over subjective scoring**
   - Use deterministic checks as hard pass/fail gates (tests/build/required artifacts).
   - Use LLM grading only as a secondary, advisory metric.

3. **Isolation and reproducibility**
   - Every benchmark case runs in an isolated temp workspace/worktree.
   - Inputs, config, provider, and commit SHA are captured for replay.

4. **Baseline-driven tuning**
   - Always compare candidate runs against a pinned baseline.
   - Changes only accepted when metrics improve or remain within tolerances.

---

## Benchmark Scope

## 1) Story Corpus

Create a representative benchmark suite at `benchmarks/stories/`.

Target initial size: **20-50 stories** across categories:
- Feature implementation
- Bug fixes
- Refactors
- Configuration/infrastructure changes
- Security-sensitive changes
- Test-focused stories

Each story should include:
- `story.md` (input prompt/frontmatter)
- `fixture/` (minimal repo fixture or pointers)
- `expectations.yaml` (required checks and scoring weights)

## 2) Evaluation Dimensions

For each story/run, record:
- **Success metrics**
  - tests passed
  - build passed
  - required files changed
  - forbidden patterns absent
- **Efficiency metrics**
  - wall-clock duration
  - retries/iterations
  - token usage and estimated cost
- **Quality metrics**
  - lint/static-analysis delta
  - defect indicators
  - review concerns severity counts
- **Stability metrics**
  - flaky outcomes across repeated runs
  - variance in cost/time/success

---

## Proposed Directory Structure

```text
benchmarks/
  stories/
    S-B001-auth-bugfix/
      story.md
      expectations.yaml
      fixture/
    S-B002-config-hardening/
      story.md
      expectations.yaml
      fixture/
  configs/
    baseline.json
    candidate-*.json
  scripts/
    run-benchmark.ts
    score-run.ts
    compare-runs.ts
  results/
    YYYYMMDD-HHMMSS-run-id/
      metadata.json
      per-story.jsonl
      summary.json
      artifacts/
```

---

## Execution Architecture

## 1) Runner

`benchmarks/scripts/run-benchmark.ts` (or Python equivalent) should:
1. Load benchmark story list and experiment matrix
2. For each story:
   - create isolated temp copy/worktree
   - inject selected ai-sdlc config/provider
   - run `ai-sdlc run --auto --story <id>`
   - run validation commands (test/build/lint/assertions)
3. Capture structured outputs:
   - timing
   - exit codes
   - logs
   - diff stats
   - token/cost if available

## 2) Scoring

`score-run` computes:
- Hard gate pass/fail
- Composite score (weighted soft metrics)

Suggested hard gates:
- tests pass
- build passes
- no forbidden files touched
- required artifact(s) present

Suggested soft score example:
- 40% quality
- 30% reliability
- 20% efficiency
- 10% cost

## 3) Comparison

`compare-runs` evaluates candidate vs baseline with thresholds.

Default regression thresholds (starting point):
- success rate drop > 5% → fail
- average cost increase > 15% → fail
- average runtime increase > 20% → fail
- quality score drop > 0.05 → fail

---

## Experiment Matrix

Tune by sweeping controlled variables:
- Provider (`codex`, `claude`, etc.)
- Model
- Workflow variant (`workflow.yaml` options)
- Retry and timeout settings
- TDD mode and stage-gate strictness

Each run should include immutable metadata:
- run_id
- git_sha
- config_hash
- provider/model
- timestamp
- host/runtime version

---

## CI/CD Integration Plan

## 1) PR (Fast Smoke Benchmark)

On pull requests:
- Run a **small smoke subset** (e.g., 5 representative stories).
- Block merge on hard-gate failures or major regressions.

## 2) Nightly (Full Benchmark)

On schedule:
- Run full benchmark suite.
- Publish summary artifact and trend report.
- Notify if regression thresholds are exceeded.

## 3) Baseline Promotion

Only promote a new baseline when:
- N consecutive nightly runs are stable
- no threshold regressions
- no increase in flaky cases beyond tolerance

---

## Tuning Workflow

1. Detect regression from CI/nightly
2. Inspect top failing/regressing stories
3. Apply focused harness change (prompt/policy/orchestration/config)
4. Re-run impacted subset
5. Re-run full benchmark before merge
6. Record decision and rationale in changelog/release notes

---

## Reporting

Per run outputs:
- `summary.json`
- `per-story.jsonl`
- human-readable markdown report

Report should include:
- pass rate
- median/95p runtime
- avg cost/story
- retry counts
- top regressions (story IDs + failure reasons)
- top improvements

---

## Risks & Mitigations

- **Flakiness from nondeterministic model behavior**
  - Mitigation: repeat-run sampling for critical stories; track variance

- **Cost blowups during experiments**
  - Mitigation: per-run cost budget + hard stop

- **Overfitting to benchmark stories**
  - Mitigation: rotate/add unseen holdout stories quarterly

- **Slow benchmark runtime**
  - Mitigation: smoke vs nightly split; parallel execution with isolated worktrees

---

## Phased Rollout

## Phase 1: Foundation (Week 1)
- Create corpus format (`story.md`, `expectations.yaml`)
- Implement basic runner + hard-gate checks
- Produce JSON summary artifacts

Exit criteria:
- can run benchmark suite locally and get deterministic pass/fail report

## Phase 2: CI + Baseline (Week 2)
- Add PR smoke benchmark in GitHub Actions
- Add nightly full benchmark
- Add baseline comparison and regression thresholds

Exit criteria:
- PRs blocked on regressions; nightly trend reports available

## Phase 3: Tuning Intelligence (Week 3+)
- Add cost/time trend tracking
- Add flake detection and variance metrics
- Add automated "top regressions" diagnostics

Exit criteria:
- benchmark system actively drives harness tuning decisions

---

## Immediate Next Steps

1. Create `benchmarks/` scaffolding and seed 10 initial stories.
2. Define `expectations.yaml` schema for hard gates and score weights.
3. Implement MVP runner that executes stories and validates test/build outcomes.
4. Add PR smoke benchmark workflow.
5. Add nightly full benchmark + baseline compare script.

This gives ai-sdlc a practical, automated feedback loop to improve quality, speed, and cost without sacrificing guardrails.
