import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Base primitives                                                    */
/* ------------------------------------------------------------------ */

export const uuidSchema = z.string().uuid();
export const isoTimestampSchema = z.string().datetime({ offset: true }).brand('UTC');

export type Id = z.infer<typeof uuidSchema>;
export type UtcTimestamp = z.infer<typeof isoTimestampSchema>;

/* ------------------------------------------------------------------ */
/* Patients                                                           */
/* ------------------------------------------------------------------ */

export const patientSchema = z.object({
  id: uuidSchema,
  created_at: isoTimestampSchema,
  name: z.string().min(1).max(200),
  pseudonymous_id: z.string().min(1).max(50),
  notes: z.string().max(2000).default(''),
});

export type Patient = z.infer<typeof patientSchema>;

export const createPatientSchema = patientSchema.omit({ id: true, created_at: true });
export type CreatePatient = z.infer<typeof createPatientSchema>;

export const updatePatientSchema = patientSchema
  .pick({ name: true, pseudonymous_id: true, notes: true })
  .partial();
export type UpdatePatient = z.infer<typeof updatePatientSchema>;

/* ------------------------------------------------------------------ */
/* Exercises                                                          */
/* ------------------------------------------------------------------ */

export const cameraViewSchema = z.enum(['frontal', 'sagittal', 'either']);
export type CameraView = z.infer<typeof cameraViewSchema>;

export const exerciseSchema = z.object({
  id: uuidSchema,
  key: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  view: cameraViewSchema,
  target_reps: z.number().int().positive().default(10),
  target_sets: z.number().int().positive().default(3),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type Exercise = z.infer<typeof exerciseSchema>;

export const createExerciseSchema = exerciseSchema
  .omit({ id: true, created_at: true, updated_at: true })
  .strict();
export type CreateExercise = z.infer<typeof createExerciseSchema>;

export const updateExerciseSchema = exerciseSchema
  .pick({ name: true, view: true, target_reps: true, target_sets: true })
  .partial()
  .strict();
export type UpdateExercise = z.infer<typeof updateExerciseSchema>;

/* ------------------------------------------------------------------ */
/* Thresholds (exercise-specific, versioned)                         */
/* ------------------------------------------------------------------ */

export const squatThresholdsSchema = z.object({
  // Frontal-plane valgus index threshold (% of leg length). See docs/KINEMATICS.md
  kneeValgusMaxPercent: z.number().min(0).max(100).default(8),
  // Knee flexion at bottom (degrees). Depth fault if below.
  minKneeFlexionDeg: z.number().min(0).max(160).default(100),
  // Max forward trunk lean (degrees from vertical).
  maxTrunkLeanDeg: z.number().min(0).max(90).default(35),
  // Left/right asymmetry tolerance (degrees difference between limbs).
  maxAsymmetryDeg: z.number().min(0).max(60).default(10),
  // Minimum rep duration (ms) to count a rep.
  minRepDurationMs: z.number().int().positive().default(800),
  // Minimum range of motion (degrees) to count a rep.
  minRepRomDeg: z.number().int().positive().default(40),
  // Hysteresis band (degrees) on the primary angle to prevent double count.
  hysteresisDeg: z.number().int().positive().default(5),
});

export type SquatThresholds = z.infer<typeof squatThresholdsSchema>;

export const shoulderExternalRotationThresholdsSchema = z.object({
  targetElbowFlexionDeg: z.number().min(0).max(180).default(90),
  maxElbowFlexionDeviationDeg: z.number().min(0).max(60).default(15),
  maxElbowDriftCm: z.number().min(0).max(50).default(8),
  maxShoulderElevationDeg: z.number().min(0).max(60).default(12),
  minForearmRotationDeg: z.number().min(0).max(180).default(60),
  minRepDurationMs: z.number().int().positive().default(800),
  minRepRomDeg: z.number().int().positive().default(30),
  hysteresisDeg: z.number().int().positive().default(5),
});

export type ShoulderExternalRotationThresholds = z.infer<
  typeof shoulderExternalRotationThresholdsSchema
>;

export const exerciseThresholdsSchema = z.union([
  squatThresholdsSchema,
  shoulderExternalRotationThresholdsSchema,
]);

export type ExerciseThresholds = z.infer<typeof exerciseThresholdsSchema>;

/** Narrow thresholds to the squat shape (exercise_id determines interpretation at runtime). */
export function isSquatThresholds(t: ExerciseThresholds): t is SquatThresholds {
  return 'kneeValgusMaxPercent' in t;
}

export const exerciseThresholdVersionSchema = z.object({
  id: uuidSchema,
  exercise_id: uuidSchema,
  version: z.number().int().positive(),
  thresholds: exerciseThresholdsSchema,
  created_at: isoTimestampSchema,
});

export type ExerciseThresholdVersion = z.infer<typeof exerciseThresholdVersionSchema>;

/* ------------------------------------------------------------------ */
/* Routines                                                           */
/* ------------------------------------------------------------------ */

export const routineSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(200),
  created_at: isoTimestampSchema,
});

export type Routine = z.infer<typeof routineSchema>;

export const routineItemSchema = z.object({
  id: uuidSchema,
  routine_id: uuidSchema,
  exercise_id: uuidSchema,
  order_index: z.number().int().min(0),
  sets: z.number().int().positive().default(3),
  reps: z.number().int().positive().default(10),
});

export type RoutineItem = z.infer<typeof routineItemSchema>;

export const patientRoutineSchema = z.object({
  id: uuidSchema,
  patient_id: uuidSchema,
  routine_id: uuidSchema,
  assigned_at: isoTimestampSchema,
});

export type PatientRoutine = z.infer<typeof patientRoutineSchema>;

/* ------------------------------------------------------------------ */
/* Sessions / sets / reps / faults (numbers-only summary)            */
/* ------------------------------------------------------------------ */

export const faultTypeSchema = z.enum([
  'knee-valgus',
  'insufficient-depth',
  'excessive-trunk-lean',
  'asymmetry',
  'too-fast-descent',
  'elbow-drift',
  'shrugging',
  'insufficient-range',
  'elbow-angle-deviation',
]);
export type FaultType = z.infer<typeof faultTypeSchema>;

export const repRecordSchema = z.object({
  id: uuidSchema.optional(),
  rep_index: z.number().int().min(0),
  started_at: isoTimestampSchema,
  ended_at: isoTimestampSchema,
  duration_ms: z.number().int().nonnegative(),
  min_angle_deg: z.number().nullable(),
  max_angle_deg: z.number().nullable(),
  rom_deg: z.number().nonnegative(),
  peak_velocity_deg_per_s: z.number().nonnegative(),
  faults: z.array(faultTypeSchema).default([]),
});

export type RepRecord = z.infer<typeof repRecordSchema>;

export const sessionSetSchema = z.object({
  id: uuidSchema.optional(),
  set_index: z.number().int().min(0),
  started_at: isoTimestampSchema,
  ended_at: isoTimestampSchema,
  reps: z.array(repRecordSchema).default([]),
});

export type SessionSet = z.infer<typeof sessionSetSchema>;

export const sessionSummarySchema = z.object({
  patient_id: uuidSchema,
  routine_id: uuidSchema.nullable(),
  exercise_id: uuidSchema,
  threshold_version_id: uuidSchema,
  started_at: isoTimestampSchema,
  ended_at: isoTimestampSchema,
  duration_ms: z.number().int().nonnegative(),
  pain_score: z.number().int().min(0).max(10).nullable(),
  rpe: z.number().int().min(0).max(10).nullable(),
  sets: z.array(sessionSetSchema).default([]),
});

export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const sessionSchema = sessionSummarySchema.extend({
  id: uuidSchema,
  created_at: isoTimestampSchema,
});

export type Session = z.infer<typeof sessionSchema>;

export const faultEventSchema = z.object({
  id: uuidSchema,
  rep_id: uuidSchema.nullable(),
  set_index: z.number().int().min(0),
  fault_type: faultTypeSchema,
  timestamp_ms: z.number().int().nonnegative(),
  cue: z.string().min(1).max(300),
});

export type FaultEvent = z.infer<typeof faultEventSchema>;

/* ------------------------------------------------------------------ */
/* Reports                                                            */
/* ------------------------------------------------------------------ */

export const reportGeneratorSchema = z.enum(['ollama', 'template']);
export type ReportGenerator = z.infer<typeof reportGeneratorSchema>;

export const reportStatusSchema = z.enum(['draft', 'reviewed', 'archived']);
export type ReportStatus = z.infer<typeof reportStatusSchema>;

export const reportSchema = z.object({
  id: uuidSchema,
  session_id: uuidSchema,
  generator: reportGeneratorSchema,
  model: z.string().min(1).default('template'),
  status: reportStatusSchema.default('draft'),
  content_json: z.record(z.string(), z.unknown()),
  validation_result: z
    .object({
      passed: z.boolean(),
      details: z.array(z.string()).default([]),
    })
    .default({ passed: true, details: [] }),
  created_at: isoTimestampSchema,
  reviewed_at: isoTimestampSchema.nullable(),
  reviewed_by: z.string().nullable(),
});

export type Report = z.infer<typeof reportSchema>;

/* ------------------------------------------------------------------ */
/* Pagination                                                         */
/* ------------------------------------------------------------------ */

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginatedSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    page: z.number().int().positive(),
    page_size: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    total_pages: z.number().int().nonnegative(),
  });

export type Paginated<T> = {
  data: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

/* ------------------------------------------------------------------ */
/* API error envelope                                                 */
/* ------------------------------------------------------------------ */

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/* ------------------------------------------------------------------ */
/* Ollama report request                                              */
/* ------------------------------------------------------------------ */

export const generateReportRequestSchema = z.object({
  session_id: uuidSchema,
  model: z.string().min(1).optional(),
});

export type GenerateReportRequest = z.infer<typeof generateReportRequestSchema>;
