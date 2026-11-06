# KinetiCare — Design System

## Feel (5-8 sentences)

KinetiCare is a clinical tool used by physiotherapists and patients. It should feel calm, precise, trustworthy, and quietly premium — like well-made medical/health software, never a marketing landing page. The live-session screen is the hero: video and skeleton overlay dominate, metrics are compact and legible, controls are large and reachable. Numbers use tabular numerals so they never jitter. Microcopy is clinical, plain, specific, and kind — no exclamation marks, no emoji, no "AI sparkle" iconography. Motion is minimal and purposeful (state transitions, a single rep-count pulse), respecting `prefers-reduced-motion`. Dark theme on the live session (low-glare, camera-friendly); light theme elsewhere; full light/dark support throughout.

## Design principles

1. Privacy first: every screen reinforces that video never leaves the device.
2. Clarity over decoration: one considered accent, restrained neutrals, semantic colors paired with icons/text (never color alone).
3. Dense data is legible: tabular numerals, axis labels, units, accessible summaries beside charts.
4. Consistent rhythm: 4/8px spacing, modular type scale, consistent border radius/shadows.
5. Accessible by default: WCAG 2.2 AA, visible focus rings, full keyboard navigation, ARIA live regions (polite for rep counts, throttled assertive for faults), 44px touch targets.
6. No anti-patterns: no gradient blobs, no glassmorphism, no uniform drop-shadow cards, no placeholder avatars, no lorem ipsum, no fake metrics.

## Token set (CSS variables, `:root` and `.dark`)

### Colors (HSL-based, color-blind safe)

Neutrals:

- `--color-slate-900` / `--color-slate-50`: surfaces, text
- `--color-slate-700`, `--color-slate-400`: secondary text, borders

Accent (considered, single):

- `--color-indigo-600` / `--color-indigo-50`

Semantic (paired with icon/text):

- `--color-ok-600` (green), `--color-warn-600` (amber), `--color-fault-600` (red-orange), `--color-info-600` (blue)

Each semantic has light/dark variants with WCAG AA contrast against the corresponding surface.

### Type scale (modular, rem)

- `--text-xs` 0.75rem / `--text-xs-lh` 1.125rem — captions, overlines
- `--text-sm` 0.875rem / `--text-sm-lh` 1.25rem — helper text, labels
- `--text-base` 1rem / `--text-base-lh` 1.5rem — body
- `--text-lg` 1.125rem / `--text-lg-lh` 1.375rem — small headings
- `--text-xl` 1.25rem / `--text-xl-lh` 1.5rem — page headings
- `--text-2xl` 1.5rem / `--text-2xl-lh` 1.375rem — section headings
- `--text-metric` 1.5rem tabular-nums — live metrics (hero numbers)

### Spacing scale (4/8px rhythm)

- `--space-1` 0.25rem … `--space-12` 3rem

### Radius / shadows

- `--radius-sm` 0.25rem, `--radius` 0.5rem, `--radius-lg` 0.75rem
- `--shadow-sm` / `--shadow` restrained, used sparingly (no glow everywhere)

### Fonts

- `--font-sans`: Inter (self-hosted, fontsource)
- `--font-mono`: Fira Code (self-hosted, tabular figures for metrics)

## Component inventory

- `Button` (primary, secondary, ghost, danger; 44px min), `Input`, `Label`, `ErrorMessage`, `Card`, `Badge`, `Skeleton`, `PageHeader`, `AppShell` (nav + content), `NavItem`, `Metric` (label + tabular number + unit), `Gauge`, `FaultBanner`, `Cue`, `SkeletonOverlay` (canvas skeleton), `CameraView`, `DiagnosticsPanel`, `Chart` (recharts wrapper with alt summary table), `ReportViewer`, `PrintButton`, `PrivacyPanel`.

## Rules enforced in code

- All colors come from CSS tokens; a grep/lint test fails on raw hex colors outside `apps/web/src/styles/tokens.css`.
- Typography uses the type scale; no `font-size` magic numbers in components.
- Spacing uses the spacing scale; no margin/padding magic numbers.
- Dark theme class `.dark` toggled on `<html>`, persisted in localStorage, respects `prefers-color-scheme` default.
