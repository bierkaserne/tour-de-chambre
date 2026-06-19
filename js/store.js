// Central app state: people, PersonenGruppen (Stationen-Teams), Regeln
// (person constraints) and Einteilungs-Einstellungen. Persisted to
// localStorage so the data survives reloads / works offline.

const STORAGE_KEY = 'tdc-state-v1';

function uid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function defaultState() {
  return {
    version: 1,
    people: [],
    personGroups: [],
    rules: [],
    settings: {
      numGroups: 2,
      seed: 'start',
    },
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch (e) {
    console.warn('Konnte gespeicherten Stand nicht lesen, starte neu.', e);
    return defaultState();
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Konnte Stand nicht speichern.', e);
  }
}

export function getState() {
  return state;
}

// ---------- Personen ----------

export function addPerson(name) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const person = { id: uid(), name: trimmed };
  state.people.push(person);
  persist();
  return person;
}

export function renamePerson(id, name) {
  const p = state.people.find((p) => p.id === id);
  if (p && name.trim()) {
    p.name = name.trim();
    persist();
  }
}

export function removePerson(id) {
  state.people = state.people.filter((p) => p.id !== id);
  state.personGroups.forEach((pg) => {
    pg.memberIds = pg.memberIds.filter((pid) => pid !== id);
  });
  state.personGroups = state.personGroups.filter((pg) => pg.memberIds.length > 0);
  state.rules = state.rules.filter((r) => r.personA !== id && r.personB !== id);
  persist();
}

export function personGroupOf(personId) {
  return state.personGroups.find((pg) => pg.memberIds.includes(personId)) || null;
}

export function unassignedPeople() {
  const assigned = new Set();
  state.personGroups.forEach((pg) => pg.memberIds.forEach((id) => assigned.add(id)));
  return state.people.filter((p) => !assigned.has(p.id));
}

// ---------- PersonenGruppen (Stationen-Teams) ----------

export function addPersonGroup({ memberIds, stations, alcohol, food }) {
  const pg = {
    id: uid(),
    memberIds: [...memberIds],
    stations: Math.max(1, Math.round(stations) || 1),
    alcohol: !!alcohol,
    food: !!food,
  };
  state.personGroups.push(pg);
  persist();
  return pg;
}

export function updatePersonGroup(id, patch) {
  const pg = state.personGroups.find((g) => g.id === id);
  if (!pg) return;
  if (patch.memberIds) pg.memberIds = [...patch.memberIds];
  if (patch.stations != null) pg.stations = Math.max(1, Math.round(patch.stations) || 1);
  if (patch.alcohol != null) pg.alcohol = !!patch.alcohol;
  if (patch.food != null) pg.food = !!patch.food;
  persist();
}

export function removePersonGroup(id) {
  state.personGroups = state.personGroups.filter((g) => g.id !== id);
  persist();
}

export function personName(id) {
  const p = state.people.find((p) => p.id === id);
  return p ? p.name : '?';
}

// ---------- Regeln ----------

export function addRule({ personA, personB, type }) {
  if (!personA || !personB || personA === personB) return null;
  const exists = state.rules.find(
    (r) =>
      ((r.personA === personA && r.personB === personB) ||
        (r.personA === personB && r.personB === personA)) &&
      r.type === type
  );
  if (exists) return exists;
  const rule = { id: uid(), personA, personB, type };
  state.rules.push(rule);
  persist();
  return rule;
}

export function removeRule(id) {
  state.rules = state.rules.filter((r) => r.id !== id);
  persist();
}

// ---------- Einstellungen ----------

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  persist();
}

// ---------- Import / Export ----------

export function exportState() {
  return JSON.stringify(state, null, 2);
}

export function importState(json) {
  const parsed = JSON.parse(json);
  state = { ...defaultState(), ...parsed };
  persist();
}

export function resetState() {
  state = defaultState();
  persist();
}
