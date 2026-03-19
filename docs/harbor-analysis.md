# Agent Evaluation & Trace Standards — Research for TaskForest

**Date**: 2026-03-14
**Status**: Research Complete — Decision Made
**Trigger**: Evaluating Harbor Framework as potential evaluation standard

## Part 1: Harbor Framework

**Source**: https://harborframework.com/docs
**GitHub**: github.com/laude-institute/harbor — 993 stars, 760 forks, Python
**Created**: Aug 2025 (evolved from Terminal-Bench)

### What It Is

Agent benchmarking/evaluation runner. CLI tool that runs AI agents against standardized tasks in Docker containers and measures pass/fail rewards. NOT an evaluation standard — it's evaluation infrastructure.

```
Task (instruction + Dockerfile + test.sh)
  → Agent (Claude Code, OpenHands, Codex, custom, etc.)
    → Trial (agent attempts task in container)
      → Reward (test.sh writes 0 or 1 to /logs/verifier/reward.txt)
        → Job (aggregate many trials → accuracy %)
```

60+ benchmarks in registry: SWE-bench, GAIA, Terminal-Bench, FinanceAgent, BixBench, LawBench, binary-audit, QCircuitBench, AIME, MLGym, etc.

### ATIF — Agent Trajectory Interchange Format (v1.4)

JSON spec for logging agent execution history. Captures messages, reasoning traces, tool calls, observations, token usage, costs, logprobs. Supports multi-agent delegation. Used by 6 agents within Harbor: Terminus-2, Claude Code, Codex CLI, Gemini CLI, OpenHands, Mini-SWE-Agent.

**Adoption**: ATIF is only used within Harbor's own ecosystem. No evidence of adoption outside Harbor. It's a benchmark-specific format, not an industry standard.

### Relevance to TaskForest

| Aspect | Useful? | Notes |
|---|---|---|
| Pre-registration benchmarking | Yes | Agents prove capability via Harbor benchmarks before registering |
| Task format | Somewhat | Similar to our TTD concept |
| ATIF trajectory format | No | Too niche, not adopted outside Harbor (see Part 2) |
| On-chain verification | No | Zero crypto/chain awareness |
| Production verification | No | Offline benchmarking only |

**Verdict**: Harbor is useful as a pre-registration benchmarking tool (agents run SWE-bench etc. before registering, scores feed Router's maturity factor). But ATIF is NOT the right format to adopt.

---

## Part 2: Agent Trace/Observability Standards Landscape

### The Contenders

| Standard | Backing | Stars/Adoption | Status | What It Does |
|---|---|---|---|---|
| **OpenTelemetry GenAI** | CNCF (Google, IBM, Datadog, etc.) | Massive (OTel has 39K+ stars) | Development (semconv v1.40) | Observability spans for LLM calls, tool use, agent invocations |
| **VOLT** (IETF) | Quox Ltd | New (Feb 2026) | IETF Internet-Draft | Cryptographic hash chains for verifiable agent operations |
| **ATIF** (Harbor) | Laude Institute | 993 stars (Harbor repo) | v1.4 | Benchmark trajectory logging |
| **Cursor Agent Trace** | Cognition/Cursor | 636 stars | RFC v0.1.0 | Code attribution (who wrote which line) |
| **AgentWorkforce Trajectories** | AgentWorkforce | 16 stars | v0.5.2 | Agent work context capture |
| **Open Agent Spec** | Academic | Paper only | arXiv | Declarative agent definition |

### OpenTelemetry GenAI Semantic Conventions — The Emerging Winner

OTel GenAI is converging as THE standard for agent observability. Status: "Development" (not stable yet), but:

- **Already supported by**: Datadog, Honeycomb, New Relic
- **Frameworks emitting OTel natively**: LangChain, CrewAI, AutoGen, AG2
- **Defines**: `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.operation.name`, tool execution spans, token metrics
- **Agent-specific issue** (semantic-conventions#2664): Proposing conventions for tasks, actions, agents, teams, artifacts, memory
- **CNCF-backed**: Same governance as Kubernetes, Prometheus, etc.

**For TaskForest**: Good for monitoring/observability of our Workers and Router pipeline. NOT suitable for verification (no crypto, no proofs — it's telemetry, not evidence).

### VOLT — Verifiable Operations Ledger and Trace — The Interesting One

Submitted to IETF Feb 28, 2026 (draft-cowles-volt-00). Also submitted to NIST AI Agent Standards Initiative.

**What it does**: Cryptographic hash chains for agent operations. Every action recorded as an event with SHA-256 hash over canonical JSON + `prev_hash` linking to prior event. If any record is modified/inserted/deleted, the chain breaks.

**Three conformance levels**:
1. **Recorder** — emits valid events
2. **Bundler** — packages events into portable Evidence Bundles
3. **Verifier** — independently validates any bundle → PASS/FAIL

**Evidence Bundles**: Self-contained directories with manifest, event chain (NDJSON), content-addressed attachments, optional Ed25519 signatures.

**This is essentially what our receipt DAG does.** VOLT is a general-purpose version of our Merkle DAG execution receipts, going through IETF standardization.

**Key differences from our system**:
- VOLT is local-first (no blockchain/consensus) — we add on-chain anchoring
- VOLT doesn't have economic incentives — we add staking/disputes
- VOLT doesn't have TEE attestation — we add Phala integration
- VOLT is more general — we're agent-task specific

**For TaskForest**: Watch closely. If VOLT gains traction, aligning our receipt format with VOLT's event schema would make TaskForest receipts independently verifiable by any VOLT Verifier. This is the strongest standards alignment opportunity.

### Companion Protocols (same IETF submission)

- **AEE (Agent Envelope Exchange)**: 14-field JSON envelope for agent-to-agent messaging. Typed actor IDs, correlation IDs, causality chains. Think HTTP headers for agent communication.
- **AOCL (Agent Orchestration Control Layers)**: 11-layer governance pipeline (identity → routing → policy → execution → verification → audit). Similar to our Router pipeline concept.

---

## Part 3: Decision

### What to Adopt

1. **NOTHING right now** for the receipt format — our custom ExecutionReceipt + Merkle DAG is more purpose-built than any standard. Keep it.

2. **Watch VOLT** — if it gains adoption post-IETF 125 (March 2026), consider aligning our receipt event schema with VOLT's event format. This would be additive (wrap our receipts in VOLT-compatible events), not a rewrite.

3. **Use Harbor for pre-registration benchmarking** — agents run relevant benchmarks before registering. Scores feed into Router's maturity factor. This is a product feature, not a protocol integration.

4. **Consider OpenTelemetry GenAI** for Workers observability — standard spans for our Router pipeline, LLM calls in scoring, TEE provisioning latency. This is infra, not protocol.

### Why NOT Adopt ATIF

- Only used within Harbor (6 agents, 1 project)
- Benchmark-focused, not production-verification-focused
- No cryptographic properties (hashing, signing, tamper evidence)
- No industry adoption outside Harbor
- Our receipt DAG is already more capable for our use case

### Integration Complexity If We Did Adopt ATIF (Hypothetical)

Low-medium effort, but not worth it:
- Map our `ExecutionReceipt` fields to ATIF `Step` objects (~50 lines of serialization code)
- ATIF lacks `input_hash`/`output_hash` — would need custom `extra` fields, defeating the point
- ATIF has no Merkle tree concept — we'd still need our own DAG layer on top
- Net result: extra serialization complexity for near-zero ecosystem benefit

### Integration Complexity If We Align with VOLT (Future)

Medium effort, high value:
- Our receipt events already have hash chains (receiptRoot, prev hashes) — similar structure to VOLT
- Would need to adopt VOLT's canonical JSON serialization for hash computation
- Add Evidence Bundle export (manifest + NDJSON event chain + attachments)
- Our on-chain `receipt_root` becomes a VOLT bundle anchor hash
- Benefit: any VOLT Verifier could independently validate TaskForest receipts

---

## Part 4: Terminal-Bench (tbench.ai)

**Source**: https://www.tbench.ai (leaderboard), https://harborframework.com (runner)
**Built by**: Laude Institute × Stanford collaboration
**Status**: Active, well-adopted

### What It Is

tbench.ai IS Terminal-Bench — the leaderboard website for Harbor's flagship benchmark. Same project, same team. It measures how well AI agents can complete real-world terminal tasks (build kernels, configure servers, crack hashes, train models, etc.).

### Adoption — Very Real

119 leaderboard entries as of March 2026. Major agent teams submit official results:

| Agent | Organization | Best Score |
|---|---|---|
| ForgeCode | ForgeCode | 81.8% |
| Simple Codex | **OpenAI** | 75.1% |
| Claude Code | **Anthropic** | 58.0% |
| Gemini CLI | **Google** | 47.4% |
| OpenHands | OpenHands (open source) | 51.9% |
| Junie CLI | **JetBrains** | 71.0% |
| Goose | **Block** | 54.3% |
| Warp | Warp | 61.2% |
| LangChain Deep Agents | **LangChain** | 66.5% |

OpenAI, Anthropic, and Google all submit directly. This is the real deal for terminal-agent benchmarking.

### Relevance to TaskForest

Terminal-Bench is the strongest candidate for **pre-registration benchmarking**:
- Agent providers run Terminal-Bench before registering on TaskForest
- Scores feed into Router's `maturity` factor
- Well-understood by the agent ecosystem — every major lab already participates
- 89 high-quality tasks across sysadmin, security, ML, data science, code

### What It Doesn't Do

- Not a production verification system
- Binary pass/fail per task — no continuous quality scoring
- No crypto, no proofs, no on-chain anything
- Measures terminal tasks only — not web browsing, API calls, or multi-agent coordination

---

## Part 5: VOLT Deep Dive — Field-by-Field Comparison

**Source**: IETF Internet-Draft `draft-cowles-volt-00` (full spec read)
**Spec version**: 0.1
**Status**: Experimental, submitted Feb 28 2026, presented at IETF 125 (March 14-20 2026)

### VOLT Event Schema (Required Fields)

```json
{
  "volt_version": "0.1",
  "event_id": "evt-003",
  "run_id": "run-abc-123",
  "ts": "2026-02-28T19:12:01.000Z",
  "seq": 3,
  "event_type": "tool.call.executed",
  "actor": {
    "actor_type": "agent",
    "actor_id": "agent.router-v2"
  },
  "context": {
    "correlation_id": "corr-xyz-789"
  },
  "payload": {
    "tool_name": "shell",
    "status": "success",
    "duration_ms": 812,
    "attachment_refs": [{
      "hash_alg": "sha256",
      "hash": "e3b0c442...7852b855",
      "content_type": "text/plain",
      "label": "stdout"
    }]
  },
  "prev_hash": "b2c3d4e5...f6071829",
  "hash": "c3d4e5f6...07182930"
}
```

### Side-by-Side: Our Receipt vs VOLT Event

| Aspect | TaskForest ExecutionReceipt | VOLT Event |
|---|---|---|
| **Structure** | Tree (threadId/parentThreadId = Merkle DAG) | Linear chain (prev_hash → sequential) |
| **Hash chain** | Merkle root over tree of receipts | SHA-256 prev_hash chain (append-only) |
| **Data hashing** | input_hash + output_hash per receipt | Content-addressed attachment refs |
| **Privacy** | E2E encryption (never see plaintext) | Metadata-only payloads, redaction support |
| **Actor tracking** | agentId string | Typed actor object (agent/human/system/tool/runner) |
| **Timing** | startedAt/completedAt (unix) | ISO 8601 timestamps |
| **Sub-agents** | parentThreadId → tree structure | parent_event_id → span-like linkage |
| **On-chain anchor** | receipt_root stored on-chain (32 bytes) | No chain concept (future work noted) |
| **Portable proof** | No bundle format | Evidence Bundle (manifest + NDJSON + attachments + signatures) |
| **Signatures** | TEE attestation hash | Optional Ed25519 signatures |
| **Hash format** | byte array (number[]) | Hex string (64 chars) |

### Key Differences That Matter

1. **Tree vs Chain**: Our Merkle DAG is MORE expressive — it captures sub-agent delegation as a tree. VOLT is linear, with optional parent_event_id for span-like nesting. For our use case (orchestrator → sub-agents), our tree structure is better.

2. **Evidence Bundles**: VOLT has this, we don't. A portable, self-contained proof package that any Verifier can independently validate. This is genuinely useful — we could export our receipt DAGs as VOLT-compatible bundles.

3. **Privacy model**: Fundamentally different. We use E2E encryption (Workers never sees plaintext). VOLT uses metadata-only payloads with redaction support (assume the recorder sees everything, then redact). Both valid, different threat models.

4. **Blockchain anchoring**: VOLT explicitly notes this as future work. We already do it (receipt_root on-chain). We're ahead here.

### VOLT Standard Event Types

- `run.started` / `run.completed` / `run.failed` — lifecycle
- `tool.call.requested` / `tool.call.executed` — tool use
- `hitl.approval.requested` / `hitl.approval.granted` — human oversight
- `model.inference.started` / `model.inference.completed` — LLM calls
- `file.read` / `file.write` / `network.request` — I/O
- Custom types supported via dotted-path naming

### Integration Effort Assessment

**Option A: VOLT-Compatible Export (Recommended)**
- Add a VOLT exporter that converts our receipt DAG → VOLT Evidence Bundle
- ~200-300 lines of code: canonical JSON serializer, NDJSON emitter, manifest generator
- Non-breaking: our internal format stays unchanged
- Value: any VOLT Verifier could validate TaskForest receipts

**Option B: Native VOLT Events (Not Recommended)**
- Replace our ExecutionReceipt with VOLT events
- Loses our tree structure (Merkle DAG → linear chain)
- Over-engineering: VOLT is v0.1, experimental, single author
- We'd be coupling to an unstable spec

### VOLT Adoption Reality Check

- Single author (Adam Cowles / Quox Ltd)
- Founded January 2026 — very new
- 156 tests in reference implementation (QuoxCORE)
- No known adopters outside Quox
- IETF submission does NOT mean IETF endorsement
- No working group adoption yet
- Spec is solid technically but unproven in production

---

## Part 6: Final Recommendations

### For Agent Evaluation

**Use Terminal-Bench / Harbor for pre-registration benchmarking.** It's the most adopted agent benchmark with submissions from OpenAI, Anthropic, Google, JetBrains, LangChain, Block, etc. Integrate as a product feature:
- Agent registers on TaskForest → provides Terminal-Bench score → feeds Router's maturity factor
- Optional: build a TaskForest-specific Harbor adapter for task-format testing

### For Execution Traces / Verification

**Keep our custom receipt DAG.** It's more capable than anything else for our specific use case (tree-structured sub-agent delegation + on-chain anchoring + TEE attestation). No existing standard matches all three.

**Watch VOLT.** If it gains adoption post-IETF 125, add a VOLT-compatible export layer (~200 lines). This makes our receipts independently verifiable without changing our core format.

**Use OpenTelemetry GenAI** for operational observability of Workers/Router (not for verification — for monitoring latency, token costs, error rates).

### For Protocol Positioning

TaskForest is ahead of the standards in two ways:
1. We already have on-chain receipt anchoring (VOLT lists this as future work)
2. We have economic incentives tied to verification (staking, disputes — no standard addresses this)

This means we're not adopting standards — we're building what could become one.

---

### Cloudflare Infrastructure Plan (Deferred)

Requires Workers Paid plan ($5/month) for Durable Objects and Queues. All other resources (D1, R2, KV, Workers) are within free tier for dev. See wrangler.toml for full config. Revisit when ready to deploy.

Resources to create:
- `wrangler d1 create taskforest-db-dev`
- `wrangler r2 bucket create taskforest-blobs-dev`
- `wrangler r2 bucket create taskforest-metadata-dev`
- `wrangler kv namespace create CACHE`
- Secrets: JWT_SECRET, SOLANA_RPC_URL, PHALA_API_KEY
