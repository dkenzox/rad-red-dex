#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DATA_JS_PATH = path.join(ROOT, "data.js");

const MATCHUP_VALUE_TO_MULTIPLIER = {
  0: 1,
  1: 0,
  5: 0.5,
  20: 2,
};

function readDataJs(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  return vm.runInNewContext(`(${source})`);
}

function writeJson(fileName, value) {
  const destination = path.join(ROOT, fileName);
  fs.writeFileSync(destination, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function orderedEntries(collection) {
  return Object.values(collection).sort((a, b) => a.ID - b.ID);
}

function computeLearnedMoveIds(mon, data) {
  const moveIds = [];

  if (Array.isArray(mon.levelupMoves)) {
    for (const [moveId] of mon.levelupMoves)
      moveIds.push(moveId);
  }

  if (Array.isArray(mon.tmMoves)) {
    for (const tmIndex of mon.tmMoves) {
      if (data.tmMoves?.[tmIndex] !== undefined)
        moveIds.push(data.tmMoves[tmIndex]);
    }
  }

  if (Array.isArray(mon.tutorMoves)) {
    for (const tutorIndex of mon.tutorMoves) {
      if (data.tutorMoves?.[tutorIndex] !== undefined)
        moveIds.push(data.tutorMoves[tutorIndex]);
    }
  }

  if (Array.isArray(mon.eggMoves))
    moveIds.push(...mon.eggMoves);

  return [...new Set(moveIds.filter((moveId) => moveId > 0))].sort((a, b) => a - b);
}

function buildSpeciesSummary(data) {
  const summary = {};

  for (const mon of orderedEntries(data.species)) {
    summary[mon.ID] = {
      ID: mon.ID,
      name: mon.name,
      key: mon.key,
      dexID: mon.dexID,
      ancestor: mon.ancestor,
      order: mon.order,
      stats: mon.stats,
      type: mon.type,
      abilities: mon.abilities,
      learnedMoveIds: computeLearnedMoveIds(mon, data),
    };
  }

  return summary;
}

function buildSpeciesDetails(data) {
  const details = {};

  for (const mon of orderedEntries(data.species)) {
    details[mon.ID] = {
      eggGroup: mon.eggGroup || [],
      items: mon.items || [],
      levelupMoves: mon.levelupMoves || [],
      evolutions: mon.evolutions || [],
      tmMoves: mon.tmMoves || [],
      tutorMoves: mon.tutorMoves || [],
      eggMoves: mon.eggMoves || [],
      prevoMoves: mon.prevoMoves || [],
      eventMoves: mon.eventMoves || [],
      changes: mon.changes || null,
    };
  }

  return details;
}

function buildMovesExport(data) {
  const moves = {};

  for (const move of orderedEntries(data.moves))
    moves[move.ID] = move;

  return moves;
}

function buildAbilitiesExport(data) {
  const abilities = {};

  for (const ability of orderedEntries(data.abilities))
    abilities[ability.ID] = ability;

  return abilities;
}

function buildTypesExport(data) {
  const byId = {};
  const typeOrder = [];
  const matrix = {};
  const summaries = [];
  const types = orderedEntries(data.types);

  for (const type of types) {
    byId[type.ID] = type;
    typeOrder.push({
      id: type.ID,
      name: type.name,
      color: type.color,
    });
  }

  for (const attacker of types) {
    matrix[attacker.name] = {};
    for (const defender of types) {
      const rawValue = attacker.matchup?.[defender.ID] ?? 0;
      matrix[attacker.name][defender.name] = MATCHUP_VALUE_TO_MULTIPLIER[rawValue] ?? null;
    }
  }

  for (const type of types) {
    const offenseEntries = Object.entries(matrix[type.name]);
    const defenseEntries = types.map((attacker) => ({
      attacker: attacker.name,
      multiplier: matrix[attacker.name][type.name],
    }));

    summaries.push({
      id: type.ID,
      name: type.name,
      color: type.color,
      offense: {
        strongAgainst: offenseEntries.filter(([, mult]) => mult > 1).map(([name]) => name),
        weakAgainst: offenseEntries.filter(([, mult]) => mult > 0 && mult < 1).map(([name]) => name),
        noEffectAgainst: offenseEntries.filter(([, mult]) => mult === 0).map(([name]) => name),
      },
      defense: {
        weakTo: defenseEntries.filter(({ multiplier }) => multiplier > 1).map(({ attacker }) => attacker),
        resists: defenseEntries.filter(({ multiplier }) => multiplier > 0 && multiplier < 1).map(({ attacker }) => attacker),
        immuneTo: defenseEntries.filter(({ multiplier }) => multiplier === 0).map(({ attacker }) => attacker),
      },
    });
  }

  return {
    byId,
    multiplierEncoding: MATCHUP_VALUE_TO_MULTIPLIER,
    typeOrder,
    matrix,
    types: summaries,
  };
}

function buildSupportData(data) {
  return {
    tmMoves: data.tmMoves || {},
    tutorMoves: data.tutorMoves || {},
    items: data.items || {},
    areas: data.areas || {},
    trainers: data.trainers || {},
    natures: data.natures || {},
    eggGroups: data.eggGroups || {},
    splits: data.splits || {},
    evolutions: data.evolutions || {},
    scaledLevels: data.scaledLevels || {},
    capIDs: data.caps || {},
  };
}

function buildSpritesExport(data) {
  return data.sprites || {};
}

function main() {
  const data = readDataJs(DATA_JS_PATH);
  const speciesSummary = buildSpeciesSummary(data);
  const speciesDetails = buildSpeciesDetails(data);
  const movements = buildMovesExport(data);
  const abilities = buildAbilitiesExport(data);
  const types = buildTypesExport(data);
  const support = buildSupportData(data);
  const sprites = buildSpritesExport(data);

  writeJson("species-summary.json", speciesSummary);
  writeJson("species-details.json", speciesDetails);
  writeJson("movements.json", movements);
  writeJson("abilities.json", abilities);
  writeJson("types.json", types);
  writeJson("support-data.json", support);
  writeJson("sprites.json", sprites);

  console.log(JSON.stringify({
    speciesSummary: Object.keys(speciesSummary).length,
    speciesDetails: Object.keys(speciesDetails).length,
    movements: Object.keys(movements).length,
    abilities: Object.keys(abilities).length,
    types: types.types.length,
    sprites: Object.keys(sprites).length,
  }, null, 2));
}

main();
