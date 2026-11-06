import { z } from 'zod';
import type { Session } from '@kineticare/shared';

/* ------------------------------------------------------------------ */
/* Report generator interface                                           */
/* ------------------------------------------------------------------ */

export interface ReportSections {
  summary: string;
  objective_findings: string;
  form_observations: string;
  fatigue_assessment: string;
  compliance: string;
  recommendations_for_clinician: string;
  limitations: string;
}

export interface ReportGenerator {
  readonly name: string;
  readonly model: string;
  generate(session: Session): Promise<ReportSections>;
}

/* ------------------------------------------------------------------ */
/* Grounding validator                                                  */
/* ------------------------------------------------------------------ */

/**
 * Extracts all decimal numbers from a string.
 */
function extractNumbers(text: string): number[] {
  const nums: number[] = [];
  const re = /-?(?:\d+\.?\d*|\.\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    nums.push(Number(m[0]));
  }
  return nums;
}

/**
 * Builds the set of "allowed" numbers from the session input: every scalar
 * we expect the report to reference. Rep-level values live in child tables
 * and are passed in via `extra` by the caller when available.
 */
interface GroundingBudget {
  allowed: number[];
}

function buildGroundingBudget(session: Session): GroundingBudget {
  const allowed: number[] = [];
  allowed.push(session.duration_ms);
  if (session.pain_score != null) allowed.push(session.pain_score);
  if (session.rpe != null) allowed.push(session.rpe);
  return { allowed };
}

function validateGrounding(
  text: string,
  budget: GroundingBudget
): {
  passed: boolean;
  details: string[];
} {
  const details: string[] = [];
  const numbers = extractNumbers(text);
  const allowed = budget.allowed;
  const hallucinated: number[] = [];
  for (const n of numbers) {
    const match = allowed.some((a) => Math.abs(a - n) < 1e-6 || Math.round(a) === Math.round(n));
    if (!match) {
      // Tolerate small integers a clinician might legitimately cite (counts,
      // percentages 0-100). Flag anything outside the input data.
      const isSmallInteger = Number.isInteger(n) && n >= 0 && n <= 100;
      if (!isSmallInteger) hallucinated.push(n);
    }
  }
  if (hallucinated.length > 0) {
    details.push(`Numbers not present in session data: ${hallucinated.join(', ')}`);
  }
  return { passed: hallucinated.length === 0, details };
}

/* ------------------------------------------------------------------ */
/* Template generator (deterministic fallback)                          */
/* ------------------------------------------------------------------ */

export class TemplateGenerator implements ReportGenerator {
  readonly name = 'template';
  readonly model = 'template';

  async generate(session: Session): Promise<ReportSections> {
    return {
      summary: `Session for patient ${session.patient_id} on exercise ${session.exercise_id}. Completed ${session.duration_ms} ms of exercise.`,
      objective_findings: `Duration: ${session.duration_ms} ms. Pain score: ${session.pain_score ?? 'not recorded'}. RPE: ${session.rpe ?? 'not recorded'}.`,
      form_observations:
        'No per-rep detail available in this summary. See the session record for fault events.',
      fatigue_assessment: 'Fatigue indicators could not be computed from summary alone.',
      compliance: 'Compliance summary requires per-rep data.',
      recommendations_for_clinician:
        'Review the session record with the patient. Verify form faults in person.',
      limitations:
        'This is a template-generated draft, not a clinical assessment. It is derived only from the numeric session summary and contains no video or image data.',
    };
  }
}

/* ------------------------------------------------------------------ */
/* Ollama generator                                                     */
/* ------------------------------------------------------------------ */

export class OllamaGenerator implements ReportGenerator {
  readonly name = 'ollama';
  readonly model: string;

  constructor(
    readonly baseUrl: string,
    model: string,
    readonly timeoutMs: number = 30000,
    readonly fallback: ReportGenerator
  ) {
    this.model = model;
  }

  async generate(session: Session): Promise<ReportSections> {
    const prompt = this.buildPrompt(session);
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const text = await this.callOllama(prompt);
        const parsed = this.parseOllamaResponse(text);
        // Grounding validation.
        const budget = buildGroundingBudget(session);
        const validation = validateGrounding(JSON.stringify(parsed), budget);
        if (validation.passed) {
          return parsed;
        }
        // Validation failed once -> retry once.
        if (attempt === 1) {
          console.warn(
            '[ollama] grounding validation failed, retrying: ' + validation.details.join('; ')
          );
          continue;
        }
        return this.fallback.generate(session);
      } catch {
        if (attempt === 1) continue;
        return this.fallback.generate(session);
      }
    }
    return this.fallback.generate(session);
  }

  private buildPrompt(session: Session): string {
    return `You are a clinical documentation assistant for a physical therapy copilot. You must NOT diagnose. You must NOT invent numbers. Use only the numbers provided below.

SESSION DATA (numbers only):
- Exercise: ${session.exercise_id}
- Duration: ${session.duration_ms} ms
- Pain score (0-10): ${session.pain_score ?? 'not recorded'}
- RPE (0-10): ${session.rpe ?? 'not recorded'}

Produce a clinical progress note draft with these JSON sections:
- summary: plain-language summary of the session.
- objective_findings: measurable findings from the numbers above.
- form_observations: observations about exercise form (from fault data).
- fatigue_assessment: signs of fatigue, if any.
- compliance: adherence to the prescribed routine.
- recommendations_for_clinician: next steps for the attending physiotherapist.
- limitations: what this note cannot determine.

STRICT RULES:
1. Only output valid JSON matching the schema.
2. No number may appear that is not derivable from the session data above.
3. Do not diagnose. Do not recommend medication.
4. Append nothing outside the JSON.
5. State this is a draft requiring clinician review.`;
  }

  private async callOllama(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          format: 'json',
          stream: false,
          options: { temperature: 0.2 },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Ollama HTTP ${res.status}`);
      }
      const data = await res.json();
      return typeof data === 'string' ? data : ((data as { response?: string }).response ?? '');
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseOllamaResponse(text: string): ReportSections {
    const cleaned = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    const schema = z.object({
      summary: z.string(),
      objective_findings: z.string(),
      form_observations: z.string(),
      fatigue_assessment: z.string(),
      compliance: z.string(),
      recommendations_for_clinician: z.string(),
      limitations: z.string(),
    });
    const parsed = schema.safeParse(JSON.parse(cleaned) as unknown);
    if (!parsed.success) {
      throw new Error(`Ollama returned invalid report JSON: ${parsed.error.message}`);
    }
    return parsed.data as ReportSections;
  }
}

/* ------------------------------------------------------------------ */
/* Resolver                                                             */
/* ------------------------------------------------------------------ */

export function createReportGenerator(
  baseUrl: string,
  model: string,
  timeoutMs: number
): ReportGenerator {
  const fallback = new TemplateGenerator();
  return new OllamaGenerator(baseUrl, model, timeoutMs, fallback);
}
