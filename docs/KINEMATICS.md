# KinetiCare — Kinematics Notes

## Coordinate choices

- **2D normalized landmarks** (image coordinates, x/y in [0,1], z relative depth) are used for angles computed in the image plane. Pros: stable regardless of subject distance; works with the visible frame. Cons: angles are projection-dependent — a frontal-plane joint viewed at an angle is foreshortened.
- **3D world landmarks** are used where depth adds signal (e.g. trunk lean relative to the camera, forward/backward drift). MediaPipe `PoseLandmarker` returns world landmarks in meters when the model supports it; we fall back to 2D if world landmarks are absent or low visibility.
- All angles are computed from 3D vectors where available, else 2D, with a documented fallback. Degenerate vectors (zero length) return `null`, never `NaN`; callers handle `null` by gating the frame.

## Angle computation

Angle ABC (at B) = angle between BA and BC:

```
cos(theta) = clamp(dot(BA, BC) / (|BA| * |BC|), -1, 1)
theta = arccos(cos)   // degrees [0, 180]
```

Clamping prevents NaN from float error. Zero-length vectors → `null`.

## Knee valgus — frontal-plane proxy (documented limitation)

KinetiCare does NOT claim clinical-grade accuracy. Valgus is a 3D frontal-plane phenomenon; a single 2D camera view can only estimate it.

Proxy used — **normalized medial knee deviation from the hip–ankle line**:

For the right leg in a frontal (camera-parallel) view:

- H = hip (2D), K = knee (2D), A = ankle (2D), all in image coords.
- Line L = H → A. Perpendicular (signed) distance of K from L:
  `d = cross(A - H, K - H) / |A - H|` (sign indicates medial/lateral side)
- Leg length reference: `legLen = |H - K| + |K - A|` (approx. full leg length).
- **Valgus index** (dimensionless, % of leg length): `vi = |d| / legLen * 100`
- Fault raised when `vi > threshold` (configurable per exercise, default tuned for bodyweight squat).

Alternative (also computed, displayed): **frontal-plane projection angle (FPPA)** angle between thigh vector (H→K) and shin vector (K→A) projected into the frontal plane; deviation from 180° indicates varus/valgus. We use `vi` as the primary fault signal because it's scale-normalized.

Limitations (stated in UI + docs):

- Accurate only when the camera is roughly frontal and the leg is in the frontal plane. Sagittal or oblique views invalidate the proxy.
- 2D projection foreshortens the knee's true medial/lateral position.
- Threshold must be calibrated per camera setup; treat as a relative cue, not a diagnosis.

## Rep state machine

States: `idle -> descending -> bottom -> ascending -> top -> (rep complete) -> idle`.

- Enter `descending` when primary angle crosses downward threshold with hysteresis band.
- `bottom` held while angle within bottom band for min duration.
- `ascending` on upward crossing.
- `top` = start position; rep counted on transition `top -> idle` only if duration >= minRepDuration and ROM >= minROM.
- Aborted/partial reps below min ROM are discarded, not counted.
- Tracking dropout mid-rep → rep marked incomplete; no fault manufactured for missing frames.

## Fatigue indicators (computed from rep records over a set)

1. **ROM decline**: `(firstRepROM - lastRepROM) / firstRepROM` — positive = shrinking range.
2. **Concentric slowdown**: mean peak velocity of last half of reps vs first half — negative change = slowing.
3. **Fault rate**: fault events per rep, trending up across the set.
4. **Asymmetry**: left/right peak-angle difference per rep, averaged; rising = fatigue compensation.

Each indicator has a configured threshold; below threshold → "none" (stable set yields no indicators).

## Testing

All functions are pure: inputs are landmark arrays + timestamps + thresholds; outputs are angles/faults/records. Deterministic synthetic landmark generator (`packages/shared/src/engine/synthetic.ts`) produces parametric squat / shoulder-external-rotation frames with seeded Gaussian noise for offline CI testing. See `docs/TEST_PLAN.md`.
