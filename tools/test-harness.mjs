// Drives the installed Chrome over the DevTools protocol (no dependencies).
// Usage: node harness.mjs <url> <outDir> <scenario>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const [url, outDir, scenario = 'shots'] = process.argv.slice(2);
const PORT = 9334;
const profile = `${outDir}/.chrome-profile`;
rmSync(profile, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });

let ws, nextId = 1;
const pending = new Map();
const problems = [];

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = targets.find(t => t.type === 'page');
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch {}
    await sleep(200);
  }
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      problems.push('EXCEPTION: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      problems.push(`console.${msg.params.type}: ` + msg.params.args.map(a => a.value ?? a.description).join(' '));
    }
  };
}
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + '\n  in: ' + expression.slice(0, 200));
  return r.result.value;
}
async function viewport(width, height, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
}
async function load() {
  await send('Page.navigate', { url });
  await sleep(700);
}
async function shot(name, { full = false } = {}) {
  await sleep(450);
  let params = { format: 'png' };
  if (full) {
    const m = await send('Page.getLayoutMetrics');
    params = { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: m.cssContentSize.width, height: m.cssContentSize.height, scale: 1 } };
  }
  const { data } = await send('Page.captureScreenshot', params);
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(data, 'base64'));
  console.log('  saved', name + '.png');
}

const SEED = { version: 1, profile: { name: 'Alex Morgan', age: '38', gender: 'female', occupation: 'Secondary school teacher', location: 'Brisbane', relationship: 'partnered', photo: null }, scores: {}, subScores: { health: 13, strength: 9, agility: 8, stamina: 11, vitality: 10, rest: 5, mental_health: 12, clarity: 14, emotional_regulation: 11, learning: 16, creativity: 13, purpose: 15, integrity: 16, self_acceptance: 9, gratitude: 12, practice: 6, partner: 15, family: 13, friendships: 8, community: 7, giving: 12, career: 14, wealth: 10, reputation: 15, home: 13, adversity_tolerance: 12, recovery: 10, adaptability: 14, grit: 16, habits: 9, follow_through: 13, impulse_control: 8, time_management: 7, pleasure: 12, play: 6, humour: 15, flow: 13, savouring: 8 }, overrides: {}, bfiResponses: { 0: 4, 1: 4, 2: 2, 3: 2, 4: 1, 5: 2, 6: 2, 7: 5, 8: 4, 9: 5 }, abilities: [{ name: 'Teaching', score: 16, linked: 'standing', status: 'active' }, { name: 'Piano', score: 11, linked: 'joy', status: 'dormant' }, { name: 'Trail running', score: 9, linked: 'body', status: 'active' }], updatedAt: '2026-10-05T03:00:00.000Z' };
const seed = (extra = {}) => evaluate(`localStorage.setItem('charactersheet-data', ${JSON.stringify(JSON.stringify({ ...SEED, ...extra }))}); true`);
const scrollTo = sel => evaluate(`window.scrollTo(0, document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect().top + scrollY - 16); true`);

async function shots(prefix) {
  // --- Desktop 1280 ---
  await viewport(1280, 900);
  await load(); await evaluate(`localStorage.clear(); true`); await load();
  await shot(`${prefix}desktop-1-tutorial-welcome`);
  await evaluate(`document.querySelectorAll('.tutorial-page')[2].scrollIntoView(); true`);
  await shot(`${prefix}desktop-2-tutorial-attributes`);
  await evaluate(`document.querySelectorAll('.tutorial-page')[3].scrollIntoView(); true`);
  await shot(`${prefix}desktop-3-tutorial-scale`);

  await seed(); await load();
  await evaluate(`(document.querySelector('#scores-grid .score-item-toggle') || document.querySelector('#scores-grid .score-item')).click(); true`);
  await shot(`${prefix}desktop-4-sheet-full`, { full: true });
  await evaluate(`window.scrollTo(0, 500); true`);
  await shot(`${prefix}desktop-5-sheet-scrolled`);

  await evaluate(`app.editSheet(); try { app.setEditMode('guided'); } catch (e) {} app.showSection(-1); window.scrollTo(0,0); true`);
  await shot(`${prefix}desktop-6-edit-profile`);
  await evaluate(`app.showSection(1); true`);
  await shot(`${prefix}desktop-7-edit-guided-intro`);
  await evaluate(`app.stepForward(); true`);
  await shot(`${prefix}desktop-8-edit-guided-health`);
  await evaluate(`for (let i=0;i<6;i++) app.stepForward(); true`);
  await shot(`${prefix}desktop-9-edit-guided-reveal`);
  await evaluate(`app.showSection(0); app.stepForward(); true`);
  await shot(`${prefix}desktop-10-edit-guided-bfi`);
  await evaluate(`try { app.setEditMode('quick'); } catch (e) {} app.showSection(0); true`);
  await shot(`${prefix}desktop-11-edit-quick-personality`);
  await evaluate(`app.showSection(2); true`);
  await shot(`${prefix}desktop-12-edit-quick-mind`);
  await evaluate(`app.showSection(9); true`);
  await shot(`${prefix}desktop-13-edit-abilities`);
  await evaluate(`app.showPromptModal(); true`);
  await shot(`${prefix}desktop-14-prompt-modal`);
  await evaluate(`app.hidePromptModal(); true`);

  // --- Tablet 768 ---
  await viewport(768, 1024, true);
  await seed(); await load();
  await shot(`${prefix}tablet-1-sheet`);
  await evaluate(`app.editSheet(); app.showSection(1); true`);
  await shot(`${prefix}tablet-2-edit`);

  // --- Phone 375 ---
  await viewport(375, 812, true);
  await evaluate(`localStorage.clear(); true`); await load();
  await shot(`${prefix}phone-1-tutorial-welcome`);
  await seed(); await load();
  await shot(`${prefix}phone-2-sheet-top`);
  await evaluate(`(document.querySelector('#scores-grid .score-item-toggle') || document.querySelector('#scores-grid .score-item')).click(); true`);
  await scrollTo('#scores-rule');
  await shot(`${prefix}phone-3-sheet-accordion`);
  await evaluate(`window.scrollTo(0,0); true`);
  await shot(`${prefix}phone-4-sheet-full`, { full: true });
  await evaluate(`app.editSheet(); try { app.setEditMode('guided'); } catch (e) {} app.showSection(1); app.stepForward(); true`);
  await shot(`${prefix}phone-5-edit-guided-health`);
  await evaluate(`try { app.setEditMode('quick'); } catch (e) {} app.showSection(0); true`);
  await shot(`${prefix}phone-6-edit-quick-personality`);
  await evaluate(`app.showSection(9); window.scrollTo(0,0); true`);
  await shot(`${prefix}phone-7-edit-abilities`);
  await evaluate(`app.showPromptModal(); true`);
  await shot(`${prefix}phone-8-prompt-modal`);
  await evaluate(`app.hidePromptModal(); true`);

  // --- Small phone 320 ---
  await viewport(320, 568, true);
  await seed(); await load();
  await shot(`${prefix}small-1-sheet`);
  await evaluate(`app.editSheet(); app.showSection(1); app.stepForward(); true`);
  await shot(`${prefix}small-2-edit-guided`);
}

async function print(prefix) {
  await viewport(1280, 900);
  const cases = {
    'full': { ...SEED, overrides: { mind: true }, scores: { mind: 15 } },
    'sparse': { version: 1, profile: { name: '', age: '', gender: '', occupation: '', location: '', relationship: '', photo: null }, scores: {}, subScores: { health: 16, strength: 18 }, overrides: {}, bfiResponses: { 0: 1, 5: 5 }, abilities: [], revealed: true },
    'many': { ...SEED, abilities: [...SEED.abilities, { name: 'Cooking', score: 13, linked: 'joy', status: 'active' }, { name: 'Public speaking', score: 15, linked: 'standing', status: 'active' }, { name: 'French', score: 7, linked: 'mind', status: 'dormant' }, { name: 'Swimming', score: 12, linked: 'body', status: 'active' }, { name: 'Guitar', score: 8, linked: 'joy', status: 'dormant' }, { name: 'Woodwork', score: 11, linked: 'body', status: 'active' }, { name: 'Chess', score: 14, linked: 'mind', status: 'active' }, { name: 'Baking', score: 12, linked: 'joy', status: 'active' }, { name: 'Running a meeting', score: 15, linked: 'standing', status: 'active' }, { name: 'Gardening', score: 10, linked: 'body', status: 'dormant' }] },
  };
  for (const [name, data] of Object.entries(cases)) {
    await load(); await evaluate(`localStorage.setItem('charactersheet-data', ${JSON.stringify(JSON.stringify(data))}); true`); await load();
    for (const [paper, w, h] of [['a4', 8.27, 11.69], ['letter', 8.5, 11]]) {
      const { data: pdf } = await send('Page.printToPDF', { printBackground: true, paperWidth: w, paperHeight: h, preferCSSPageSize: false, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
      writeFileSync(`${outDir}/${prefix}print-${name}-${paper}.pdf`, Buffer.from(pdf, 'base64'));
      console.log('  saved', `${prefix}print-${name}-${paper}.pdf`);
    }
  }
}

async function tests() {
  const results = [];
  const check = (name, pass, detail) => { results.push({ name, pass: !!pass, detail }); };
  const store = () => evaluate(`JSON.parse(localStorage.getItem('charactersheet-data'))`);
  const setStore = obj => evaluate(`localStorage.setItem('charactersheet-data', ${JSON.stringify(typeof obj === 'string' ? obj : JSON.stringify(obj))}); true`);
  const activeView = () => evaluate(`['tutorial-view','edit-view','sheet-view','calculating-view'].filter(v => document.getElementById(v).classList.contains('active')).join(',')`);
  const importFile = text => evaluate(`new Promise(res => { const input=document.getElementById('import-input'); const dt=new DataTransfer(); dt.items.add(new File([${JSON.stringify(text)}],'t.json',{type:'application/json'})); input.files=dt.files; input.dispatchEvent(new Event('change',{bubbles:true})); setTimeout(()=>res(document.getElementById('toast').textContent), 350); })`);

  await viewport(1280, 900);
  await load(); await evaluate(`localStorage.clear(); true`); await load();

  // ---- First visit ----
  check('first visit shows the tutorial', (await activeView()) === 'tutorial-view');
  check('first visit skip label', (await evaluate(`document.getElementById('tutorial-skip-link').textContent`)) === 'Skip the introduction');

  // ---- normaliseData ----
  const norm = await evaluate(`(() => {
    const bad = [null, [], {}, {foo: 1}, 'x', 42].map(v => normaliseData(v));
    const evil = normaliseData({
      profile: { name: '<img src=x onerror="window.__xss=1">', age: '"><script>window.__xss=1</scr'+'ipt>', gender: 'robot', relationship: '<b>', occupation: {a:1}, location: 7,
                 photo: 'x" onerror="window.__xss=1' },
      scores: { body: '<i>', mind: 99, spirit: -5, heart: 0, standing: 12.6 }, subScores: { health: '"><img src=x onerror=window.__xss=1>', rest: '7' },
      overrides: { body: 'yes', mind: true }, bfiResponses: { 0: 9, 1: '4', 2: null },
      abilities: [{ name: '<script>window.__xss=1</scr'+'ipt>', score: '<b>', linked: '"><x', status: 'weird' }, 'junk', null, { name: 'Ok', score: 25, linked: 'joy', status: 'dormant' }]
    });
    const legacy = normaliseData({ version: 1, profile: { name: 'Character', photo: 'data:image/jpeg;base64,AAAA' }, scores: { body: 12 } });
    return { bad, evil, legacy };
  })()`);
  check('rejects non-sheets', norm.bad.every(v => v === null), norm.bad);
  const e = norm.evil;
  check('coerces and clamps scores', e.scores.body === 10 && e.scores.mind === 20 && e.scores.spirit === 1 && e.scores.heart === 1 && e.scores.standing === 13 && e.subScores.health === null && e.subScores.rest === 7, { s: e.scores, h: e.subScores.health });
  check('validates profile enums and photo', e.profile.gender === '' && e.profile.relationship === '' && e.profile.photo === null && e.profile.age === '' && e.profile.occupation === '' && e.profile.location === '7', e.profile);
  check('overrides are strict booleans', e.overrides.body === false && e.overrides.mind === true);
  check('BFI responses limited to 1-5, else unanswered', e.bfiResponses[0] === null && e.bfiResponses[1] === 4 && e.bfiResponses[2] === null, e.bfiResponses);
  check('abilities are sanitised', e.abilities.length === 2 && e.abilities[0].score === 10 && e.abilities[0].linked === '' && e.abilities[0].status === 'active' && e.abilities[1].score === 20, e.abilities);
  check('legacy placeholder name dropped, photo kept, treated as revealed', norm.legacy.profile.name === '' && norm.legacy.profile.photo === 'data:image/jpeg;base64,AAAA' && norm.legacy.revealed === true && norm.legacy.scores.body === 12);

  // ---- Import: bad files leave things alone ----
  await evaluate(`window.confirm = () => { window.__confirmed = (window.__confirmed || 0) + 1; return true; }; true`);
  const t1 = await importFile('not json at all');
  check('import rejects non-JSON', /could not be read/.test(t1) && (await activeView()) === 'tutorial-view', t1);
  const t2 = await importFile('{}');
  check('import rejects empty object (old code wiped the sheet)', /could not be read/.test(t2) && (await store()) === null, t2);

  // ---- Import: hostile file cannot inject markup ----
  const evilFile = JSON.stringify({ profile: { name: '<img src=x onerror="window.__xss=1">', occupation: '<svg onload="window.__xss=1">', location: '"><b id=inj>', photo: 'x" onerror="window.__xss=1' },
    scores: { body: '<img src=x onerror=window.__xss=1>' }, subScores: { health: '"><img src=x onerror=window.__xss=1>' },
    abilities: [{ name: '<img src=x onerror="window.__xss=1">', score: '"><img src=x onerror=window.__xss=1>', linked: 'joy', status: 'active' }] });
  const t3 = await importFile(evilFile);
  await evaluate(`app.showPromptModal(); app.hidePromptModal(); app.editSheet(); app.setEditMode('guided'); app.showSection(1); app.stepForward(); app.setEditMode('quick'); app.showSection(9); app.showSection(-1); true`);
  await sleep(300);
  const inj = await evaluate(`({ xss: window.__xss || 0, injected: !!document.getElementById('inj') || !!document.querySelector('#edit-view img[src="x"], #sheet-view img[src="x"], svg[onload]') , nameField: document.getElementById('input-name').value })`);
  check('hostile import renders as text, runs nothing', t3 === 'Sheet imported.' && inj.xss === 0 && !inj.injected && inj.nameField.includes('<img'), inj);
  check('first import needs no confirmation', !(await evaluate(`window.__confirmed || 0`)));

  // ---- Import over an existing sheet asks first; cancel keeps the sheet ----
  await evaluate(`window.confirm = () => false; true`);
  await importFile(JSON.stringify(SEED_DATA));
  check('cancelled import keeps the current sheet', (await evaluate(`state.profile.name`)).includes('<img'));
  await evaluate(`window.confirm = () => true; true`);
  const t4 = await importFile(JSON.stringify(SEED_DATA));
  check('confirmed import replaces the sheet and shows it', t4 === 'Sheet imported.' && (await activeView()) === 'sheet-view' && (await evaluate(`state.profile.name`)) === 'Alex Morgan');
  check('imported sheet keeps its own date', (await store()).updatedAt === SEED_DATA.updatedAt);

  // ---- Scoring ----
  const sc = await evaluate(`(() => {
    const bfi = app.calculateBFIScores();
    const main = Object.fromEntries(ATTRIBUTES.map(a => [a.key, app.getMainScore(a.key)]));
    const saved = Object.assign({}, state.bfiResponses);
    BFI_ITEMS.forEach((_, i) => state.bfiResponses[i] = 3); const neutral = app.calculateBFIScores();
    BFI_ITEMS.forEach((_, i) => state.bfiResponses[i] = 5); const allAgree = app.calculateBFIScores();
    Object.assign(state.bfiResponses, saved);
    return { bfi, main, neutral, allAgree, levels: [1,2,2.5,3,3.5,4,5].map(getTraitLevel).join(','),
      tiers: [1,4,5,7,8,9,10,11,12,13,14,15,16,17,18,20].map(s => getScoreInfo(s).label[0] + s).join(' ') };
  })()`);
  check('BFI-10 scoring with reverse keys', JSON.stringify(sc.bfi) === JSON.stringify({ openness: 5, conscientiousness: 4.5, extraversion: 2, agreeableness: 4, neuroticism: 4 }), sc.bfi);
  check('BFI neutral = 3 everywhere; all-agree = 3 (one item of each pair is reversed)', Object.values(sc.neutral).every(v => v === 3) && Object.values(sc.allAgree).every(v => v === 3));
  check('trait levels symmetric', sc.levels === 'Low,Low,Moderate,Moderate,Moderate,High,High', sc.levels);
  check('main scores are rounded sub-score means', JSON.stringify(sc.main) === JSON.stringify({ body: 9, mind: 13, spirit: 12, heart: 11, standing: 13, resilience: 13, discipline: 9, joy: 11 }), sc.main);
  check('tier boundaries', sc.tiers === 'C1 C4 S5 S7 B8 B9 A10 A11 A12 A13 S14 S15 E16 E17 E18 E20', sc.tiers);

  // ---- Sheet content ----
  const sheet = await evaluate(`({ name: document.getElementById('sheet-name').textContent, meta: document.getElementById('sheet-meta').textContent,
    cards: document.querySelectorAll('#scores-grid .score-item').length, traits: document.querySelectorAll('.personality-section .score-item').length,
    abilities: document.querySelectorAll('.ability-card-sheet').length, radar: document.getElementById('radar-canvas').getAttribute('aria-label') })`);
  check('sheet renders header, 8 attributes, 5 traits, 3 abilities', sheet.name === 'Alex Morgan' && /Age 38\s*Female\s*Brisbane\s*Partnered\s*Last updated 5 October 2026/.test(sheet.meta) && sheet.cards === 8 && sheet.traits === 5 && sheet.abilities === 3, sheet);
  check('radar has a text alternative', /Body 9, Mind 13/.test(sheet.radar), sheet.radar);

  // ---- Accordion (desktop: pairs open together; detail click does not close) ----
  const acc = await evaluate(`(() => {
    const items = [...document.querySelectorAll('#scores-grid .score-item')];
    const st = () => items.map(i => i.classList.contains('expanded') ? 1 : 0).join('');
    items[2].querySelector('.score-item-toggle').click(); const a = st();
    items[2].querySelector('.score-item-detail-desc').click(); const b = st();
    const aria = items[3].querySelector('.score-item-toggle').getAttribute('aria-expanded');
    items[3].querySelector('.score-item-toggle').click(); const c = st();
    app.toggleAllScores(); const d = st(); const label = document.getElementById('scores-expand-all').textContent;
    app.toggleAllScores(); const f = st();
    const before = st(); app.printSheet = app.printSheet; return { a, b, aria, c, d, label, f };
  })()`);
  check('accordion: pair opens together, text click keeps it open, toggle closes, expand-all works',
    acc.a === '00110000' && acc.b === '00110000' && acc.aria === 'true' && acc.c === '00000000' && acc.d === '11111111' && acc.label === 'Hide all sub-scores' && acc.f === '00000000', acc);

  // ---- Reveal happens once ----
  await evaluate(`app.editSheet(); app.viewSheet(); true`);
  check('returning user goes straight to the sheet', (await activeView()) === 'sheet-view');

  // ---- Saving ----
  await evaluate(`app.editSheet(-1); const n = document.getElementById('input-name'); n.value = 'Alex M'; n.dispatchEvent(new Event('input', {bubbles: true})); true`);
  await sleep(750);
  let saved = await store();
  check('profile edits are saved (scheduleSave bug)', saved.profile.name === 'Alex M' && saved.updatedAt !== SEED_DATA.updatedAt, saved.profile.name);
  const stamp = saved.updatedAt;
  await evaluate(`app.setEditMode('guided'); app.showSection(4); true`);
  await sleep(750);
  saved = await store();
  check('mode and place are saved without touching the date', saved.editMode === 'guided' && saved.lastSection === 4 && saved.updatedAt === stamp, { m: saved.editMode, l: saved.lastSection });
  check('clearing the name does not bring back "Character"', await evaluate(`(() => { const n = document.getElementById('input-name'); n.value = ''; n.dispatchEvent(new Event('input', {bubbles: true})); return state.profile.name === ''; })()`));

  // ---- Guided navigation: back mirrors forward; mode switch keeps your place ----
  const nav = await evaluate(`(() => {
    app.setEditMode('guided'); app.showSection(-1);
    const fwd = []; let g = 0;
    while (g++ < 80 && currentSection < LAST_SECTION) { fwd.push(currentSection + ':' + (currentSection === 0 ? currentBFIStep : currentSubStep)); app.stepForward(); }
    fwd.push(currentSection + ':' + currentSubStep);
    const back = []; g = 0;
    while (g++ < 80) { back.push(currentSection + ':' + (currentSection === 0 ? currentBFIStep : currentSubStep)); if (currentSection === -1) break; app.stepBack(); }
    app.showSection(2); app.stepForward(); app.stepForward(); app.stepForward();
    const at = currentSection + ':' + currentSubStep, title = document.querySelector('#section-2 .sub-step-question-name').textContent;
    app.setEditMode('quick'); const quickOk = !!document.querySelector('#section-2 .quick-subscore-list') && document.getElementById('section-2').classList.contains('active');
    app.setEditMode('guided');
    const after = currentSection + ':' + currentSubStep, title2 = document.querySelector('#section-2 .sub-step-question-name').textContent;
    app.showSection(0); app.stepForward(); app.stepForward(); app.setEditMode('quick'); const quickBfiAll = document.querySelectorAll('#section-0 .quick-bfi-item').length; app.setEditMode('guided');
    const bfiAfter = currentBFIStep;
    return { steps: fwd.length, mirror: fwd.join(' ') === back.reverse().join(' '), at, after, title, title2, quickOk, quickBfiAll, bfiAfter };
  })()`);
  check('guided flow: 67 steps forward, same path back', nav.steps === 67 && nav.mirror, nav.steps);
  check('switching Guided/Quick keeps your place', nav.at === '2:3' && nav.after === '2:3' && nav.title === 'Emotional Regulation' && nav.title2 === nav.title && nav.quickOk && nav.quickBfiAll === 10 && nav.bfiAfter === 1, nav);

  const qnav = await evaluate(`(() => {
    app.setEditMode('quick'); app.showSection(-1); const seen = [];
    for (let i = 0; i < 10; i++) { app.stepForward(); seen.push(currentSection); }
    app.stepBack(); const back = currentSection;
    const btns = document.querySelectorAll('#section-5 .sub-step-nav .btn').length;
    return { seen: seen.join(','), back, btns };
  })()`);
  check('quick mode has Previous/Next through every section', qnav.seen === '0,1,2,3,4,5,6,7,8,9' && qnav.back === 8 && qnav.btns === 2, qnav);

  // ---- Abilities ----
  const ab = await evaluate(`(() => {
    app.showSection(9); const n0 = state.abilities.length; app.addAbility();
    const focused = document.activeElement.getAttribute('aria-label');
    const input = document.activeElement; input.value = 'Chess'; input.dispatchEvent(new Event('input', {bubbles: true}));
    const idx = state.abilities.length - 1;
    document.querySelector('[data-ability-slider="' + idx + '"]').value = 17; document.querySelector('[data-ability-slider="' + idx + '"]').dispatchEvent(new Event('input', {bubbles: true}));
    app.toggleAbilityStatus(idx); const status = state.abilities[idx].status;
    const label = document.querySelector('[data-ability-label="' + idx + '"]').textContent;
    const snapshot = JSON.stringify(state.abilities[idx]);
    app.removeAbility(idx);
    return { n0, focused, snapshot, status, label, n1: state.abilities.length };
  })()`);
  check('abilities: add focuses the name, edits apply, remove works', ab.focused === 'Ability name' && ab.snapshot === '{"name":"Chess","score":17,"linked":"","status":"dormant"}' && ab.label === 'Excellent' && ab.n1 === ab.n0, ab);

  // ---- Export ----
  const exp = await evaluate(`new Promise(res => { const orig = URL.createObjectURL; let blob; URL.createObjectURL = b => { blob = b; return orig.call(URL, b); };
    const click = HTMLAnchorElement.prototype.click; let filename; HTMLAnchorElement.prototype.click = function () { filename = this.download; };
    state.profile.name = 'Alex Morgan'; state.abilities.push({ name: '  ', score: 10, linked: '', status: 'active' });
    app.exportData(); URL.createObjectURL = orig; HTMLAnchorElement.prototype.click = click; state.abilities.pop();
    blob.text().then(t => res({ filename, data: JSON.parse(t), toast: document.getElementById('toast').textContent })); })`);
  check('export: named file, complete data, blank abilities dropped, no UI-only fields', /^character-sheet-alex-morgan-\d{4}-\d\d-\d\d\.json$/.test(exp.filename) && exp.data.version === 1 && exp.data.abilities.length === 3 && exp.data.subScores.rest === 5 && !('editMode' in exp.data) && !('revealed' in exp.data), exp.filename);
  check('export round-trips through import validation', await evaluate(`(() => { const c = normaliseData(${JSON.stringify(exp.data)}); return c.subScores.rest === 5 && c.abilities.length === 3 && c.profile.name === 'Alex Morgan'; })()`));

  // ---- AI prompt ----
  const prompt = await evaluate(`(() => { state.profile.gender = 'prefer-not'; const withPref = app.generatePromptText(); app.renderSheetHeader(); const meta = document.getElementById('sheet-meta').textContent; state.profile.gender = 'female';
    state.overrides.mind = true; state.scores.mind = 15; const t = app.generatePromptText(); state.overrides.mind = false; return { t, prefHidden: !/Gender/.test(withPref) && !/refer/.test(meta) }; })()`);
  check('"Prefer not to say" is left off the sheet and the prompt (was printed as "Prefer-not")', prompt.prefHidden);
  check('prompt: no em dashes, right content', !prompt.t.includes('—') && prompt.t.includes('Name: Alex Morgan') && prompt.t.includes('Rest: 5/20 (Struggling)') && prompt.t.includes('Openness: High (5.0/5.0). Drawn to novelty.') && prompt.t.includes('Extraversion: Low (2.0/5.0). Prefers quieter settings.') && prompt.t.includes('Mind: 15/20 (Strong) [set by the person directly, not averaged]') && prompt.t.includes('5–7 = Struggling (noticeably below where they would want to be)') && prompt.t.includes('Piano: 11/20 (Average) [linked to Joy]'));

  // ---- Modal ----
  const modal = await evaluate(`(() => { app.showSheet(); const trigger = [...document.querySelectorAll('.sheet-actions .btn')].find(b => b.textContent === 'AI Prompt'); trigger.focus(); trigger.click();
    const open = document.getElementById('prompt-modal').classList.contains('active'); const focusIn = document.activeElement.id;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { open, focusIn, closed: !document.getElementById('prompt-modal').classList.contains('active'), focusBack: document.activeElement === trigger, scroll: document.body.style.overflow }; })()`);
  check('prompt modal: opens focused, Escape closes, focus returns', modal.open && modal.focusIn === 'prompt-copy-btn' && modal.closed && modal.focusBack && modal.scroll === '', modal);

  // ---- Guide round trips ----
  const guide = await evaluate(`(() => { const out = {}; app.showTutorial('sheet'); out.skipSheet = document.getElementById('tutorial-skip-link').textContent; out.finishSheet = [...document.querySelectorAll('.tutorial-page .btn-primary')].pop().textContent; out.noImport = !document.querySelector('.tutorial-page .btn-text'); app.skipTutorial();
    out.backAtSheet = document.getElementById('sheet-view').classList.contains('active'); const name1 = state.profile.name;
    app.editSheet(3); app.showTutorial('edit'); out.skipEdit = document.getElementById('tutorial-skip-link').textContent; app.completeTutorial();
    out.backAtEdit = document.getElementById('edit-view').classList.contains('active') && currentSection === 3; out.dataKept = state.profile.name === name1 && state.subScores.rest === 5; return out; })()`);
  check('Guide returns you where you came from, sheet untouched', guide.skipSheet === 'Back to my sheet' && guide.finishSheet === 'Back to My Sheet' && guide.noImport && guide.backAtSheet && guide.skipEdit === 'Back to editing' && guide.backAtEdit && guide.dataKept, guide);

  // ---- No em dashes anywhere a person reads ----
  const dash = await evaluate(`(() => { const hits = []; const scan = label => { if (document.body.innerText.includes('\\u2014')) hits.push(label); };
    app.showTutorial('sheet'); scan('tutorial'); app.showSheet(); app.toggleAllScores(); scan('sheet'); app.showPromptModal(); scan('prompt'); app.hidePromptModal();
    app.editSheet(-1); app.setEditMode('quick'); for (let i = -1; i <= 9; i++) { app.showSection(i); scan('quick ' + i); }
    app.setEditMode('guided'); app.showSection(-1); let g = 0; while (g++ < 70 && currentSection < 9) { scan('guided ' + currentSection + ':' + currentSubStep); app.stepForward(); } scan('guided abilities');
    document.getElementById('calc-prereveal').style.display = 'block'; document.getElementById('calculating-view').classList.add('active'); scan('reveal');
    document.getElementById('calculating-view').classList.remove('active'); document.getElementById('calc-prereveal').style.display = 'none';
    return hits; })()`);
  check('no em dashes in any rendered screen', dash.length === 0, dash);

  // ---- Reload paths ----
  await evaluate(`app.setEditMode('quick'); app.save(); true`);
  await load();
  check('saved, revealed sheet opens on the sheet', (await activeView()) === 'sheet-view' && (await evaluate(`editMode`)) === 'quick');

  await setStore({ version: 1, profile: { name: 'Character', age: '', gender: '', photo: null }, scores: { body: 14 }, subScores: { health: 14 }, overrides: { body: true }, bfiResponses: {}, abilities: [] });
  await load();
  const legacy = await evaluate(`({ view: document.getElementById('sheet-view').classList.contains('active'), name: document.getElementById('sheet-name').textContent, photoHidden: document.getElementById('sheet-photo').style.display === 'none', body: app.getMainScore('body'), mode: editMode, date: /Last updated/.test(document.getElementById('sheet-meta').textContent) })`);
  check('older saves still load (no name, override kept, defaults to Quick)', legacy.view && legacy.name === 'Character Sheet' && legacy.photoHidden && legacy.body === 14 && legacy.mode === 'quick' && legacy.date, legacy);

  await setStore('{not json');
  await load();
  check('corrupt storage falls back to the tutorial (old code showed an empty sheet)', (await activeView()) === 'tutorial-view');

  await evaluate(`localStorage.clear(); true`); await load();
  await evaluate(`app.completeTutorial(); app.showSection(1); app.stepForward(); app.updateSubScore('health', 15); app.showSection(3); true`);
  await sleep(750);
  await load();
  const resume = await evaluate(`({ view: document.getElementById('edit-view').classList.contains('active'), section: currentSection, mode: editMode, health: state.subScores.health, revealed: state.revealed, heading: document.querySelector('.attribute-section.active h2').textContent })`);
  check('an unfinished first pass resumes in the guided flow where it stopped', resume.view && resume.section === 3 && resume.mode === 'guided' && resume.health === 15 && resume.revealed === false && resume.heading === 'Spirit', resume);

  // First-time reveal: runs once, and "See Your Sheet" marks it seen
  await evaluate(`app.viewSheet(); app.viewSheet(); true`);
  check('first View Sheet plays the reveal', (await activeView()) === 'calculating-view');
  await sleep(4200);
  const pre = await evaluate(`({ shown: getComputedStyle(document.getElementById('calc-prereveal')).display, focus: document.activeElement.id })`);
  await evaluate(`document.querySelector('#calc-prereveal .btn').click(); true`);
  await sleep(700);
  check('reveal ends on the pause screen, then the sheet, and is remembered', pre.shown === 'block' && pre.focus === 'calc-prereveal-heading' && (await activeView()) === 'sheet-view' && (await store()).revealed === true, pre);

  // ---- Unanswered state ----
  await viewport(1280, 900);
  await evaluate(`localStorage.clear(); true`); await load();
  const blank = await evaluate(`(() => { app.completeTutorial(); const out = {};
    out.main = app.getMainScore('body'); out.bfi = app.calculateBFIScores().openness; out.level = getTraitLevel(null);
    app.showSection(1); app.stepForward();
    out.unrated = !!document.querySelector('#section-1 .sub-step-body.unrated'); out.btn = document.querySelector('#section-1 [data-role=next]').textContent;
    out.readout = document.querySelector('[data-subkey-label=health]').textContent;
    const slider = document.getElementById('slider-health'); slider.click(); // a tap at 10 counts as a rating
    out.afterClick = state.subScores.health; out.btn2 = document.querySelector('#section-1 [data-role=next]').textContent; out.unrated2 = !!document.querySelector('#section-1 .unrated');
    for (let i = 0; i < 6; i++) app.stepForward(); // to the reveal step, skipping the rest
    out.reveal = document.querySelector('#section-1 .score-reveal-number').textContent + ' / ' + document.querySelector('#section-1 .score-reveal-note').textContent;
    out.revealSubs = [...document.querySelectorAll('#section-1 .score-reveal-sub-value')].map(e => e.textContent).join('');
    app.showSection(0); app.stepForward(); out.bfiBtn = document.querySelector('#section-0 [data-role=next]').textContent; app.updateBFI(0, 4); out.bfiBtn2 = document.querySelector('#section-0 [data-role=next]').textContent;
    app.setEditMode('quick'); out.quickCaption = document.querySelector('[data-bfi-caption="1"]').textContent; app.showSection(2); out.quickUnrated = document.querySelectorAll('#section-2 .quick-subscore-item.unrated').length;
    out.quickNote = document.querySelector('#main-score-mind .indicator').textContent;
    app.showSheet(); out.card = document.querySelector('#scores-grid .score-item-value').textContent + document.querySelector('#scores-grid .score-item-label').textContent;
    out.marker = !!document.querySelector('#scores-grid .spectrum-marker'); out.note = document.getElementById('scores-note').textContent.trim();
    out.radar = document.getElementById('radar-canvas').getAttribute('aria-label'); out.trait = document.querySelector('.personality-section .bfi-level').textContent;
    out.traitMarkers = document.querySelectorAll('.personality-section .big-five-bar-marker:not([hidden])').length;
    out.prompt = app.generatePromptText(); out.text = app.sheetAsText(); return out; })()`);
  check('new sheet starts blank: no scores, Skip for now, hollow slider', blank.main === null && blank.bfi === null && blank.level === 'Not answered' && blank.unrated && blank.btn === 'Skip for now' && blank.readout === 'Not yet rated', blank);
  check('a tap on the slider counts as a rating and turns Skip into Next', blank.afterClick === 10 && blank.btn2 === 'Next' && !blank.unrated2, blank);
  check('reveal step averages only rated sub-scores and says so', blank.reveal === '10 / Average of 1 of 6 sub-scores' && blank.revealSubs === '10' + '–'.repeat(5), blank.reveal);
  check('BFI skip label, quick captions and quick notes', blank.bfiBtn === 'Skip for now' && blank.bfiBtn2 === 'Next' && blank.quickCaption === 'Not answered' && blank.quickUnrated === 5 && blank.quickNote === 'Rate a sub-score to get a score', blank);
  check('sheet shows blanks honestly, with a count and a way back', blank.card === '10Average' && blank.marker === true && /37 sub-scores and 9 personality statements not yet rated/.test(blank.note) && /Body 10, Mind not rated/.test(blank.radar) && blank.trait === 'Not answered' && blank.traitMarkers === 2, blank);
  check('prompt and text summary mark blanks as not rated', /Mind: not rated/.test(blank.prompt) && /Strength: not rated/.test(blank.prompt) && /Body: 10\/20 \(Average\) \[average of the 1 rated sub-scores\]/.test(blank.prompt) && /Conscientiousness: not answered/.test(blank.prompt) && /do not guess/.test(blank.prompt) && /Mind: not rated/.test(blank.text) && !blank.text.includes('—'), null);
  await evaluate(`app.toggleOverride('mind'); true`);
  check('manual score on a blank attribute starts at 10', (await evaluate(`state.scores.mind + ':' + app.getMainScore('mind')`)) === '10:10');

  // ---- Export and share ----
  await sleep(700); // let the debounced save of the blank sheet land before replacing it
  await setStore(SEED_DATA); await load();
  const share = await evaluate(`(async () => { const out = {}; app.showShareModal(); out.open = document.getElementById('share-modal').classList.contains('active');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); out.closed = !document.getElementById('share-modal').classList.contains('active');
    out.link = await app.buildShareLink(); out.text = app.sheetAsText();
    const blob = await app.buildSheetImageBlob(); out.imgType = blob.type; out.imgSize = blob.size;
    const canvas = await app.renderSheetImage(); out.imgW = canvas.width; out.imgH = canvas.height; out.png = canvas.toDataURL('image/png').slice(22);
    return out; })()`);
  check('share dialog opens and Escape closes it', share.open && share.closed);
  check('share link is self-contained and reasonably short', share.link.startsWith(url + '#share=z.') && share.link.length < 1600 && !share.link.includes('photo'), share.link.length);
  check('text summary reads well', /^THE CHARACTER SHEET\nAlex Morgan · Secondary school teacher\nAge 38 · Female · Brisbane · Partnered\nLast updated 5 October 2026/.test(share.text) && /Body: 9 \(Below Average\)\n  Health 13 · Strength 9/.test(share.text) && /Active: Teaching 16 \(Standing\), Trail running 9 \(Body\)\nDormant: Piano 11 \(Joy\)/.test(share.text), share.text);
  check('sheet image renders as a PNG', share.imgType === 'image/png' && share.imgSize > 100000 && share.imgW === 2160 && share.imgH > 3000 && share.imgH < 6000, { size: share.imgSize, w: share.imgW, h: share.imgH });
  writeFileSync(`${outDir}/share-image.png`, Buffer.from(share.png, 'base64'));

  // Open the link in a browser that has its own (different) sheet
  await setStore({ ...SEED_DATA, profile: { ...SEED_DATA.profile, name: 'Someone Else' } });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: share.link }); await sleep(900);
  const shared = await evaluate(`(() => ({ view: document.getElementById('sheet-view').classList.contains('active'), banner: !document.getElementById('shared-banner').hidden,
    bannerName: document.getElementById('shared-banner-name').textContent, exit: document.getElementById('shared-banner-exit').textContent, name: document.getElementById('sheet-name').textContent,
    editHidden: ![...document.querySelectorAll('.sheet-actions .btn')].some(b => b.textContent === 'Edit' && b.offsetParent), importHidden: ![...document.querySelectorAll('.sheet-actions .btn')].some(b => b.textContent === 'Import' && b.offsetParent),
    photoGone: state.profile.photo === null, own: JSON.parse(localStorage.getItem('charactersheet-data')).profile.name, cards: document.querySelectorAll('#scores-grid .score-item').length }))()`);
  check('a share link opens read-only, without touching the saved sheet', shared.view && shared.banner && shared.bannerName === "Alex Morgan's sheet" && shared.exit === 'Back to my sheet' && shared.name === 'Alex Morgan' && shared.editHidden && shared.importHidden && shared.own === 'Someone Else' && shared.cards === 8, shared);
  await evaluate(`app.toggleScoreItem(document.querySelector('.score-item-toggle')); app.showPromptModal(); app.hidePromptModal(); true`);
  await sleep(700);
  check('viewing a shared sheet never writes to storage', (await store()).profile.name === 'Someone Else');
  await evaluate(`window.confirm = () => true; app.keepSharedSheet(); true`);
  await sleep(300);
  const kept = await evaluate(`({ hash: location.hash, own: JSON.parse(localStorage.getItem('charactersheet-data')).profile.name, banner: document.getElementById('shared-banner').hidden, shared: document.body.classList.contains('shared-view') })`);
  check('"Keep a copy here" saves it and drops the link', kept.hash === '' && kept.own === 'Alex Morgan' && kept.banner && !kept.shared, kept);
  await evaluate(`location.hash = '#share=z.not-a-real-payload'; true`); await sleep(1200); // pasted into an open page: reloads itself
  check('a broken share link falls back to your own sheet with a message', (await activeView()) === 'sheet-view' && /could not be read/.test(await evaluate(`document.getElementById('toast').textContent`)) && (await evaluate(`location.hash`)) === '');

  // ---- Phone: accordion opens one card at a time; nothing overflows sideways ----
  await viewport(375, 812, true);
  await setStore(SEED_DATA); await load();
  const phone = await evaluate(`(() => { const items = [...document.querySelectorAll('#scores-grid .score-item')]; items[0].querySelector('.score-item-toggle').click();
    const st = items.map(i => i.classList.contains('expanded') ? 1 : 0).join('');
    const traits = [...document.querySelectorAll('.personality-section .score-item')]; traits[0].querySelector('.score-item-toggle').click(); const ts = traits.map(i => i.classList.contains('expanded') ? 1 : 0).join('');
    const widths = {}; widths.sheet = document.documentElement.scrollWidth;
    app.editSheet(-1); app.setEditMode('guided'); widths.profile = document.documentElement.scrollWidth; app.showSection(1); app.stepForward(); widths.guided = document.documentElement.scrollWidth;
    app.setEditMode('quick'); app.showSection(0); widths.quickBfi = document.documentElement.scrollWidth; app.showSection(9); widths.abilities = document.documentElement.scrollWidth;
    const bar = document.getElementById('edit-topbar').offsetHeight;
    const small = [...document.querySelectorAll('#edit-view button, #edit-view select, #edit-view input[type=text]')].filter(el => el.offsetParent && (el.offsetHeight < 34)).map(el => (el.className || el.tagName) + ':' + el.offsetHeight);
    return { st, ts, widths, bar, small: [...new Set(small)] }; })()`);
  check('phone: one card opens at a time', phone.st === '10000000' && phone.ts === '10000', phone);
  check('phone: no sideways scrolling on any screen', Object.values(phone.widths).every(w => w <= 375), phone.widths);
  check('phone: sticky edit bar is compact (was about 290px)', phone.bar <= 125, phone.bar);
  check('phone: no tiny tap targets in the edit view', phone.small.length === 0, phone.small);

  for (const w of [320, 360, 414, 768, 1024]) {
    await viewport(w, 800, w < 800);
    await load();
    const o = await evaluate(`(() => { const out = [document.documentElement.scrollWidth]; app.editSheet(1); out.push(document.documentElement.scrollWidth); app.showSection(0); out.push(document.documentElement.scrollWidth); app.showSheet(); return out; })()`);
    check(`no sideways scrolling at ${w}px`, o.every(v => v <= w), o);
  }

  const failed = results.filter(r => !r.pass);
  for (const r of results) console.log((r.pass ? '  PASS  ' : '  FAIL  ') + r.name + (r.pass ? '' : '\n          ' + JSON.stringify(r.detail)));
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  if (failed.length) process.exitCode = 1;
}

const SEED_DATA = SEED;

try {
  await connect();
  await send('Page.enable'); await send('Runtime.enable');
  const prefix = process.argv[5] || '';
  if (scenario === 'shots') await shots(prefix);
  if (scenario === 'print') await print(prefix);
  if (scenario === 'tests') await tests();
  if (scenario === 'scroll') {
    const seedIt = () => evaluate(`localStorage.setItem('charactersheet-data', ${JSON.stringify(JSON.stringify(SEED))}); true`);
    for (const [name, w, h, mobile] of [['phone', 375, 812, true], ['small', 320, 568, true], ['desktop', 1280, 700, false]]) {
      await viewport(w, h, mobile); await load(); await seedIt(); await load();
      await evaluate(`app.showShareModal(); true`);
      const r = await evaluate(`(() => { const body = document.querySelector('#share-modal .prompt-modal-body'); const overlay = document.getElementById('share-modal');
        const closeBtn = [...document.querySelectorAll('#share-modal .prompt-modal-footer .btn')].pop(); const rect = closeBtn.getBoundingClientRect();
        const scroller = body.scrollHeight > body.clientHeight ? 'body' : overlay.scrollHeight > overlay.clientHeight ? 'overlay' : 'none';
        (scroller === 'body' ? body : overlay).scrollTop = 99999;
        const last = document.querySelector('#share-modal .share-row:last-child').getBoundingClientRect();
        return { scroller, closeVisible: rect.top >= 0 && rect.bottom <= innerHeight, lastRowVisible: last.top >= 0 && last.bottom <= innerHeight, overlayScrolled: overlay.scrollTop }; })()`);
      console.log(name, JSON.stringify(r));
      await shot(`scroll-${name}-share-dialog-bottom`);
    }
  }
  if (scenario === 'shots2') {
    const seedIt = () => evaluate(`localStorage.setItem('charactersheet-data', ${JSON.stringify(JSON.stringify(SEED))}); true`);
    await viewport(1280, 900); await load(); await seedIt(); await load();
    await evaluate(`app.showShareModal(); true`); await shot('new-desktop-share-dialog');
    await evaluate(`app.hideShareModal(); true`);
    const link = await evaluate(`app.buildShareLink()`);
    await evaluate(`localStorage.setItem('charactersheet-data', JSON.stringify(Object.assign({}, JSON.parse(localStorage.getItem('charactersheet-data')), { profile: { name: 'Someone Else' } }))); true`);
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200); await send('Page.navigate', { url: link }); await sleep(900);
    await shot('new-desktop-shared-link');
    await evaluate(`localStorage.clear(); true`); await load();
    await evaluate(`app.completeTutorial(); app.showSection(1); app.stepForward(); true`); await shot('new-desktop-blank-step');
    await evaluate(`app.updateSubScore('health', 14); app.showSection(0); app.stepForward(); app.updateBFI(0, 2); app.showSheet(); true`); await shot('new-desktop-blank-sheet');
    await viewport(375, 812, true); await seedIt(); await load();
    await evaluate(`app.showShareModal(); true`); await shot('new-phone-share-dialog');
    await evaluate(`app.hideShareModal(); true`);
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200); await send('Page.navigate', { url: link }); await sleep(900);
    await shot('new-phone-shared-link');
    await evaluate(`localStorage.clear(); true`); await load();
    await evaluate(`app.completeTutorial(); app.showSection(1); app.stepForward(); true`); await shot('new-phone-blank-step');
    await evaluate(`app.setEditMode('quick'); app.showSection(0); true`); await shot('new-phone-blank-quick-bfi');
  }
  if (scenario === 'eval') {
    await viewport(1280, 900);
    await load();
    const code = (await import('node:fs')).readFileSync(process.argv[5], 'utf8');
    console.log(JSON.stringify(await evaluate(code), null, 2));
  }
  console.log(problems.length ? 'PAGE PROBLEMS:\n  ' + [...new Set(problems)].join('\n  ') : 'No console errors or exceptions.');
} catch (e) {
  console.error('HARNESS ERROR:', e.message);
  if (problems.length) console.error('PAGE PROBLEMS:\n  ' + [...new Set(problems)].join('\n  '));
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
}
