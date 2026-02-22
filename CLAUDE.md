# The Character Sheet — Project Context

## What This Is
A web-based self-reflection tool styled as a life character sheet. It combines the structural wisdom of tabletop RPG character sheets (particularly D&D) with the rigour of psychological science. The creator is a Psychology professor.

## Philosophy
- **Infinite Game**: Inspired by James Carse. Life is not a game you win — it's a game you play well, for as long as you can. There is no total score, no winning condition. The sheet is for awareness, not optimisation.
- **Stoic Lens**: Some attributes (Mind, Spirit, Discipline, Resilience) are closer to what the Stoics called virtue — things within your control. Others (Body, Standing, Joy) are "preferred indifferents" — worth pursuing but subject to fate. Heart sits between. The measure of a life is how you relate to your scores, not the scores themselves.
- **No gamification**: Despite the RPG structural inspiration, the tone is serious self-reflection. No XP, no leveling, no achievements. Warm and inviting, but not gamey.
- **Philosophy not branding**: The Infinite Game and Stoic frameworks inform the language and tone but are NOT explicitly named in user-facing text. Don't add references to "Infinite Game" or "Stoics" in the tutorial or UI — use them as the underlying philosophy that shapes how things are written.

## Architecture
- **Single HTML file** (`character-sheet.html`) — no server, no build step, no dependencies
- Runs locally in Chrome (primary target) and mobile browsers
- Data persistence: localStorage (primary, for seamless mobile use) + JSON file export/import (for backup, transfer, and versioning)
- All CSS and JS are inline in the single HTML file
- Approximately 3300 lines, ~105KB

## Four Views

The app has four views, controlled by adding/removing an `.active` class on their container divs. Only one should be active at a time (except `#calculating-view` which overlays as a fixed overlay).

1. **Tutorial (`#tutorial-view`)** — Five scrollable pages: Welcome, How It Works, The Eight Attributes (with preview cards), The 1-20 Scale (with color-coded table), Let's Begin (name/age/gender input). Horizontal paging via `scrollToPage()`. Skip link always visible.
2. **Edit (`#edit-view`)** — Profile section + section-based navigation. Sections: Personality (BFI-10 one item at a time), then one per attribute (intro → one sub-scale at a time), then Abilities. Previous/Next buttons on each section. Header buttons: View Sheet, Export, Import, Guide, AI Prompt.
3. **Calculating (`#calculating-view`)** — Full-screen fixed overlay with a spinner and four sequential text steps that animate in. Plays for ~3 seconds before revealing the sheet. Triggered by `viewSheet()`.
4. **Sheet (`#sheet-view`)** — The final character sheet. Radar chart, profile info, expandable score cards with spectrum bars, Big Five personality display with full descriptions, abilities grid. Action buttons: Edit, Export, Import, Guide, Print, AI Prompt.

## Init Logic
- Saved data in localStorage → straight to Sheet view
- No saved data → Tutorial view
- "Guide" button on both Edit and Sheet views allows re-reading the tutorial at any time

## Core Data Model

### Profile
- Name, age, gender, occupation, location, relationship status, profile picture (base64)

### Eight Core Attributes (1-20 scale)
Each has sub-scores that auto-average to produce the main score (user can manually override).

1. **Body** — Health, Strength, Agility, Stamina, Vitality, Rest
2. **Mind** — Mental Health, Clarity, Emotional Regulation, Learning, Creativity
3. **Spirit** — Purpose, Integrity, Self-Acceptance, Gratitude, Practice
4. **Heart** — Partner, Family, Friendships, Community, Giving
5. **Standing** — Career, Wealth, Reputation, Home
6. **Resilience** — Adversity Tolerance, Recovery, Adaptability, Grit
7. **Discipline** — Habits, Follow-Through, Impulse Control, Time Management
8. **Joy** — Pleasure, Play, Humour, Flow, Savouring

### Personality (Big Five / OCEAN)
Uses the BFI-10 (Rammstedt & John, 2007) — a validated 10-item instrument.
Produces scores for: Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism.
Displayed on the sheet with full trait names, descriptions, level labels (Low/Moderate/High), and interpretations.

### Abilities
User-defined skills/competencies. Each has:
- Name (free text)
- Score (1-20)
- Linked attribute(s) (one or two of the eight core attributes)
- Status: Active or Dormant

## The 1-20 Scale and Color System

The code uses an 8-tier color system (the Guide separates 20 as "Legendary" conceptually, but the code groups 18-20 together):

| Score | Label | CSS Variable | Color |
|-------|-------|-------------|-------|
| 1-4 | Critical | `--color-critical` | Red (#DC2626) |
| 5-7 | Struggling | `--color-struggling` | Orange (#EA580C) |
| 8-9 | Below Average | `--color-below` | Amber (#D97706) |
| 10-11 | Average | `--color-average` | Grey (#9CA3AF) |
| 12-13 | Above Average | `--color-above` | Yellow-green (#65A30D) |
| 14-15 | Strong | `--color-strong` | Green (#16A34A) |
| 16-17 | Excellent | `--color-excellent` | Teal (#059669) |
| 18-20 | Exceptional | `--color-exceptional` | Deep emerald (#047857) |

These colors are used consistently everywhere: spectrum bars, score labels, sub-score displays, radar chart data polygon, and the tutorial scale table. They are defined as CSS custom properties in `:root` and referenced via `var(--color-*)`. The `getScoreInfo(score)` function returns `{ label, color }` for any score value.

10 is average (not a failing grade). Nobody has 20s across the board. Scores move over time.

## Key JavaScript Patterns

### The `app` object
All application logic lives on a single `app` object literal. Methods are called as `app.methodName()` from onclick handlers.

### The `ATTRIBUTES` array
Defines all 8 attributes with: `key`, `name`, `tagline`, `description`, `prompt`, and `subScores[]` (each with `key`, `name`, `description`). This is the single source of truth for attribute metadata — the guide content is embedded here.

### The `state` object
```
state = {
  profile: { name, age, gender, occupation, location, relationship, photo },
  scores: { body: 10, mind: 10, ... },       // main attribute scores
  subScores: { health: 10, strength: 10, ... }, // all sub-scores by key
  overrides: { body: false, mind: false, ... }, // whether main score is manually set
  bfiResponses: { 0: 3, 1: 3, ... },          // BFI-10 responses (1-5)
  abilities: [{ name, score, linked, status }]
}
```

### Targeted DOM updates (IMPORTANT)
Previous versions had a bug where any small change (BFI button click, ability add/remove, sub-score change) would rebuild the entire edit view, losing scroll position and causing jank. This was fixed by using targeted update methods:

- `refreshAttributeMainScore(attrKey)` — updates just the main score display for one attribute
- `refreshAbilitiesSection()` — rebuilds just the abilities list
- `updateBFI(index, value)` — updates just the clicked button's styling, no rebuild
- `updateSubScore(subKey, value, attrKey)` — updates sub-score display and recalculates the parent attribute

**Do NOT call `renderSections()` from within update handlers.** Only call it when you need a full rebuild (e.g., after loading data).

### Section navigation
`currentSection` tracks which edit section is visible (-1 = Profile, 0 = Personality, 1-8 = attributes, 9 = Abilities). Within Personality, `currentBFIStep` tracks -1 (intro) or 0–9 (individual BFI items). Within attributes, `currentSubStep` tracks 0 (intro) or 1..N (sub-scale index). `showSection(index)` manages visibility. `renderSections()` rebuilds all sections and then calls `showSection(currentSection)` — not `showSection(0)`.

### Color-coded section nav dots
The `#section-nav` bar shows one dot per section. Each attribute dot is colored using the score's CSS color variable via `getScoreInfo()`. Dots update live as scores change via `refreshAttributeMainScore(attrKey)`.

### Auto-save
`save()` is called on a 500ms debounce via `scheduleSave()`. Most input handlers call `scheduleSave()`. The `viewSheet()` method calls `save()` directly before starting the calculating animation.

### AI Prompt Modal (`#prompt-modal`)
A modal overlay (same `display: none` / `.active` pattern as `#calculating-view`) that generates a plain-text prompt users can copy into any AI assistant. Key methods:
- `generatePromptText()` — builds the full prompt as a plain string using `textContent` (not innerHTML). Includes: tool context, scale definitions, profile, all 8 attributes + sub-scores, Big Five personality (from `calculateBFIScores()`), abilities (active/dormant split), and narrative writing instructions.
- `showPromptModal()` — sets `textContent` on `#prompt-text-display`, stores prompt in `modal.dataset.promptText`, adds `.active`, locks body scroll.
- `hidePromptModal()` — removes `.active`, restores body scroll.
- `handlePromptBackdropClick(event)` — closes on backdrop click using `event.target === event.currentTarget` guard.
- `copyPrompt()` — uses `navigator.clipboard.writeText()` with `_copyFallback()` (textarea + execCommand) for file:// contexts. Shows "Copied to clipboard" fade-in for 3s.
- The generated prompt instructs the AI to write a second-person character study (~400–600 words), in flowing prose, warm but honest, noticing tensions/contradictions across attributes, without moralizing or prescribing action.

### localStorage key
Data is stored under `'charactersheet-data'` as JSON with a `version` field.

## Design Language
- **Fonts**: Georgia (serif, for body text), system sans-serif for labels and UI
- **Colors**: Warm brown accent (#8B6F47), deep slate (#4A5568), charcoal text (#2D2D2D), warm pale backgrounds. Score colors as described above.
- **Tone**: Serious, warm, thoughtful. Like a well-designed journal, not a web app.
- **No emojis, no gamification chrome, no dark mode (yet)**
- **Spectrum bars**: Gradient background showing all 8 color zones at 25% opacity with a positioned colored marker dot indicating the score. Used in sheet score cards and sub-score displays.

## Key Files
- `character-sheet.html` — The app (single file, all-in-one)
- `The Character Sheet - Guide.md` — The full rulebook/guide document (reference for all attribute descriptions, reflection prompts, and sub-score explanations)
- `The Character Sheet - A Guide to Knowing Yourself.docx` — Word doc version of the guide
- `CLAUDE.md` — This file (project context for AI assistants)

## Development Notes
- The HTML file should remain a single file for simplicity and portability
- Radar chart is drawn with Canvas 2D API (no library), 600px canvas, maxR=180, label offset 60px to avoid label clipping
- All validated psychological instruments (BFI-10) must use the exact published items and scoring
- The guide content (descriptions, prompts, reflection questions) should stay in sync between the HTML app and the markdown guide
- Mobile-responsive design is required
- Print stylesheet should produce a clean single-page character sheet
- The `#calculating-view` must NOT have `display: flex` in its base CSS rule — it must stay `display: none` until `.active` is added. The flex layout is defined only on `#calculating-view.active`.
- The same pattern applies to `#prompt-modal` — `display: none` at base, `display: flex` only on `#prompt-modal.active`. Do not break this.
- Live slider score labels: sub-score sliders in the edit flow update a color-coded label in real time via `oninput`. The label text and color come from `getScoreInfo()` and are applied inline.

## What Has Been Built (as of 2026-02-22)
Beyond the initial commit, the following features have been added in development sessions:

- **Security & robustness fixes** — XSS-safe rendering, input validation, CSP-compatible event patterns
- **Radar chart fix** — corrected oval distortion; canvas now renders a proper octagonal polygon
- **Live score labels** — sub-score sliders show a real-time color-coded label as the user drags
- **Guided edit flow** — one sub-scale at a time with attribute intros; one BFI item at a time; intro/outro screens per attribute; Previous/Next navigation throughout
- **Profile section** — full profile edit in the flow (name, age, gender, occupation, location, relationship status, photo)
- **Color-coded nav dots** — section nav dots update live to reflect current attribute scores
- **AI Prompt Generator** — modal with generated plain-text prompt for paste into any AI assistant; "AI Prompt" button on both sheet and edit views

## Future Directions (not yet implemented)
- Validated scales for core attributes (PHQ-9, GAD-7, BRS, etc.) — replacing self-assessment with psychometric instruments
- Historical tracking — comparing multiple saves over time, showing trajectory
- Anxiety and Luck as optional "conditions" or modifiers
- Benchmark tests for physical attributes (push-ups, mile time)
