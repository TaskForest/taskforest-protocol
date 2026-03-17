import type { TaskForestSpec } from './spec'

export type TemplateId =
  | 'security-audit'
  | 'code-review'
  | 'api-build'
  | 'data-analysis'
  | 'documentation'
  | 'bug-fix'

export interface SpecTemplate {
  id: TemplateId
  name: string
  description: string
  tags: string[]
  spec: TaskForestSpec
}

const securityAudit: SpecTemplate = {
  id: 'security-audit',
  name: 'Security Audit',
  description: 'Smart contract or application security review',
  tags: ['security', 'audit'],
  spec: {
    version: 1,
    metadata: {
      title: '',
      tags: ['security', 'audit'],
      difficulty: 'hard',
      estimated_duration: '4h',
    },
    description: '',
    acceptance_criteria: [
      { id: 'ac-1', description: 'Check for reentrancy vulnerabilities', type: 'coverage', required: true, weight: 20 },
      { id: 'ac-2', description: 'Check for integer overflow/underflow', type: 'coverage', required: true, weight: 15 },
      { id: 'ac-3', description: 'Check for access control issues', type: 'coverage', required: true, weight: 20 },
      { id: 'ac-4', description: 'Check for input validation gaps', type: 'coverage', required: true, weight: 15 },
      { id: 'ac-5', description: 'Produce a findings report with severity ratings', type: 'output', required: true, weight: 20 },
      { id: 'ac-6', description: 'All critical findings include fix recommendations', type: 'output', required: true, weight: 10 },
    ],
    constraints: [],
    inputs: [{ type: 'file', description: 'Source code to audit', encrypted: true }],
    outputs: [
      { type: 'file', description: 'Audit report', format: 'markdown' },
      { type: 'structured', description: 'Machine-readable findings', format: 'json' },
    ],
    verification: {
      mode: 'judge',
      config: {
        pass_threshold: 70,
        rubric: 'Score each criterion 0-100 based on thoroughness. Missing critical vulnerabilities = automatic fail for that criterion.',
        required_criteria_must_pass: true,
      },
    },
  },
}

const codeReview: SpecTemplate = {
  id: 'code-review',
  name: 'Code Review',
  description: 'Code quality, best practices, and architecture review',
  tags: ['code-review', 'quality'],
  spec: {
    version: 1,
    metadata: {
      title: '',
      tags: ['code-review', 'quality'],
      difficulty: 'medium',
      estimated_duration: '2h',
    },
    description: '',
    acceptance_criteria: [
      { id: 'ac-1', description: 'Review code structure and organization', type: 'coverage', required: true, weight: 20 },
      { id: 'ac-2', description: 'Check for common anti-patterns and code smells', type: 'coverage', required: true, weight: 20 },
      { id: 'ac-3', description: 'Verify error handling completeness', type: 'coverage', required: true, weight: 20 },
      { id: 'ac-4', description: 'Check type safety and null handling', type: 'coverage', required: true, weight: 15 },
      { id: 'ac-5', description: 'Produce a review summary with actionable feedback', type: 'output', required: true, weight: 25 },
    ],
    constraints: [],
    inputs: [{ type: 'file', description: 'Source code to review', encrypted: true }],
    outputs: [{ type: 'file', description: 'Review report with inline comments', format: 'markdown' }],
    verification: {
      mode: 'judge',
      config: {
        pass_threshold: 65,
        rubric: 'Score each criterion 0-100 based on depth and actionability of feedback.',
        required_criteria_must_pass: true,
      },
    },
  },
}

const apiBuild: SpecTemplate = {
  id: 'api-build',
  name: 'API Build',
  description: 'Build REST/GraphQL API endpoints with tests',
  tags: ['backend', 'api'],
  spec: {
    version: 1,
    metadata: {
      title: '',
      tags: ['backend', 'api'],
      difficulty: 'medium',
      estimated_duration: '4h',
    },
    description: '',
    acceptance_criteria: [
      { id: 'ac-1', description: 'All specified endpoints implemented and return correct status codes', type: 'test', required: true, weight: 30 },
      { id: 'ac-2', description: 'Input validation on all endpoints', type: 'test', required: true, weight: 20 },
      { id: 'ac-3', description: 'Error responses follow consistent format', type: 'test', required: true, weight: 15 },
      { id: 'ac-4', description: 'Test suite included with >80% coverage', type: 'test', required: true, weight: 25 },
      { id: 'ac-5', description: 'API documentation or OpenAPI spec produced', type: 'output', required: false, weight: 10 },
    ],
    constraints: [],
    inputs: [{ type: 'text', description: 'API requirements and existing project context', encrypted: false }],
    outputs: [
      { type: 'file', description: 'Source code', format: 'typescript' },
      { type: 'file', description: 'Test suite', format: 'typescript' },
    ],
    verification: {
      mode: 'test_suite',
      config: { test_command: 'npm test', required_criteria_must_pass: true },
    },
  },
}

const dataAnalysis: SpecTemplate = {
  id: 'data-analysis',
  name: 'Data Analysis',
  description: 'Analyze datasets and produce insights',
  tags: ['data', 'analysis'],
  spec: {
    version: 1,
    metadata: {
      title: '',
      tags: ['data', 'analysis'],
      difficulty: 'medium',
      estimated_duration: '3h',
    },
    description: '',
    acceptance_criteria: [
      { id: 'ac-1', description: 'Data cleaned and validated', type: 'coverage', required: true, weight: 20 },
      { id: 'ac-2', description: 'Key metrics computed and explained', type: 'output', required: true, weight: 25 },
      { id: 'ac-3', description: 'Visualizations produced for key findings', type: 'output', required: true, weight: 20 },
      { id: 'ac-4', description: 'Summary report with actionable insights', type: 'output', required: true, weight: 25 },
      { id: 'ac-5', description: 'Methodology documented and reproducible', type: 'coverage', required: false, weight: 10 },
    ],
    constraints: [],
    inputs: [{ type: 'file', description: 'Dataset to analyze', encrypted: true }],
    outputs: [
      { type: 'file', description: 'Analysis report', format: 'markdown' },
      { type: 'structured', description: 'Computed metrics', format: 'json' },
    ],
    verification: {
      mode: 'judge',
      config: {
        pass_threshold: 65,
        rubric: 'Score based on insight depth, accuracy of metrics, and clarity of presentation.',
        required_criteria_must_pass: true,
      },
    },
  },
}

const documentation: SpecTemplate = {
  id: 'documentation',
  name: 'Documentation',
  description: 'Write or improve technical documentation',
  tags: ['docs', 'writing'],
  spec: {
    version: 1,
    metadata: {
      title: '',
      tags: ['docs', 'writing'],
      difficulty: 'easy',
      estimated_duration: '2h',
    },
    description: '',
    acceptance_criteria: [
      { id: 'ac-1', description: 'All public APIs or features documented', type: 'coverage', required: true, weight: 30 },
      { id: 'ac-2', description: 'Code examples included for key features', type: 'output', required: true, weight: 25 },
      { id: 'ac-3', description: 'Getting started guide included', type: 'output', required: true, weight: 20 },
      { id: 'ac-4', description: 'No broken links or references', type: 'test', required: true, weight: 15 },
      { id: 'ac-5', description: 'Consistent formatting and style', type: 'coverage', required: false, weight: 10 },
    ],
    constraints: [],
    inputs: [{ type: 'file', description: 'Source code or existing docs', encrypted: false }],
    outputs: [{ type: 'file', description: 'Documentation files', format: 'markdown' }],
    verification: {
      mode: 'poster_review',
      config: { required_criteria_must_pass: true },
    },
  },
}

const bugFix: SpecTemplate = {
  id: 'bug-fix',
  name: 'Bug Fix',
  description: 'Diagnose and fix a specific bug',
  tags: ['bugfix', 'debugging'],
  spec: {
    version: 1,
    metadata: {
      title: '',
      tags: ['bugfix', 'debugging'],
      difficulty: 'medium',
      estimated_duration: '2h',
    },
    description: '',
    acceptance_criteria: [
      { id: 'ac-1', description: 'Root cause identified and documented', type: 'output', required: true, weight: 25 },
      { id: 'ac-2', description: 'Fix implemented with minimal changes', type: 'coverage', required: true, weight: 25 },
      { id: 'ac-3', description: 'Existing tests still pass', type: 'test', required: true, weight: 20 },
      { id: 'ac-4', description: 'Regression test added for the bug', type: 'test', required: true, weight: 20 },
      { id: 'ac-5', description: 'No unrelated changes in the diff', type: 'coverage', required: true, weight: 10 },
    ],
    constraints: ['Fix must be minimal — no refactoring alongside the bugfix'],
    inputs: [{ type: 'text', description: 'Bug report with reproduction steps', encrypted: false }],
    outputs: [
      { type: 'file', description: 'Code changes (patch or branch)', format: 'typescript' },
      { type: 'file', description: 'Root cause analysis', format: 'markdown' },
    ],
    verification: {
      mode: 'test_suite',
      config: { test_command: 'npm test', required_criteria_must_pass: true },
    },
  },
}

const TEMPLATES: Record<TemplateId, SpecTemplate> = {
  'security-audit': securityAudit,
  'code-review': codeReview,
  'api-build': apiBuild,
  'data-analysis': dataAnalysis,
  'documentation': documentation,
  'bug-fix': bugFix,
}

export function getTemplate(id: TemplateId): SpecTemplate {
  const template = TEMPLATES[id]
  if (!template) throw new Error(`Unknown template: ${id}`)
  return JSON.parse(JSON.stringify(template)) as SpecTemplate
}

export function listTemplates(): SpecTemplate[] {
  return Object.values(TEMPLATES).map((t) => JSON.parse(JSON.stringify(t)) as SpecTemplate)
}

export function applyTemplate(id: TemplateId, title: string, description: string): TaskForestSpec {
  const template = getTemplate(id)
  template.spec.metadata.title = title
  template.spec.description = description
  return template.spec
}
