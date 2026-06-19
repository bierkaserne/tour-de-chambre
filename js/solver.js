// Solver: assigns PersonenGruppen (station-preparing teams) into a fixed
// number of final Gruppen, respecting (in strict priority order):
//   1. person-specific "muss zusammen" / "darf nicht zusammen" Regeln
//   2. equal number of Stationen per Gruppe (off by at most 1 if uneven)
//   3. similar number of Alkohol- and Essens-Stationen per Gruppe
//   4. similar number of Personen per Gruppe
//
// The whole thing is deterministic given the same input + seed.

import { makeRng } from './prng.js';

/**
 * Merge PersonenGruppen connected by "together" Regeln into Units (a Unit
 * always stays inside one final Gruppe), and translate "apart" Regeln into
 * forbidden Unit-pairs. Returns issues for rules that could not be applied.
 */
function buildUnits(personGroups, rules) {
  const n = personGroups.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a, b) {
    a = find(a);
    b = find(b);
    if (a !== b) parent[a] = b;
  }

  const personToPG = new Map();
  personGroups.forEach((pg, i) => {
    pg.memberIds.forEach((pid) => personToPG.set(pid, i));
  });

  const issues = [];
  const togetherPairs = [];
  const apartPairsPG = [];

  for (const rule of rules) {
    const iA = personToPG.get(rule.personA);
    const iB = personToPG.get(rule.personB);
    if (iA == null || iB == null) {
      issues.push({ rule, reason: 'unassigned' });
      continue;
    }
    if (rule.type === 'together') {
      if (iA !== iB) togetherPairs.push([iA, iB]);
    } else if (rule.type === 'apart') {
      if (iA === iB) {
        issues.push({ rule, reason: 'contradiction-same-group' });
      } else {
        apartPairsPG.push([iA, iB]);
      }
    }
  }

  togetherPairs.forEach(([a, b]) => union(a, b));

  const unitsByRoot = new Map();
  personGroups.forEach((pg, i) => {
    const root = find(i);
    if (!unitsByRoot.has(root)) {
      unitsByRoot.set(root, {
        pgIndices: [],
        stations: 0,
        alcohol: 0,
        food: 0,
        people: 0,
      });
    }
    const u = unitsByRoot.get(root);
    u.pgIndices.push(i);
    u.stations += pg.stations;
    u.alcohol += pg.alcohol ? pg.stations : 0;
    u.food += pg.food ? pg.stations : 0;
    u.people += pg.memberIds.length;
  });

  const units = Array.from(unitsByRoot.values());
  const pgToUnit = new Map();
  units.forEach((u, ui) => u.pgIndices.forEach((pgi) => pgToUnit.set(pgi, ui)));

  const forbiddenPairs = new Set();
  for (const [a, b] of apartPairsPG) {
    const ua = pgToUnit.get(a);
    const ub = pgToUnit.get(b);
    if (ua === ub) {
      issues.push({ reason: 'contradiction-merged-by-together' });
      continue;
    }
    forbiddenPairs.add(ua < ub ? `${ua}-${ub}` : `${ub}-${ua}`);
  }

  return { units, forbiddenPairs, issues };
}

function evaluate(units, assignment, numGroups, forbiddenPairs) {
  const groups = Array.from({ length: numGroups }, () => ({
    stations: 0,
    alcohol: 0,
    food: 0,
    people: 0,
  }));

  units.forEach((u, i) => {
    const g = groups[assignment[i]];
    g.stations += u.stations;
    g.alcohol += u.alcohol;
    g.food += u.food;
    g.people += u.people;
  });

  let violations = 0;
  for (const key of forbiddenPairs) {
    const [a, b] = key.split('-').map(Number);
    if (assignment[a] === assignment[b]) violations++;
  }

  const spread = (arr) => Math.max(...arr) - Math.min(...arr);

  return {
    violations,
    stationSpread: spread(groups.map((g) => g.stations)),
    alcoholFoodSpread:
      spread(groups.map((g) => g.alcohol)) + spread(groups.map((g) => g.food)),
    peopleSpread: spread(groups.map((g) => g.people)),
  };
}

// Lexicographic comparison, in priority order. Negative => a is better.
function compareLex(a, b) {
  if (a.violations !== b.violations) return a.violations - b.violations;
  if (a.stationSpread !== b.stationSpread) return a.stationSpread - b.stationSpread;
  if (a.alcoholFoodSpread !== b.alcoholFoodSpread)
    return a.alcoholFoodSpread - b.alcoholFoodSpread;
  return a.peopleSpread - b.peopleSpread;
}

function countViolationsFor(unitIdx, targetGroup, assignment, forbiddenPairs) {
  let v = 0;
  for (const key of forbiddenPairs) {
    const [a, b] = key.split('-').map(Number);
    if (a === unitIdx && assignment[b] === targetGroup) v++;
    if (b === unitIdx && assignment[a] === targetGroup) v++;
  }
  return v;
}

/**
 * @param personGroups {Array} [{id, memberIds:[], stations, alcohol, food}]
 * @param rules {Array} [{personA, personB, type: 'together'|'apart'}]
 * @param numGroups {number} desired number of final Gruppen
 * @param seed {string}
 * @param opts
 */
export function solve(personGroups, rules, numGroups, seed, opts = {}) {
  const { iterations = 3000, restarts = 14 } = opts;
  const { units, forbiddenPairs, issues } = buildUnits(personGroups, rules);

  const result = {
    issues,
    unitsCount: units.length,
    numGroupsRequested: numGroups,
    numGroupsUsed: 0,
    seed,
    groups: [],
  };

  if (units.length === 0) return result;

  const N = Math.max(1, Math.min(numGroups, units.length));
  result.numGroupsUsed = N;

  const rng = makeRng(seed);

  function shuffledOrder() {
    const arr = units.map((_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function greedyAssign(order) {
    const assignment = new Array(units.length).fill(-1);
    const groupStations = new Array(N).fill(0);
    for (const idx of order) {
      let bestG = 0;
      let bestScore = Infinity;
      for (let g = 0; g < N; g++) {
        const viol = countViolationsFor(idx, g, assignment, forbiddenPairs);
        const score = viol * 1e6 + groupStations[g];
        if (score < bestScore) {
          bestScore = score;
          bestG = g;
        }
      }
      assignment[idx] = bestG;
      groupStations[bestG] += units[idx].stations;
    }
    return assignment;
  }

  let best = null;
  let bestEval = null;

  for (let r = 0; r < restarts; r++) {
    let assignment = greedyAssign(shuffledOrder());
    let evalRes = evaluate(units, assignment, N, forbiddenPairs);

    for (let it = 0; it < iterations; it++) {
      if (units.length < 2) break;
      const i = Math.floor(rng() * units.length);
      const candidate = assignment.slice();
      if (rng() < 0.5) {
        const newG = Math.floor(rng() * N);
        if (newG === candidate[i]) continue;
        candidate[i] = newG;
      } else {
        const j = Math.floor(rng() * units.length);
        if (i === j) continue;
        [candidate[i], candidate[j]] = [candidate[j], candidate[i]];
      }
      const candEval = evaluate(units, candidate, N, forbiddenPairs);
      if (compareLex(candEval, evalRes) <= 0) {
        assignment = candidate;
        evalRes = candEval;
      }
    }

    if (!bestEval || compareLex(evalRes, bestEval) < 0) {
      bestEval = evalRes;
      best = assignment;
    }
  }

  const groupsOut = Array.from({ length: N }, (_, g) => ({
    index: g + 1,
    stations: 0,
    alcohol: 0,
    food: 0,
    people: 0,
    personGroups: [],
  }));

  units.forEach((u, ui) => {
    const g = groupsOut[best[ui]];
    u.pgIndices.forEach((pgi) => g.personGroups.push(personGroups[pgi]));
  });

  groupsOut.forEach((g) => {
    g.stations = g.personGroups.reduce((s, pg) => s + pg.stations, 0);
    g.alcohol = g.personGroups.reduce((s, pg) => s + (pg.alcohol ? pg.stations : 0), 0);
    g.food = g.personGroups.reduce((s, pg) => s + (pg.food ? pg.stations : 0), 0);
    g.people = g.personGroups.reduce((s, pg) => s + pg.memberIds.length, 0);
  });

  result.groups = groupsOut;
  result.violations = bestEval.violations;
  result.stationSpread = bestEval.stationSpread;
  result.alcoholFoodSpread = bestEval.alcoholFoodSpread;
  result.peopleSpread = bestEval.peopleSpread;

  return result;
}
