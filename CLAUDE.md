# The Character Sheet — Project Context

## What This Is
A web-based self-reflection tool styled as a life character sheet. It combines the structural wisdom of tabletop RPG character sheets (particularly D&D) with the rigour of psychological science. The creator is a Psychology professor.

## Philosophy
- **Infinite Game**: Inspired by James Carse. Life is not a game you win — it's a game you play well, for as long as you can. There is no total score, no winning condition. The sheet is for awareness, not optimisation.
- **Stoic Lens**: Some attributes (Mind, Spirit, Discipline, Resilience) are closer to what the Stoics called virtue — things within your control. Others (Body, Standing, Joy) are "preferred indifferents" — worth pursuing but subject to fate. Heart sits between. The measure of a life is how you relate to your scores, not the scores themselves.
- **No gamification**: Despite the RPG structural inspiration, the tone is serious self-reflection. No XP, no leveling, no achievements. Warm and inviting, but not gamey.
- **Philosophy not branding**: The Infinite Game and Stoic frameworks inform the language and tone but are NOT explicitly named in user-facing text. Don't add references to "Infinite Game" or "Stoics" in the tutorial or UI — use them as the underlying philosophy that shapes how things are written.

## Architecture
- **Single HTML file** (`index.html`) — no server, no build step, no dependencies
- Runs locally in Chrome (primary target) and mobile browsers
- Data persistence: localStorage (primary, for seamless mobile use) + JSON file export/import (for backup, transfer, and versioning)
- All CSS and JS are inline in the single HTML file
- Approximately 4300 lines, ~140KB

## Four Views

The app has four views, controlled by adding/removing an `.active` class on their container divs. Only one should be active at a time (except `#calculating-view` which overlays as a fixed overlay).

1. **Tutorial (`#tutorial-view`)** — Five scrollable pages: Welcome, How It Works, The Eight Attributes (with preview cards), The 1-20 Scale (with color-coded table), Ready (no name/age form — user just clicks Create). Horizontal paging via `scrollToPage()`. Skip link always visible. `skipTutorial()` routes returning users (has localStorage data) to Sheet view, new users to Edit view.
2. **Edit (`#edit-view`)** — Has two modes toggled by a Guided/Quick button in the header. Header buttons: mode toggle, View Sheet, Export, Import, Guide, AI Prompt.
   - **Guided mode**: one sub-scale at a time with attribute intros, descriptions, reflection prompts, Previous/Next navigation. After the last sub-score step, a score reveal step shows the auto-calculated main score and all sub-scores before advancing. BFI personality shows one item at a time.
   - **Quick mode**: all sub-scores for an attribute on one screen with sliders; all 10 BFI items on one screen; profile and abilities same as guided.
3. **Calculating (`#calculating-view`)** — Full-screen fixed overlay with a spinner and four sequential text steps that animate in. Plays for ~3 seconds before revealing the sheet. Triggered by `viewSheet()`.
4. **Sheet (`#sheet-view`)** — The final character sheet. Sidebar (profile + actions) + main content (score cards, personality, abilities). Score cards have a spectrum bar with a coloured marker dot, clickable to expand sub-scores. Action buttons: Edit, Export, Import, Guide, Print (hidden on mobile), AI Prompt.

## Init Logic
- Saved data in localStorage → `loadFromStorage()` → `showSheet()`
- No saved data → `showTutorial()`
- "Guide" button on both Edit and Sheet views allows re-reading the tutorial at any time
- `skipTutorial()`: if saved data exists → `showSheet()`; if new user → `showEdit()` + `buildEditView(true)`

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
Displayed on the sheet with full trait names, descriptions, level labels (Low/Moderate/High), and interpretations. Per-trait subtle background tints (neutral, non-judgmental colours).

### Abilities
User-defined skills/competencies. Each has:
- Name (free text)
- Score (1-20)
- Linked attribute (one of the eight core attributes)
- Status: Active or Dormant

## The 1-20 Scale and Color System

The code uses an 8-tier color system:

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

These colors are used consistently everywhere: spectrum bars, score labels, sub-score displays, and the tutorial scale table. They are defined as CSS custom properties in `:root` and referenced via `var(--color-*)`. The `getScoreInfo(score)` function returns `{ label, color }` for any score value.

**Spectrum bar gradient**: Colour zone widths are precisely proportional — calculated as `(score-1)/19*100` at each tier boundary. Hard-stop gradient transitions (no blending). Opacity 0.45 on spectrum bar and ability card spectrum. Marker dot is 14px with a 2.5px white border.

10 is average (not a failing grade). Nobody has 20s across the board. Scores move over time.

## Key JavaScript Patterns

### The `app` object
All application logic lives on a single `app` object literal. Methods are called as `app.methodName()` from onclick handlers.

### The `ATTRIBUTES` array
Defines all 8 attributes with: `key`, `name`, `tagline`, `description`, `prompt`, and `subScores[]` (each with `key`, `name`, `desc`). The `desc` field contains HTML including `<br><br><span class="scale-anchors">` with scale anchor examples at the end. In Quick mode, only the part before `<br>` is shown (short desc).

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

### Global variables
```
let currentSection = -1; // -1 = Profile, 0 = Personality, 1-8 = attributes, 9 = Abilities
let currentSubStep = 0;  // 0 = intro, 1..N = sub-scale, N+1 = score reveal step
let currentBFIStep = -1; // -1 = BFI intro, 0-9 = individual BFI items (guided only)
let editMode = 'guided'; // 'guided' | 'quick' — saved in localStorage
let saveTimeout = null;
let GLOBAL_STEP_MAP = null; // built once by buildGlobalStepMap()
```

### Edit Mode (Guided vs Quick)
Toggled by `setEditMode('guided'|'quick')` which calls `renderSections()` to rebuild. Mode saved to localStorage as `editMode` in the character data.
- **New users** (`buildEditView(true)`) always start in Guided mode.
- **Returning users** (loaded from storage): `editMode = data.editMode !== undefined ? data.editMode : 'quick'`. Old saves without a saved mode preference default to Quick.
- `renderSections()` calls `renderQuickAttributeSection()` / `renderQuickPersonalitySection()` in quick mode, or the guided variants in guided mode.
- `_updateModeToggle()` updates the active class on the header toggle buttons.

### Guided edit flow — sub-step navigation
Within an attribute section:
- `currentSubStep = 0` → intro screen (description + reflection prompt)
- `currentSubStep = 1..N` → individual sub-score slider steps
- `currentSubStep = N+1` → **score reveal step** (shows main score large + all sub-score summary; "Continue" advances to next attribute)

`showSubStep(index)` swaps `.attribute-step-content` innerHTML via fade animation.
`stepForward()` / `stepBack()` handle all transitions including the reveal step.

When stepping back from an attribute's intro into the previous attribute, it lands on the previous attribute's score reveal step (index N+1), not the last sub-score.

### Targeted DOM updates (IMPORTANT)
**Do NOT call `renderSections()` from within update handlers.** Use targeted methods:

- `refreshAttributeMainScore(attrKey)` — updates the `#main-score-${attrKey}` div content (exists in Quick mode sections and in the Guided score reveal step)
- `refreshAbilitiesSection()` — rebuilds just the abilities list
- `updateBFI(index, value)` — in guided mode, toggles selected class on the 5 visible buttons; in quick mode, detects `data-bfi-item` attributes and only updates the correct row
- `updateSubScore(subKey, value)` — updates value/label spans via `data-subkey-value`/`data-subkey-label` selectors and calls `refreshAttributeMainScore`
- `updateAbilityScore(index, value)` — updates `data-ability-value`/`data-ability-label` spans

### Section navigation
`showSection(index)` activates the section and resets sub-step state. `renderSections()` rebuilds all sections then calls `showSection(currentSection)`. In guided mode only, restores non-zero BFI or sub-step after rebuild.

### Section nav (`.section-nav`)
Fixed buttons for Profile, Personality, each attribute (with attribute colour `--btn-accent`), and Abilities. The nav dot (`.nav-attr-dot`) uses the attribute's accent colour (fixed, not score-based). Clicking any nav button calls `showSection(index)`, which in quick mode jumps directly to that section (no sub-step progression needed).

### Auto-save
`autoSave()` is called on a 500ms debounce via `scheduleSave()`. Most input handlers call `scheduleSave()`. The `viewSheet()` method calls `save()` directly.

### localStorage data structure
```json
{
  "version": 1,
  "profile": { "name": "...", "age": "", "gender": "", "occupation": "", "location": "", "relationship": "", "photo": null },
  "scores": { "body": 10, ... },
  "subScores": { "health": 10, ... },
  "overrides": { "body": false, ... },
  "bfiResponses": { "0": 3, ... },
  "abilities": [...],
  "editMode": "quick"
}
```

Back-fill in `loadFromStorage()` and `handleImport()`: occupation/location/relationship default to `''`; BFI responses default to 3; all attribute scores default to 10.

### AI Prompt Modal (`#prompt-modal`)
`display: none` base, `display: flex` only on `.active`. Key methods:
- `generatePromptText()` — plain string with profile, all 8 attributes + sub-scores, Big Five, abilities, narrative instructions.
- `showPromptModal()` — populates `#prompt-text-display`, stores in `modal.dataset.promptText`, adds `.active`, locks scroll.
- `copyPrompt()` — `navigator.clipboard.writeText()` with `_copyFallback()` (textarea + execCommand) for file:// contexts.

## Design Language
- **Fonts**: Georgia (serif, for body text), system sans-serif for labels and UI
- **Colors**: Warm brown accent (#8B6F47), deep slate (#4A5568), charcoal text (#2D2D2D), warm pale backgrounds. Score colors as described above.
- **Tone**: Serious, warm, thoughtful. Like a well-designed journal, not a web app.
- **No emojis, no gamification chrome, no dark mode (yet)**
- **Spectrum bars**: Hard-stop gradient with correct proportional color zones; opacity 0.45; 14px marker dot with white border and shadow.
- **Score cards**: No tagline subheading displayed (tagline is stored in ATTRIBUTES but not shown in the sheet card summary — it's only used in the edit flow). Expand to show description, reflection prompt, and sub-score bars.

## Key Files
- `index.html` — The app (single file, all-in-one)
- `radar-demos.html` — Three standalone radar chart designs (Option A: coloured spokes; Option B: score-coloured fill; Option C: minimal node map) for the developer to review and choose from. Not linked from index.html.
- `The Character Sheet - Guide.md` — The full rulebook/guide document
- `The Character Sheet - A Guide to Knowing Yourself.docx` — Word doc version of the guide
- `CLAUDE.md` — This file (project context for AI assistants)

## Development Notes
- The HTML file should remain a single file for simplicity and portability
- No radar chart is currently in index.html — three alternatives are in `radar-demos.html`
- All validated psychological instruments (BFI-10) must use the exact published items and scoring
- Mobile-responsive: primary breakpoint `@media (max-width: 640px)`, secondary `@media (max-width: 380px)`. Print button has `.btn-print-hide` class which is hidden on mobile.
- The `#calculating-view` must NOT have `display: flex` in its base CSS rule — it must stay `display: none` until `.active` is added. The flex layout is defined only on `#calculating-view.active`.
- The same pattern applies to `#prompt-modal` — `display: none` at base, `display: flex` only on `#prompt-modal.active`. Do not break this.
- Live slider score labels: sub-score sliders update color-coded value/label spans in real time via `oninput` calling `updateSubScore()`.
- **JS syntax check**: `node -e "new Function(require('fs').readFileSync('index.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1])"` — run before committing to catch syntax errors fast
- **Git in Bash**: always use `git -C /path/to/repo` or chain commands in a single call — shell state does not persist between Bash tool calls
- **Per-attribute colour variables**: `--attr-{key}` (saturated) and `--attr-{key}-pale` (pale tint) exist in `:root` for all 8 attribute keys; use for themed edit-flow UI elements
- **Ability slider pattern**: `data-ability-value="${i}"` and `data-ability-label="${i}"` on score display spans; updated by `updateAbilityScore(index, value)` without rebuilding the list
- **Print layout**: `#scores-rule { break-before: page }` forces attributes onto page 2; `.score-item-detail-desc` and `.score-item-detail-prompt` are `display: none` in print

## What Has Been Built (as of 2026-02-24)
Beyond the initial commit, the following features have been added in development sessions:

- **Security & robustness fixes** — XSS-safe rendering, input validation, CSP-compatible event patterns
- **Live score labels** — sub-score sliders show a real-time color-coded label as the user drags
- **Guided edit flow** — one sub-scale at a time with attribute intros; one BFI item at a time; intro/outro screens per attribute; Previous/Next navigation throughout; score reveal step after last sub-score
- **Quick edit mode** — all sub-scores for an attribute on one screen; all 10 BFI items at once; mode toggle in header; saved to localStorage; returning users default to Quick
- **Score reveal step** — at the end of each guided attribute section, shows main score large + all sub-score summary before advancing. Score reveal is also the landing point when stepping back into an attribute from the next section.
- **Profile section** — full profile edit in the flow (name, age, gender, occupation, location, relationship status, photo)
- **AI Prompt Generator** — modal with generated plain-text prompt for paste into any AI assistant; "AI Prompt" button on both sheet and edit views
- **Sheet view redesign** — sidebar + main content layout; white score cards with per-attribute left colour border, large score + label, chevron, expandable detail with sub-score bars; no tagline on score cards
- **Pre-reveal transition** — "Take a breath" acknowledgement panel shown after calculating animation; user clicks to reveal the sheet
- **Sheet footer redesign** — reflection lead text + three-column action guide (Export / Import / AI Prompt)
- **Attribute colours in edit flow** — reflect boxes and Begin/Next buttons use `--attr-{key}` and `--attr-{key}-pale` tints per attribute section
- **Abilities overhaul** — range slider replaces number input; card layout in edit view; sheet display uses `.ability-card-sheet` with attribute-coloured left border, spectrum bar, score + tier label; Active/Dormant group labels when both types present
- **Print stylesheet** — deliberate two-page layout: page 1 = profile header, page 2 = all 8 attribute cards with sub-scores (prose hidden to fit)
- **Spectrum bar corrections** — gradient stops now accurately represent proportional score ranges; opacity increased from 0.3 to 0.45; marker dot enlarged to 14px
- **Bug fixes** — `skipTutorial()` routes returning users to Sheet (not edit); `handleImport()` back-fills new profile fields; mobile responsiveness improvements including hidden print button on mobile
- **Radar chart demos** — `radar-demos.html` contains three alternative radar chart designs (Coloured Spokes, Score-Coloured Fill, Minimal Node Map) for the developer to review and integrate

## Future Directions (not yet implemented)
- Radar chart integration into index.html (choose from radar-demos.html)
- Validated scales for core attributes (PHQ-9, GAD-7, BRS, etc.) — replacing self-assessment with psychometric instruments
- Historical tracking — comparing multiple saves over time, showing trajectory
- Anxiety and Luck as optional "conditions" or modifiers
- Benchmark tests for physical attributes (push-ups, mile time)
