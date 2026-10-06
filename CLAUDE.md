# The Character Sheet: Project Context

## What This Is
A web-based self-reflection tool styled as a life character sheet. It combines the structural wisdom of tabletop RPG character sheets (particularly D&D) with the rigour of psychological science. The creator is a Psychology professor.

## Philosophy
- **Infinite Game**: Inspired by James Carse. Life is not a game you win. It is a game you play well, for as long as you can. There is no total score, no winning condition. The sheet is for awareness, not optimisation.
- **Stoic Lens**: Some attributes (Mind, Spirit, Discipline, Resilience) are closer to what the Stoics called virtue: things within your control. Others (Body, Standing, Joy) are "preferred indifferents": worth pursuing but subject to fate. Heart sits between. The measure of a life is how you relate to your scores, not the scores themselves.
- **No gamification**: Despite the RPG structural inspiration, the tone is serious self-reflection. No XP, no leveling, no achievements. Warm and inviting, but not gamey.
- **Philosophy not branding**: The Infinite Game and Stoic frameworks inform the language and tone but are NOT explicitly named in user-facing text in the app. Don't add references to "Infinite Game" or "Stoics" in the tutorial or UI. Use them as the underlying philosophy that shapes how things are written. (The written guide does name them; that is intended.)

## Writing Rules (user-facing text)
- **No em dashes** anywhere a user reads: the app, the guide, the README, the AI prompt. Rewrite the sentence with a colon, comma, full stop, or parentheses instead. En dashes are used only inside numeric ranges (1–20, 10–11).
- British/Australian spelling: rigour, optimisation, savouring, humour, journalling, sceptical, moralise.
- `The Character Sheet - Guide.md` is the anchor for wording. When copy changes, change the guide first, then bring the app into line. The `.docx` is generated from the guide with `tools/build-guide-docx.js`.
- Plain, direct sentences. Avoid filler intensifiers ("genuinely", "truly", "really").

## Architecture
- **Single HTML file** (`index.html`): no server, no build step, no dependencies
- Runs locally in Chrome (primary target) and mobile browsers. Deployed with GitHub Pages from `main` at https://mbthompson.github.io/YourCharacterSheet/
- Data persistence: localStorage (primary, for seamless mobile use) + JSON file export/import (for backup, transfer, and versioning)
- All CSS and JS are inline in the single HTML file
- Approximately 5400 lines, ~200KB

## Four Views

The app has four views, switched by `app._showView(id)`, which sets the `.active` class on exactly one of their container divs.

1. **Tutorial (`#tutorial-view`)**: Five full-height pages stacked vertically: Welcome, How It Works, The Eight Attributes (with preview cards), The 1–20 Scale (table built from `SCORE_LABELS` + `SCORE_MEANINGS`), Ready. `scrollToPage()` scrolls between them. A fixed skip button is always visible. `showTutorial(from)` takes `'sheet'` or `'edit'` when the Guide is re-read from those views; the skip and final buttons then return there ("Back to my sheet" / "Back to editing"). On a first visit they create a new sheet and open the Edit view. The Ready page offers "Import it" to first-time visitors who already have a saved file.
2. **Edit (`#edit-view`)**: Two modes toggled by a Guided/Quick button in the header. Header (`.edit-topbar`, sticky, contains the header row and the section nav): mode toggle, View Sheet, then Export, Import, Guide, AI Prompt. Below 860px those last four collapse into a "More" menu (`.more-menu`) and the section nav becomes one horizontally scrolling row.
   - **Guided mode**: one sub-scale at a time with attribute intros, descriptions, scale anchors, reflection prompts, Previous/Next navigation. After the last sub-score step, a score reveal step shows the auto-calculated main score and all sub-scores before advancing. BFI personality shows one item at a time.
   - **Quick mode**: all sub-scores for an attribute on one screen with sliders; all 10 BFI items on one screen; Previous/Next at the foot of every section; profile and abilities same as guided.
3. **Calculating (`#calculating-view`)**: Full-screen fixed overlay with a spinner and four sequential text steps, then the "Take a breath" pre-reveal panel. This plays **once**, the first time a sheet is viewed (`state.revealed` is false). After that `viewSheet()` goes straight to the sheet.
4. **Sheet (`#sheet-view`)**: The final character sheet. Sidebar (profile + actions, sticky on wide screens) + main content (radar chart, score cards, personality, abilities, footer). Action buttons: Edit, Export & share (opens `#share-modal`), Import, Guide, AI Prompt, Print (hidden on mobile). Footer has a "Delete this sheet" link (`resetSheet()`). Under the "Eight Attributes" rule, `#scores-note` says how many sub-scores and statements are still unrated, with a "Finish rating" link.

There are two modals, both `display: none` until `.active`: `#prompt-modal` (AI prompt) and `#share-modal` (Export and share: backup file, image, link, text, print, AI prompt). Escape closes either.

## Init Logic
`init()` is async.
- A `#share=` fragment in the URL (see Sharing) → `enterSharedView()`: the shared sheet is shown read-only, nothing is written to storage, and the person's own sheet is untouched. A fragment that cannot be read is dropped with a toast and init continues normally.
- `loadFromStorage()` returns true if a valid sheet was loaded.
- No sheet (or unreadable storage) → `showTutorial()`
- Sheet with `revealed: true` → `showSheet()`
- Sheet with `revealed: false` (started, never finished) → Edit view, at the saved `lastSection`
- "Guide" button on both Edit and Sheet views allows re-reading the tutorial at any time

## Core Data Model

### Profile
- Name, age, gender, occupation, location, relationship status, profile picture (base64). All optional. An empty name is stored as `''` (older saves used the placeholder `'Character'`, which is converted on load).

### Unanswered state (IMPORTANT)
A new sheet starts blank. A sub-score or BFI response that has not been rated is stored as `null`, never as a default midpoint, so an untouched question cannot be mistaken for a deliberate "average". Rules:
- `getMainScore()` averages only the rated sub-scores and returns `null` when none are rated. `calculateBFIScores()` does the same per trait. `getScoreInfo(null)` returns a neutral grey "Not rated" tier and `getTraitLevel(null)` returns "Not answered".
- A slider is drawn hollow (`.unrated`) at 10 until it is touched; a click, tap or key press counts as a rating (`renderSlider()` wires `oninput`, `onclick` and `onkeyup` to `updateSubScore()`). The guided step's primary button reads "Skip for now" until then, and the step shows `.unrated-hint`.
- Every place a score is displayed must handle `null`: cards show an en dash and no marker, the radar skips the vertex, the prompt and text summary say "not rated" / "not answered". `app.unanswered()` counts what is left and names the first section to return to.
- Legacy saves without a key for some sub-score load as unrated for that sub-score. Manual overrides (`state.scores`) are always numbers.

### Eight Core Attributes (1-20 scale)
Each has sub-scores that auto-average to produce the main score (user can manually override in Quick mode).

1. **Body**: Health, Strength, Agility, Stamina, Vitality, Rest
2. **Mind**: Mental Health, Clarity, Emotional Regulation, Learning, Creativity
3. **Spirit**: Purpose, Integrity, Self-Acceptance, Gratitude, Practice
4. **Heart**: Partner, Family, Friendships, Community, Giving
5. **Standing**: Career, Wealth, Reputation, Home
6. **Resilience**: Adversity Tolerance, Recovery, Adaptability, Grit
7. **Discipline**: Habits, Follow-Through, Impulse Control, Time Management
8. **Joy**: Pleasure, Play, Humour, Flow, Savouring

### Personality (Big Five / OCEAN)
Uses the BFI-10 (Rammstedt & John, 2007), a validated 10-item instrument. Items (`BFI_ITEMS`), reverse-keying, and the five response labels (`BFI_LABELS`: Disagree strongly / Disagree a little / Neither agree nor disagree / Agree a little / Agree strongly) follow the published instrument. Do not reword them.
Produces scores for: Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism, each 1–5 in half-point steps.
`getTraitLevel(score)`: Low = 1–2, Moderate = 2.5–3.5, High = 4–5. The level label and the interpretation text both use this function, so they always agree.

### Abilities
User-defined skills/competencies. Each has:
- Name (free text)
- Score (1-20)
- Linked attribute (one of the eight core attributes, or none)
- Status: Active or Dormant

## The 1-20 Scale and Color System

The code uses an 8-tier color system:

| Score | Label | Key | Bar/dot colour (`--color-{key}`) | Text colour (`--color-{key}-text`) |
|-------|-------|-----|------|------|
| 1-4 | Critical | `critical` | #DC2626 | #B91C1C |
| 5-7 | Struggling | `struggling` | #EA580C | #C2410C |
| 8-9 | Below Average | `below` | #D97706 | #B45309 |
| 10-11 | Average | `average` | #9CA3AF | #5F6673 |
| 12-13 | Above Average | `above` | #65A30D | #4D7C0F |
| 14-15 | Strong | `strong` | #16A34A | #15803D |
| 16-17 | Excellent | `excellent` | #059669 | #047857 |
| 18-20 | Exceptional | `exceptional` | #047857 | #065F46 |

`getScoreInfo(score)` returns `{ key, label, color, text }`. Use `color` for fills (bars, marker dots, chart) and `text` whenever a tier colour is applied to text: the text shades are darker versions of the same hues that meet WCAG AA (4.5:1) on the app's backgrounds. The bright shades do not, so never use them for text.

**Spectrum bar gradient**: defined once as `--spectrum-gradient`. Colour zone widths are precisely proportional, calculated as `(score-1)/19*100` at each tier boundary. Hard-stop gradient transitions (no blending). The band is drawn on a `::before` pseudo-element at opacity 0.45 so that the marker dot on top keeps its full colour. Marker dot is 14px with a 2.5px white border.

10 is average (not a failing grade). Nobody has 20s across the board. Scores move over time.

## Key JavaScript Patterns

### The `app` object
All application logic lives on a single `app` object literal. Methods are called as `app.methodName()` from onclick handlers.

### The `ATTRIBUTES` array
Defines all 8 attributes with: `key`, `name`, `tagline`, `description`, `prompt`, and `subScores[]`. Each sub-score has `key`, `name`, `desc` (plain text, shown in both modes) and `anchors` (three plain-text strings describing a low, middling and high score). `ANCHOR_BANDS` gives the score range and tier colour for each anchor (1–4, 9–12, 18–20). Guided mode renders the anchors as a small list under the description; Quick mode shows `desc` only.

### The `state` object
```
state = {
  profile: { name, age, gender, occupation, location, relationship, photo },
  scores: { body: 10, mind: 10, ... },       // main attribute scores
  subScores: { health: 10, strength: null, ... }, // all sub-scores by key; null = not yet rated
  overrides: { body: false, mind: false, ... }, // whether main score is manually set
  bfiResponses: { 0: 3, 1: null, ... },       // BFI-10 responses (1-5); null = not yet answered
  abilities: [{ name, score, linked, status }],
  updatedAt: '2026-10-05T03:00:00.000Z',      // last change to the sheet's content
  revealed: true                              // the finished sheet has been seen once
}
```

### Global variables
```
let currentSection = -1; // -1 = Profile, 0 = Personality, 1-8 = attributes, 9 = Abilities (LAST_SECTION)
let currentSubStep = 0;  // 0 = intro, 1..N = sub-scale, N+1 = score reveal step
let currentBFIStep = -1; // -1 = BFI intro, 0-9 = individual BFI items (guided only)
let editMode = 'guided'; // 'guided' | 'quick', saved in localStorage
let saveTimeout = null;
```

### Data validation (IMPORTANT)
`normaliseData(data)` is the single gate for everything read from localStorage, an imported file or a share link. It coerces and clamps every score, validates enums (gender, relationship, linked attribute, status), accepts a photo only if it is a base64 `data:image/...` URL, trims and caps strings, and returns `null` if the input does not look like a sheet. Because of this, render code can interpolate `state` numbers directly. **Free-text fields (profile text, ability names) must still go through `escapeHtml()`** when placed in HTML. If you add a field, add it to `normaliseData`, `_applyData`, and `_serialise`.

### Edit Mode (Guided vs Quick)
Toggled by `setEditMode('guided'|'quick')` which calls `renderSections()` to rebuild. Mode saved to localStorage as `editMode` in the character data.
- **New users** (`buildEditView(true)`) always start in Guided mode.
- **Returning users** (loaded from storage): old saves without a saved mode preference default to Quick.
- `renderSections()` re-opens the current section at the current step, so switching modes keeps your place.
- `_updateModeToggle()` updates the active class and `aria-pressed` on the header toggle buttons.

### Guided edit flow: sub-step navigation
Within an attribute section:
- `currentSubStep = 0` → intro screen (description + reflection prompt)
- `currentSubStep = 1..N` → individual sub-score slider steps
- `currentSubStep = N+1` → **score reveal step** (shows main score large + all sub-score summary; "Continue" advances to next attribute)

`showSubStep(index)` / `showBFIStep(index)` swap the step content via `_swapStep()`, which restarts the fade animation and moves keyboard focus to the new step.
`stepForward()` / `stepBack()` handle all transitions including the reveal step. In Quick mode they simply move one section at a time.

When stepping back from an attribute's intro into the previous attribute, it lands on the previous attribute's score reveal step (index N+1), not the last sub-score.

### Targeted DOM updates (IMPORTANT)
**Do NOT call `renderSections()` from within update handlers.** Use targeted methods:

- `refreshAttributeMainScore(attrKey)`: re-renders the `#main-score-${attrKey}` panel (Quick mode) using `renderMainScore(attr)`
- `refreshAbilitiesSection()`: rebuilds just the abilities list using `renderAbilityCards()`
- `updateBFI(index, value)`: both modes tag buttons with `data-bfi-item`/`data-bfi-val`; only that item's buttons change
- `updateSubScore(subKey, value)`: updates value/label spans via `data-subkey-value`/`data-subkey-label`, the slider's `aria-valuetext`, and calls `refreshAttributeMainScore`
- `updateAbilityScore(index, value)`: updates `data-ability-value`/`data-ability-label` spans
- `_refreshPhoto()`: syncs the profile photo control with state

### Section navigation
`showSection(index)` activates the section and resets sub-step state. `_activateSection()` also scrolls the nav strip so the current button is in view on narrow screens. `_scrollToSection()` offsets by the height of `.edit-topbar`.

### Sheet accordions
Score cards and personality cards are `.score-item` elements. The whole top of the card is a `<button class="score-item-toggle" aria-expanded>`; the detail sits outside the button, so selecting or tapping text inside an open card does not close it. `toggleScoreItem(button)` opens both cards of a `.score-item-pair` together when they sit side by side, and only the tapped card when the layout is a single column (it reads the pair's computed grid columns). The detail opens by animating `grid-template-rows` from `0fr` to `1fr`: do not reintroduce `max-height` hacks. `toggleAllScores()` drives the "Show all sub-scores" button.

### Radar chart
`renderRadarChart()` draws on `#radar-canvas` at the canvas's real CSS width and the device pixel ratio, and sets the radius from the widest label so labels never clip on a phone. It reads tier colours from the CSS variables via `cssVar()`. It is redrawn on window resize. The canvas `aria-label` lists the eight scores.

### Auto-save
`autoSave(contentChanged)` debounces `save()` by 500ms. Pass `false` for changes that are not sheet content (edit mode, current section) so they do not move `updatedAt`. `save()` also runs on `pagehide`. The sheet header shows "Last updated {date}" from `state.updatedAt`.

### localStorage data structure
Key: `charactersheet-data` (`STORAGE_KEY`).
```json
{
  "version": 1,
  "profile": { "name": "...", "age": "", "gender": "", "occupation": "", "location": "", "relationship": "", "photo": null },
  "scores": { "body": 10, ... },
  "subScores": { "health": 10, ... },
  "overrides": { "body": false, ... },
  "bfiResponses": { "0": 3, ... },
  "abilities": [...],
  "updatedAt": "2026-10-05T03:00:00.000Z",
  "editMode": "quick",
  "revealed": true,
  "lastSection": -1
}
```
Exported files contain everything up to and including `updatedAt` (no `editMode`, `revealed`, `lastSection`). Missing fields are back-filled by `normaliseData()`; saves from before `revealed` existed are treated as revealed. Importing over an existing sheet asks for confirmation first.

### Sharing (`#share-modal`)
- **Backup file**: `exportData()`, a `.json` download via `_downloadBlob()`; the only export that includes the photo.
- **Image**: `renderSheetImage()` draws the whole sheet (header, radar via `drawRadar()`, attribute cards with sub-scores, personality, abilities) on a 1080px-wide canvas at 2x and crops to the height used. `downloadSheetImage()` saves it; `shareSheetImage()` uses the Web Share API with a File when `navigator.canShare` allows it, else downloads. Buttons marked `.share-only` appear only when `navigator.share` exists (`body.can-share`).
- **Link**: `buildShareLink()` serialises the sheet without the photo, deflates it with `CompressionStream('deflate-raw')` (prefix `z.`; `j.` is plain JSON for browsers without it), base64url-encodes it and appends it as `#share=...`. Nothing is uploaded: the sheet travels inside the URL (about 1KB). `readSharedSheet()` decodes it on load and runs it through `normaliseData()`. A `hashchange` to a share fragment reloads the page so a pasted link opens properly.
- **Shared view**: `enterSharedView()` sets `app.viewingShared`, adds `body.shared-view` (which hides every `.shared-hide` control: Edit, Import, Delete, Finish rating, Add Abilities, the footer action guide) and shows `#shared-banner`. `save()` is a no-op while viewing a shared sheet. "Keep a copy here" (`keepSharedSheet()`) asks before replacing a saved sheet, then saves and strips the fragment; "Back to my sheet" reloads without it.
- **Text**: `sheetAsText()` is a plain-text summary; `_copyText()` wraps the clipboard API with the execCommand fallback and is shared with `copyPrompt()`.
- `_shareConfirm()` shows a status line inside the dialog; `_fileName(ext)` names downloads `character-sheet-{name}-{date}.{ext}`.

### AI Prompt Modal (`#prompt-modal`)
`display: none` base, `display: flex` only on `.active`. Key methods:
- `generatePromptText()`: plain string with profile, all 8 attributes + sub-scores, Big Five, abilities, narrative instructions.
- `showPromptModal()`: populates `#prompt-text-display`, stores in `modal.dataset.promptText`, adds `.active`, locks scroll, focuses the Copy button. Escape or a backdrop click closes it and returns focus.
- `copyPrompt()`: `navigator.clipboard.writeText()` with `_copyFallback()` (textarea + execCommand) for file:// contexts.

## Design Language
- **Fonts**: Georgia (serif, for body text), system sans-serif for labels and UI
- **Colors**: Warm brown accent (#8B6F47; use `--warm-brown-dark` #75603A for small brown text), deep slate (#4A5568), charcoal text (#2D2D2D), warm pale backgrounds. Muted text is `--light-gray` (#6F6A62) and body grey is `--medium-gray` (#595959); both meet 4.5:1. Score colors as described above.
- **Tone**: Serious, warm, thoughtful. Like a well-designed journal, not a web app.
- **No emojis, no gamification chrome, no dark mode (yet)**
- **Touch targets**: controls are at least 40px tall on phones; sliders have a 34px-tall hit area with a 26px thumb.
- **Focus**: every interactive element has a visible `:focus-visible` ring. Clickable things are real `<button>` elements, not divs.
- **Score cards**: No tagline subheading displayed (tagline is stored in ATTRIBUTES but only used in the edit flow and tutorial). Expand to show description, reflection prompt, and sub-score bars.

## Key Files
- `index.html`: the app (single file, all-in-one)
- `The Character Sheet - Guide.md`: the full rulebook/guide document, and the anchor for all wording
- `The Character Sheet - A Guide to Knowing Yourself.docx`: Word version of the guide, generated from the `.md` with docx-js. Regenerate it whenever the guide changes.
- `README.md`: short public description
- `radar-demos.html`: three standalone radar chart designs from when the chart was chosen (Option B, Score-Coloured Fill, is the one now in `index.html`). Not linked from index.html.
- `personality-mockup-a/b/c.html`: mockups from when the personality layout was chosen (Option B is the one in use). Not linked from index.html.
- `tools/build-guide-docx.js`: regenerates the `.docx` from the guide (see `tools/README.md`)
- `tools/test-harness.mjs`: headless-Chrome end-to-end checks and screenshot capture (see `tools/README.md`)
- `CLAUDE.md`: this file (project context for AI assistants)

## Development Notes
- The HTML file should remain a single file for simplicity and portability
- All validated psychological instruments (BFI-10) must use the exact published items, response labels and scoring
- Breakpoints: `max-width: 900px` (sheet sidebar stacks above the main column), `860px` (edit header collapses to the More menu, section nav becomes a scrolling row), `640px` (phone layout: single-column cards, compact header), `380px` (narrowest phones). Print button has `.btn-print-hide` class which is hidden on mobile.
- The `#calculating-view` must NOT have `display: flex` in its base CSS rule. It must stay `display: none` until `.active` is added. The flex layout is defined only on `#calculating-view.active`.
- The same pattern applies to `#prompt-modal`: `display: none` at base, `display: flex` only on `#prompt-modal.active`. Do not break this.
- Live slider score labels: sub-score sliders update color-coded value/label spans in real time via `oninput` calling `updateSubScore()`.
- **JS syntax check**: `node -e "new Function(require('fs').readFileSync('index.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1])"`. Run before committing to catch syntax errors fast.
- **Em dash check**: `grep -c "—" index.html "The Character Sheet - Guide.md" README.md` should print 0 for each.
- **Git in Bash**: always use `git -C /path/to/repo` or chain commands in a single call. Shell state does not persist between Bash tool calls.
- **Per-attribute colour variables**: `--attr-{key}` (saturated) and `--attr-{key}-pale` (pale tint) exist in `:root` for all 8 attribute keys. Edit sections set `--section-accent` / `--section-accent-pale` and sheet cards set `--item-accent` / `--item-accent-pale` from them; primary buttons, slider thumbs and reflect boxes inside pick those up automatically.
- **Print layout**: a deliberate two-page sheet. Page 1: identity in one row, the radar chart, personality, abilities (two columns; the section is hidden when empty via `.is-empty`). Page 2: the eight attribute cards with sub-scores, forced by `#scores-rule { break-before: page }`, then a one-line footer. Every card prints open regardless of its on-screen state (the print stylesheet forces `.score-item-detail` visible, so Cmd+P works as well as the Print button). Prose and the toolbar are hidden. The markup inside `.sheet-main` is in print order (chart, personality, abilities, attributes); the on-screen order (attributes before personality) comes from flex `order` rules, so keep both in step if you add a section. Tested to fit on A4 and US Letter with up to about 13 abilities; more than that pushes the attributes to page 3.
- `prefers-reduced-motion` is respected: animations and smooth scrolling are switched off.
- **Testing**: `tools/test-harness.mjs` (see `tools/README.md`) drives the installed Chrome headless over the DevTools protocol from a dependency-free Node script (`--remote-debugging-port`, `Runtime.evaluate`, `Emulation.setDeviceMetricsOverride`, `Page.captureScreenshot`, `Page.printToPDF`) against the preview server, seeding `localStorage` with a test sheet. Check at least: import validation, scoring, the full guided path forward and back, the accordion in one and two columns, no sideways scrolling at 320 to 1024px, share link round trip, and that no screen contains an em dash.

## Future Directions (not yet implemented)
- Validated scales for core attributes (PHQ-9, GAD-7, BRS, etc.), replacing self-assessment with psychometric instruments
- Historical tracking: comparing multiple saves over time, showing trajectory
- Anxiety and Luck as optional "conditions" or modifiers
- Benchmark tests for physical attributes (push-ups, mile time)
- Dark mode
