import { describe, expect, it } from 'vitest';
import { exerciseSchema, patientSchema, sessionSchema } from '../src/index';

describe('shared package smoke (validator schemas load)', () => {
  it('exports runtime validator schemas', () => {
    expect(sessionSchema).toBeDefined();
    expect(patientSchema).toBeDefined();
    expect(exerciseSchema).toBeDefined();
  });

  it('sessionSchema accepts a valid session and rejects a bad one', () => {
    const valid = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      patient_id: '650e8400-e29b-41d4-a716-446655440000',
      routine_id: null,
      exercise_id: '750e8400-e29b-41d4-a716-446655440000',
      threshold_version_id: '850e8400-e29b-41d4-a716-446655440000',
      started_at: '2026-01-01T00:00:00.000Z',
      ended_at: '2026-01-01T00:01:00.000Z',
      duration_ms: 60000,
      pain_score: null,
      rpe: null,
      sets: [],
      created_at: '2026-01-01T00:00:00.000Z',
    };
    expect(sessionSchema.safeParse(valid).success).toBe(true);
    expect(sessionSchema.safeParse({ ...valid, duration_ms: -5 }).success).toBe(false);
  });
});
