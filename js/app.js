import * as store from './store.js';
import { solve } from './solver.js';
import { randomSeedString } from './prng.js';

function showTab(name) {
  document.querySelectorAll('.tab-panel').forEach((el) => {
    el.classList.toggle('active', el.dataset.panel === name);
  });
  document.querySelectorAll('.tabbar-btn').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === name);
  });
  window.scrollTo({ top: 0 });
}

document.getElementById('tabbar').addEventListener('click', (e) => {
  const btn = e.target.closest('.tabbar-btn');
  if (!btn) return;
  if (btn.dataset.tab !== 'stationen') closePgEditor();
  showTab(btn.dataset.tab);
  if (btn.dataset.tab === 'regeln') renderRuleSelects();
});

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

function renderPeopleList() {
  const ul = document.getElementById('list-people');
  const state = store.getState();
  ul.innerHTML = '';

  if (state.people.length === 0) {
    ul.innerHTML = '<li class="hint small">Noch keine Personen angelegt.</li>';
    return;
  }

  state.people.forEach((p) => {
    const pg = store.personGroupOf(p.id);
    const li = document.createElement('li');
    li.className = 'row-item';
    li.innerHTML = `
      <div class="row-main">
        <span class="row-title"></span>
        <span class="row-sub${pg ? '' : ' warn'}"></span>
      </div>
      <button class="icon-btn" data-action="delete-person" data-id="${p.id}" aria-label="Person löschen">✕</button>
    `;
    li.querySelector('.row-title').textContent = p.name;
    li.querySelector('.row-sub').textContent = pg
      ? `Station: ${pg.memberIds.map(store.personName).join(', ')}`
      : 'noch keiner Stationsgruppe zugeordnet';
    ul.appendChild(li);
  });
}

document.getElementById('form-person').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('input-person-name');
  const p = store.addPerson(input.value);
  if (p) {
    input.value = '';
    renderAll();
    toast(`„${p.name}“ hinzugefügt`);
  }
  input.focus();
});

document.getElementById('list-people').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="delete-person"]');
  if (!btn) return;
  const person = store.getState().people.find((p) => p.id === btn.dataset.id);
  if (!person) return;
  if (confirm(`„${person.name}“ löschen? Sie wird auch aus Stationsgruppen und Regeln entfernt.`)) {
    store.removePerson(btn.dataset.id);
    renderAll();
  }
});

const pgEditorState = {
  editingId: null,
  selectedMemberIds: new Set(),
  stations: 1,
  alcohol: false,
  food: false,
};

function availablePeopleForEditor() {
  const unassigned = store.unassignedPeople();
  const state = store.getState();
  const extra = pgEditorState.editingId
    ? state.people.filter((p) => pgEditorState.selectedMemberIds.has(p.id) && !unassigned.includes(p))
    : [];
  return [...unassigned, ...extra].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function renderPgEditorChips() {
  const wrap = document.getElementById('pg-member-chips');
  const people = availablePeopleForEditor();
  wrap.innerHTML = '';

  document.getElementById('pg-no-people-hint').classList.toggle('hidden', people.length > 0);

  people.forEach((p) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = p.name;
    chip.dataset.id = p.id;
    chip.dataset.selected = pgEditorState.selectedMemberIds.has(p.id) ? 'true' : 'false';
    wrap.appendChild(chip);
  });
}

document.getElementById('pg-member-chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const id = chip.dataset.id;
  if (pgEditorState.selectedMemberIds.has(id)) {
    pgEditorState.selectedMemberIds.delete(id);
  } else {
    pgEditorState.selectedMemberIds.add(id);
  }
  chip.dataset.selected = pgEditorState.selectedMemberIds.has(id) ? 'true' : 'false';
});

function openPgEditor(pg) {
  pgEditorState.editingId = pg ? pg.id : null;
  pgEditorState.selectedMemberIds = new Set(pg ? pg.memberIds : []);
  pgEditorState.stations = pg ? pg.stations : 1;
  pgEditorState.alcohol = pg ? pg.alcohol : false;
  pgEditorState.food = pg ? pg.food : false;

  document.getElementById('pg-editor-title').textContent = pg ? 'Stationsgruppe bearbeiten' : 'Neue Stationsgruppe';
  document.getElementById('pg-stations').value = pgEditorState.stations;
  setTogglePill('pg-toggle-alcohol', pgEditorState.alcohol);
  setTogglePill('pg-toggle-food', pgEditorState.food);
  renderPgEditorChips();

  const editor = document.getElementById('pg-editor');
  editor.classList.remove('hidden');
  editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closePgEditor() {
  document.getElementById('pg-editor').classList.add('hidden');
  pgEditorState.editingId = null;
  pgEditorState.selectedMemberIds = new Set();
}

function setTogglePill(id, active) {
  const el = document.getElementById(id);
  el.dataset.active = active ? 'true' : 'false';
}

document.getElementById('btn-new-pg').addEventListener('click', () => openPgEditor(null));
document.getElementById('pg-cancel').addEventListener('click', closePgEditor);

document.getElementById('pg-toggle-alcohol').addEventListener('click', () => {
  pgEditorState.alcohol = !pgEditorState.alcohol;
  setTogglePill('pg-toggle-alcohol', pgEditorState.alcohol);
});

document.getElementById('pg-toggle-food').addEventListener('click', () => {
  pgEditorState.food = !pgEditorState.food;
  setTogglePill('pg-toggle-food', pgEditorState.food);
});

function clampStations(val) {
  return Math.min(20, Math.max(1, Math.round(val) || 1));
}

document.getElementById('pg-stations').addEventListener('change', (e) => {
  e.target.value = clampStations(e.target.value);
});

document.querySelectorAll('#pg-editor .stepper-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById('pg-stations');
    input.value = clampStations(Number(input.value) + Number(btn.dataset.step));
  });
});

document.getElementById('pg-save').addEventListener('click', () => {
  if (pgEditorState.selectedMemberIds.size === 0) {
    toast('Bitte mindestens eine Person auswählen.');
    return;
  }
  const payload = {
    memberIds: [...pgEditorState.selectedMemberIds],
    stations: clampStations(document.getElementById('pg-stations').value),
    alcohol: pgEditorState.alcohol,
    food: pgEditorState.food,
  };
  if (pgEditorState.editingId) {
    store.updatePersonGroup(pgEditorState.editingId, payload);
    toast('Stationsgruppe aktualisiert');
  } else {
    store.addPersonGroup(payload);
    toast('Stationsgruppe angelegt');
  }
  closePgEditor();
  renderAll();
});

function renderPgList() {
  const ul = document.getElementById('list-pg');
  const state = store.getState();
  ul.innerHTML = '';

  if (state.personGroups.length === 0) {
    ul.innerHTML = '<li class="hint small">Noch keine Stationsgruppen angelegt.</li>';
    return;
  }

  state.personGroups.forEach((pg) => {
    const li = document.createElement('li');
    li.className = 'pg-card';
    const names = pg.memberIds.map(store.personName).join(', ');
    li.innerHTML = `
      <div class="pg-main">
        <div class="pg-members"></div>
        <div class="pg-meta">
          <span>${pg.stations} Station${pg.stations === 1 ? '' : 'en'}</span>
          <span class="${pg.alcohol ? 'badge-on' : ''}">🍷 ${pg.alcohol ? 'ja' : 'nein'}</span>
          <span class="${pg.food ? 'badge-on' : ''}">🍽 ${pg.food ? 'ja' : 'nein'}</span>
        </div>
      </div>
      <div class="pg-actions">
        <button class="icon-btn" data-action="edit-pg" data-id="${pg.id}" aria-label="Bearbeiten">✎</button>
        <button class="icon-btn" data-action="delete-pg" data-id="${pg.id}" aria-label="Löschen">✕</button>
      </div>
    `;
    li.querySelector('.pg-members').textContent = names;
    ul.appendChild(li);
  });
}

document.getElementById('list-pg').addEventListener('click', (e) => {
  const editBtn = e.target.closest('[data-action="edit-pg"]');
  const delBtn = e.target.closest('[data-action="delete-pg"]');
  if (editBtn) {
    const pg = store.getState().personGroups.find((g) => g.id === editBtn.dataset.id);
    if (pg) openPgEditor(pg);
  } else if (delBtn) {
    if (confirm('Diese Stationsgruppe löschen?')) {
      store.removePersonGroup(delBtn.dataset.id);
      renderAll();
    }
  }
});

function renderRuleSelects() {
  const state = store.getState();
  const selA = document.getElementById('rule-person-a');
  const selB = document.getElementById('rule-person-b');
  const optionsHtml = state.people
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join('');
  selA.innerHTML = optionsHtml;
  selB.innerHTML = optionsHtml;
  if (state.people.length > 1) selB.selectedIndex = 1;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

document.getElementById('form-rule').addEventListener('submit', (e) => {
  e.preventDefault();
  const personA = document.getElementById('rule-person-a').value;
  const personB = document.getElementById('rule-person-b').value;
  const type = document.getElementById('rule-type').value;
  if (!personA || !personB) {
    toast('Bitte zuerst Personen anlegen.');
    return;
  }
  if (personA === personB) {
    toast('Bitte zwei unterschiedliche Personen wählen.');
    return;
  }
  store.addRule({ personA, personB, type });
  renderRulesList();
  toast('Regel hinzugefügt');
});

function renderRulesList() {
  const ul = document.getElementById('list-rules');
  const state = store.getState();
  ul.innerHTML = '';

  if (state.rules.length === 0) {
    ul.innerHTML = '<li class="hint small">Noch keine Regeln angelegt.</li>';
  } else {
    state.rules.forEach((r) => {
      const li = document.createElement('li');
      li.className = 'row-item';
      const label = r.type === 'together' ? 'müssen zusammen' : 'nicht zusammen';
      li.innerHTML = `
        <div class="row-main">
          <span class="row-title"></span>
        </div>
        <span class="rule-pill ${r.type}">${label}</span>
        <button class="icon-btn" data-action="delete-rule" data-id="${r.id}" aria-label="Regel löschen">✕</button>
      `;
      li.querySelector('.row-title').textContent = `${store.personName(r.personA)} ↔ ${store.personName(r.personB)}`;
      ul.appendChild(li);
    });
  }

  renderRuleIssues();
}

function renderRuleIssues() {
  const state = store.getState();
  const box = document.getElementById('rule-issues');
  const problems = [];

  state.rules.forEach((r) => {
    const pgA = store.personGroupOf(r.personA);
    const pgB = store.personGroupOf(r.personB);
    if (!pgA || !pgB) {
      problems.push(
        `${store.personName(r.personA)} ↔ ${store.personName(r.personB)}: noch nicht beide einer Stationsgruppe zugeordnet — Regel wird ignoriert.`
      );
    } else if (r.type === 'apart' && pgA === pgB) {
      problems.push(
        `${store.personName(r.personA)} ↔ ${store.personName(r.personB)}: sind in derselben Stationsgruppe, „nicht zusammen“ ist nicht erfüllbar.`
      );
    }
  });

  if (problems.length === 0) {
    box.classList.add('hidden');
    box.innerHTML = '';
  } else {
    box.classList.remove('hidden');
    box.innerHTML = problems.map((p) => `<p>⚠ ${escapeHtml(p)}</p>`).join('');
  }
}

document.getElementById('list-rules').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="delete-rule"]');
  if (!btn) return;
  store.removeRule(btn.dataset.id);
  renderRulesList();
});

function renderEinteilungSettings() {
  const state = store.getState();
  document.getElementById('setting-num-groups').value = state.settings.numGroups;
  document.getElementById('setting-seed').value = state.settings.seed;
}

document.querySelectorAll('[data-target="setting-num-groups"]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById('setting-num-groups');
    const next = Math.min(50, Math.max(1, Number(input.value) + Number(btn.dataset.step)));
    input.value = next;
    store.updateSettings({ numGroups: next });
  });
});

document.getElementById('setting-num-groups').addEventListener('change', (e) => {
  const v = Math.min(50, Math.max(1, Math.round(e.target.value) || 1));
  e.target.value = v;
  store.updateSettings({ numGroups: v });
});

document.getElementById('setting-seed').addEventListener('change', (e) => {
  const v = e.target.value.trim() || randomSeedString();
  e.target.value = v;
  store.updateSettings({ seed: v });
});

document.getElementById('btn-new-seed').addEventListener('click', () => {
  const seed = randomSeedString();
  document.getElementById('setting-seed').value = seed;
  store.updateSettings({ seed });
});

document.getElementById('btn-generate').addEventListener('click', () => {
  const state = store.getState();
  const numGroups = Math.min(50, Math.max(1, Number(document.getElementById('setting-num-groups').value) || 1));
  const seed = document.getElementById('setting-seed').value.trim() || 'seed';
  store.updateSettings({ numGroups, seed });

  const result = solve(state.personGroups, state.rules, numGroups, seed);
  renderResult(result);
});

function renderResult(result) {
  const summaryEl = document.getElementById('result-summary');
  const groupsEl = document.getElementById('result-groups');
  const emptyEl = document.getElementById('result-empty');
  const issuesEl = document.getElementById('result-issues');

  groupsEl.innerHTML = '';
  summaryEl.classList.add('hidden');
  emptyEl.classList.add('hidden');
  issuesEl.classList.add('hidden');

  if (result.unitsCount === 0) {
    emptyEl.classList.remove('hidden');
    return;
  }

  const ruleIssues = result.issues.filter((i) => i.reason !== 'unassigned');
  if (ruleIssues.length > 0) {
    issuesEl.classList.remove('hidden');
    issuesEl.innerHTML = ruleIssues
      .map(() => `<p>⚠ Eine Regel konnte nicht erfüllt werden, weil betroffene Personen bereits in derselben Stationsgruppe sind.</p>`)
      .join('');
  }

  summaryEl.classList.remove('hidden');
  const violationNote = result.violations > 0 ? ` · ⚠ ${result.violations} Regel(n) verletzt` : ' · alle Regeln erfüllt';
  const clampNote =
    result.numGroupsUsed < result.numGroupsRequested
      ? ` (weniger als angefragt, da nicht genug unabhängige Stationsgruppen vorhanden sind)`
      : '';
  summaryEl.textContent = `Seed „${result.seed}“ · ${result.numGroupsUsed} Gruppe${result.numGroupsUsed === 1 ? '' : 'n'}${clampNote}${violationNote}`;

  result.groups.forEach((g) => {
    const card = document.createElement('div');
    card.className = 'plaque group-card';
    const lines = g.personGroups
      .map(
        (pg) => `
        <div class="pg-line">
          <span class="pg-line-names">${escapeHtml(pg.memberIds.map(store.personName).join(', '))}</span>
          <span class="pg-line-meta">${pg.stations} Stat. ${pg.alcohol ? '🍷' : ''}${pg.food ? '🍽' : ''}</span>
        </div>`
      )
      .join('');
    card.innerHTML = `
      <div class="group-card-header">
        <span class="group-number">Gruppe ${g.index}</span>
        <span class="group-stats">${g.stations} Stat. · 🍷 ${g.alcohol} · 🍽 ${g.food} · 👤 ${g.people}</span>
      </div>
      <hr class="group-divider" />
      ${lines}
    `;
    groupsEl.appendChild(card);
  });
}

document.getElementById('btn-export').addEventListener('click', () => {
  const data = store.exportState();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tour-de-chambre-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('file-import').click();
});

document.getElementById('file-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    store.importState(text);
    renderAll();
    toast('Daten importiert');
  } catch (err) {
    toast('Datei konnte nicht gelesen werden.');
  }
  e.target.value = '';
});

document.getElementById('btn-reset').addEventListener('click', () => {
  if (confirm('Wirklich alle Personen, Stationsgruppen und Regeln löschen?')) {
    store.resetState();
    renderAll();
    document.getElementById('result-groups').innerHTML = '';
    document.getElementById('result-summary').classList.add('hidden');
    document.getElementById('result-empty').classList.add('hidden');
    toast('Alles gelöscht');
  }
});

function renderAll() {
  renderPeopleList();
  renderPgList();
  renderRuleSelects();
  renderRulesList();
  renderEinteilungSettings();
}

renderAll();
showTab('personen');

if (!store.getState().settings.seed) {
  store.updateSettings({ seed: randomSeedString() });
  renderEinteilungSettings();
}

// Register service worker for offline use.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline support is best-effort */
    });
  });
}
