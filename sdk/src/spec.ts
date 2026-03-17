import { createHash } from 'crypto'

// ─── Types ────────────────────────────────────────────────────────────────────

/** Acceptance criterion type — determines how the criterion is verified */
export type CriterionType = 'coverage' | 'output' | 'test' | 'metric'

/** Verification mode — determines who/what checks the criteria */
export type VerificationMode = 'test_suite' | 'judge' | 'poster_review'

/** Task difficulty estimate */
export type Difficulty = 'trivial' | 'easy' | 'medium' | 'hard' | 'expert'

/** A single acceptance criterion within a spec */
export interface AcceptanceCriterion {
  /** Unique identifier, e.g. 'ac-1' */
  id: string
  /** What must be true for this criterion to pass */
  description: string
  /** How this criterion is verified */
  type: CriterionType
  /** Whether this criterion must pass for overall success */
  required: boolean
  /** Weight for scoring in judge mode (0-100) */
  weight: number
}

/** Spec input definition */
export interface SpecInput {
  /** Input kind */
  type: 'file' | 'text' | 'url' | 'structured'
  /** What this input contains */
  description: string
  /** Whether input is E2E encrypted */
  encrypted: boolean
}

/** Spec output definition */
export interface SpecOutput {
  /** Output kind */
  type: 'file' | 'text' | 'structured' | 'action'
  /** What the agent must produce */
  description: string
  /** Optional format constraint, e.g. 'markdown', 'json', 'sarif' */
  format?: string
}

/** Verification configuration */
export interface VerificationConfig {
  /** Which verification approach to use */
  mode: VerificationMode
  /** Mode-specific configuration */
  config: {
    /** Score threshold for passing (0-100), used in judge mode */
    pass_threshold?: number
    /** Evaluation instructions for judge mode */
    rubric?: string
    /** Command to run for test_suite mode */
    test_command?: string
    /** Whether all required criteria must individually pass (default true) */
    required_criteria_must_pass?: boolean
  }
}

/** Spec metadata — human-readable, non-binding context */
export interface SpecMetadata {
  /** Human-readable task title */
  title: string
  /** Optional category tags for marketplace discovery */
  tags?: string[]
  /** Estimated duration, e.g. '2h', '1d' */
  estimated_duration?: string
  /** Difficulty estimate */
  difficulty?: Difficulty
}

/** TaskForest Spec v1 — the verification contract */
export interface TaskForestSpec {
  /** Schema version (always 1) */
  version: 1
  /** Human-readable metadata */
  metadata: SpecMetadata
  /** Natural language task description */
  description: string
  /** Testable acceptance criteria — the core of the spec */
  acceptance_criteria: AcceptanceCriterion[]
  /** Hard constraints the agent must follow */
  constraints: string[]
  /** Inputs the poster provides */
  inputs: SpecInput[]
  /** Outputs the agent must produce */
  outputs: SpecOutput[]
  /** How verification is performed */
  verification: VerificationConfig
}

/** Result of checking a single criterion */
export interface CriterionResult {
  /** Criterion ID from the spec */
  id: string
  /** Pass or fail */
  status: 'pass' | 'fail'
  /** Score (0-100) for weighted evaluation */
  score: number
  /** Hash of the evidence supporting this result */
  evidence_hash: string
}

/** Full verification result — hash committed on-chain */
export interface SpecVerificationResult {
  /** Hash of the spec these results apply to */
  spec_hash: string
  /** Per-criterion results */
  results: CriterionResult[]
  /** Whether the overall spec passed */
  overall_pass: boolean
  /** Weighted score across all criteria */
  weighted_score: number
  /** Which verification mode was used */
  verified_by: VerificationMode
  /** Unix timestamp of verification */
  verified_at: number
}

// ─── Canonical Hashing ───────────────────────────────────────────────────────

/**
 * Canonicalize a value for deterministic JSON serialization.
 * Rules:
 * 1. Sort all object keys alphabetically (recursive)
 * 2. Remove undefined values
 * 3. Compact JSON (no whitespace)
 */
function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return value

  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }

  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key]
      if (v !== undefined) {
        sorted[key] = canonicalize(v)
      }
    }
    return sorted
  }

  return value
}

/**
 * Serialize a spec to canonical JSON for deterministic hashing.
 * Sorted keys, no whitespace, undefined stripped.
 */
export function canonicalizeSpec(spec: TaskForestSpec): string {
  return JSON.stringify(canonicalize(spec))
}

/**
 * Compute the SHA-256 hash of a spec.
 * Returns 32-byte hash as number[] (matching SDK convention from receipts.ts).
 */
export function hashSpec(spec: TaskForestSpec): number[] {
  const canonical = canonicalizeSpec(spec)
  return Array.from(createHash('sha256').update(canonical, 'utf-8').digest())
}

/**
 * Compute the SHA-256 hash of a spec as a hex string.
 * Convenience for off-chain storage and display.
 */
export function hashSpecHex(spec: TaskForestSpec): string {
  const canonical = canonicalizeSpec(spec)
  return createHash('sha256').update(canonical, 'utf-8').digest('hex')
}

/**
 * Hash verification results for on-chain commitment.
 */
export function hashVerificationResult(result: SpecVerificationResult): number[] {
  const canonical = JSON.stringify(canonicalize(result))
  return Array.from(createHash('sha256').update(canonical, 'utf-8').digest())
}

// ─── Spec Validation ─────────────────────────────────────────────────────────

export interface SpecValidationError {
  field: string
  message: string
}

/**
 * Validate a spec for correctness and completeness.
 * Returns empty array if valid, or list of errors.
 */
export function validateSpec(spec: TaskForestSpec): SpecValidationError[] {
  const errors: SpecValidationError[] = []

  if (spec.version !== 1) {
    errors.push({ field: 'version', message: 'Only version 1 is supported' })
  }

  if (!spec.metadata?.title?.trim()) {
    errors.push({ field: 'metadata.title', message: 'Title is required' })
  }

  if (!spec.description?.trim()) {
    errors.push({ field: 'description', message: 'Description is required' })
  }

  if (!spec.acceptance_criteria || spec.acceptance_criteria.length === 0) {
    errors.push({ field: 'acceptance_criteria', message: 'At least one acceptance criterion is required' })
  }

  const ids = new Set<string>()
  for (let i = 0; i < (spec.acceptance_criteria?.length ?? 0); i++) {
    const ac = spec.acceptance_criteria[i]

    if (!ac.id?.trim()) {
      errors.push({ field: `acceptance_criteria[${i}].id`, message: 'Criterion ID is required' })
    } else if (ids.has(ac.id)) {
      errors.push({ field: `acceptance_criteria[${i}].id`, message: `Duplicate criterion ID: ${ac.id}` })
    } else {
      ids.add(ac.id)
    }

    if (!ac.description?.trim()) {
      errors.push({ field: `acceptance_criteria[${i}].description`, message: 'Criterion description is required' })
    }

    const validTypes: CriterionType[] = ['coverage', 'output', 'test', 'metric']
    if (!validTypes.includes(ac.type)) {
      errors.push({ field: `acceptance_criteria[${i}].type`, message: `Invalid type: ${ac.type}. Must be one of: ${validTypes.join(', ')}` })
    }

    if (typeof ac.weight !== 'number' || ac.weight < 0 || ac.weight > 100) {
      errors.push({ field: `acceptance_criteria[${i}].weight`, message: 'Weight must be a number between 0 and 100' })
    }
  }

  // Validate weights sum for required criteria (should ideally sum to ~100 for judge mode)
  const requiredWeightSum = (spec.acceptance_criteria ?? [])
    .filter((ac) => ac.required)
    .reduce((sum, ac) => sum + ac.weight, 0)

  if (spec.verification?.mode === 'judge' && requiredWeightSum === 0) {
    errors.push({ field: 'acceptance_criteria', message: 'Judge mode requires at least one required criterion with weight > 0' })
  }

  const validModes: VerificationMode[] = ['test_suite', 'judge', 'poster_review']
  if (!validModes.includes(spec.verification?.mode)) {
    errors.push({ field: 'verification.mode', message: `Invalid mode: ${spec.verification?.mode}. Must be one of: ${validModes.join(', ')}` })
  }

  if (spec.verification?.mode === 'judge' && !spec.verification.config?.rubric?.trim()) {
    errors.push({ field: 'verification.config.rubric', message: 'Rubric is required for judge verification mode' })
  }

  if (spec.verification?.mode === 'test_suite' && !spec.verification.config?.test_command?.trim()) {
    errors.push({ field: 'verification.config.test_command', message: 'Test command is required for test_suite verification mode' })
  }

  return errors
}

// ─── SpecBuilder ──────────────────────────────────────────────────────────────

/**
 * Fluent builder for constructing TaskForest specs.
 *
 * @example
 * ```ts
 * const spec = new SpecBuilder('Solana Contract Audit')
 *   .description('Audit an Anchor program for security vulnerabilities')
 *   .tags(['solana', 'security', 'audit'])
 *   .difficulty('hard')
 *   .duration('2h')
 *   .criterion('ac-1', 'Check for reentrancy', 'coverage', { required: true, weight: 25 })
 *   .criterion('ac-2', 'Produce markdown report', 'output', { required: true, weight: 20 })
 *   .constraint('Must follow SARIF format')
 *   .input('file', 'Anchor program source', { encrypted: true })
 *   .output('file', 'Audit report', { format: 'markdown' })
 *   .judgeMode('Score each criterion 0-100. Critical findings missing = auto fail.', 70)
 *   .build()
 * ```
 */
export class SpecBuilder {
  private spec: TaskForestSpec

  constructor(title: string) {
    this.spec = {
      version: 1,
      metadata: { title },
      description: '',
      acceptance_criteria: [],
      constraints: [],
      inputs: [],
      outputs: [],
      verification: {
        mode: 'poster_review',
        config: { required_criteria_must_pass: true },
      },
    }
  }

  /** Set task description */
  description(desc: string): this {
    this.spec.description = desc
    return this
  }

  /** Set category tags for discovery */
  tags(tags: string[]): this {
    this.spec.metadata.tags = tags
    return this
  }

  /** Set difficulty estimate */
  difficulty(d: Difficulty): this {
    this.spec.metadata.difficulty = d
    return this
  }

  /** Set estimated duration */
  duration(d: string): this {
    this.spec.metadata.estimated_duration = d
    return this
  }

  /** Add an acceptance criterion */
  criterion(
    id: string,
    description: string,
    type: CriterionType,
    opts?: { required?: boolean; weight?: number },
  ): this {
    this.spec.acceptance_criteria.push({
      id,
      description,
      type,
      required: opts?.required ?? true,
      weight: opts?.weight ?? 0,
    })
    return this
  }

  /** Add a hard constraint */
  constraint(c: string): this {
    this.spec.constraints.push(c)
    return this
  }

  /** Add an input definition */
  input(type: SpecInput['type'], description: string, opts?: { encrypted?: boolean }): this {
    this.spec.inputs.push({ type, description, encrypted: opts?.encrypted ?? false })
    return this
  }

  /** Add an output definition */
  output(type: SpecOutput['type'], description: string, opts?: { format?: string }): this {
    this.spec.outputs.push({ type, description, format: opts?.format })
    return this
  }

  /** Set verification to test_suite mode */
  testSuiteMode(testCommand: string): this {
    this.spec.verification = {
      mode: 'test_suite',
      config: { test_command: testCommand, required_criteria_must_pass: true },
    }
    return this
  }

  /** Set verification to judge mode */
  judgeMode(rubric: string, passThreshold: number = 70): this {
    this.spec.verification = {
      mode: 'judge',
      config: { rubric, pass_threshold: passThreshold, required_criteria_must_pass: true },
    }
    return this
  }

  /** Set verification to poster_review mode */
  posterReviewMode(): this {
    this.spec.verification = {
      mode: 'poster_review',
      config: { required_criteria_must_pass: true },
    }
    return this
  }

  /** Validate and build the spec. Throws if invalid. */
  build(): TaskForestSpec {
    const errors = validateSpec(this.spec)
    if (errors.length > 0) {
      const messages = errors.map((e) => `  ${e.field}: ${e.message}`).join('\n')
      throw new Error(`Invalid spec:\n${messages}`)
    }
    return { ...this.spec }
  }

  /** Build without validation (for drafts). */
  buildDraft(): TaskForestSpec {
    return { ...this.spec }
  }
}
