#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const CSV_DIR = path.join(ROOT, "csv");
const OUTPUT_DIR = path.join(ROOT, "output", "world-data");
const DATA_JS_PATH = path.join(ROOT, "data.js");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readDataJs(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  return vm.runInNewContext(`(${source})`);
}

function writeJson(fileName, value) {
  fs.writeFileSync(
    path.join(OUTPUT_DIR, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\x00-\x1f]/g, "")
    .replace(/[’']/g, "")
    .replace(/\bPok[eé]mon\b/gi, "Pokemon")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanCell(value) {
  return String(value || "")
    .replace(/\u2014/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlankRow(row) {
  return !row || row.every((cell) => !cleanCell(cell));
}

function nonEmptyCells(row) {
  return row
    .map((value, index) => [index, cleanCell(value)])
    .filter(([, value]) => value);
}

function parsePercent(value) {
  const normalized = cleanCell(value);
  const match = normalized.match(/^(\d+(?:\.\d+)?)%$/);
  return match ? Number(match[1]) : null;
}

function parsePrice(value) {
  const normalized = cleanCell(value);
  const match = normalized.replace(/\s+/g, "").match(/^\$?(\d+)$/);
  return match ? Number(match[1]) : null;
}

function parseLevelRange(value) {
  const normalized = cleanCell(value);
  if (!normalized)
    return { min: null, max: null, raw: "" };

  const rangeMatch = normalized.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    return {
      min: Number(rangeMatch[1]),
      max: Number(rangeMatch[2]),
      raw: normalized,
    };
  }

  const singleMatch = normalized.match(/^(\d+)$/);
  if (singleMatch) {
    return {
      min: Number(singleMatch[1]),
      max: Number(singleMatch[1]),
      raw: normalized,
    };
  }

  return { min: null, max: null, raw: normalized };
}

function looksLikePostgameMarker(value) {
  return /POST/i.test(cleanCell(value).replace(/\s+/g, ""));
}

function looksLikeSectionHeader(value) {
  const normalized = cleanCell(value);
  return Boolean(normalized) && normalized === normalized.toUpperCase();
}

function looksLikeMoveCode(value) {
  return /^(TM|HM)\s*\d+/i.test(cleanCell(value));
}

function normalizeCodeNumber(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  const normalized = digits.replace(/^0+/, "");
  return normalized || (digits ? "0" : "");
}

function formatMoveCode(codeType, codeNumber) {
  const normalizedNumber = normalizeCodeNumber(codeNumber);
  if (!normalizedNumber)
    return null;
  return `${String(codeType || "").toUpperCase()} ${normalizedNumber.padStart(3, "0")}`;
}

function extractTmMoveName(value) {
  const normalized = cleanCell(value);
  const match = normalized.match(/^(TM|HM)\s*0*(\d+)\s*-\s*(.+)$/i);
  if (!match)
    return null;

  return {
    codeType: match[1].toUpperCase(),
    codeNumber: match[2],
    moveName: cleanCell(match[3]),
  };
}

function loadLookups() {
  const data = readDataJs(DATA_JS_PATH);

  const speciesAliases = {
    "shellos-east": "Shellos",
    "basculin-blue": "Basculin-Blue-Striped",
    "alcremie-strbrry": "Alcremie",
    "ursaluna-bm": "Ursaluna-Bloodmoon",
    "burmy-sandy": "Burmy",
    "deerling-summer": "Deerling",
    "pumpkaboo-sm": "Pumpkaboo",
    "pumpkaboo-su": "Pumpkaboo",
    "gourgeist-su": "Gourgeist",
    "squawkabilly-g": "Squawkabilly",
    "zygarde-10": "Zygarde-10%",
  };

  const moveAliases = {
    "draining kiss": "Drain Kiss",
  };

  function registerAlias(map, key, value) {
    if (!key)
      return;
    const normalized = normalizeText(key).toLowerCase();
    if (!normalized || map.has(normalized))
      return;
    map.set(normalized, value);
  }

  const speciesByName = new Map();
  for (const mon of Object.values(data.species || {})) {
    const record = {
      id: mon.ID,
      name: mon.name,
      key: mon.key,
      dexId: mon.dexID,
      order: mon.order ?? 0,
    };

    registerAlias(speciesByName, mon.name, record);
    registerAlias(speciesByName, mon.key, record);
    registerAlias(speciesByName, mon.key?.replace(/-/g, " "), record);
    registerAlias(speciesByName, mon.name?.replace(/-/g, " "), record);
  }

  for (const [alias, canonical] of Object.entries(speciesAliases)) {
    const hit = speciesByName.get(normalizeText(canonical).toLowerCase());
    if (hit)
      speciesByName.set(alias, hit);
  }

  const movesByName = new Map();
  for (const move of Object.values(data.moves || {})) {
    const record = {
      id: move.ID,
      name: move.name,
    };
    registerAlias(movesByName, move.name, record);
  }

  for (const [alias, canonical] of Object.entries(moveAliases)) {
    const hit = movesByName.get(normalizeText(canonical).toLowerCase());
    if (hit)
      movesByName.set(alias, hit);
  }

  const itemsByName = new Map();
  for (const item of Object.values(data.items || {})) {
    const record = {
      id: item.ID,
      name: item.name,
    };
    registerAlias(itemsByName, item.name, record);
    registerAlias(itemsByName, item.name?.replace(/Poke Ball/g, "Poké Ball"), record);
  }

  const areasByName = new Map();
  for (const area of Object.values(data.areas || {})) {
    const record = {
      id: area.ID ?? null,
      name: area.name,
    };
    registerAlias(areasByName, area.name, record);
  }

  return { data, speciesByName, movesByName, itemsByName, areasByName };
}

function createContext(lookups) {
  const locations = [];
  const locationsBySlug = new Map();
  const pokemonAcquisitions = [];
  const moveAcquisitions = [];
  const itemAcquisitions = [];
  const raidDens = [];
  const notes = [];
  const warnings = [];

  function warn(type, payload) {
    warnings.push({ type, ...payload });
  }

  function resolveArea(rawName) {
    if (!rawName)
      return null;

    const normalized = normalizeText(rawName).toLowerCase();
    return lookups.areasByName.get(normalized) || null;
  }

  function upsertLocation(rawName, extra = {}) {
    const cleaned = cleanCell(rawName);
    if (!cleaned)
      return null;

    const slug = slugify(cleaned);
    if (locationsBySlug.has(slug))
      return locationsBySlug.get(slug);

    const area = resolveArea(cleaned);
    const location = {
      id: locations.length + 1,
      slug,
      name: cleaned,
      area_id: area?.id ?? null,
      area_name: area?.name ?? null,
      postgame: Boolean(extra.postgame),
      region_group: extra.region_group || null,
      notes: extra.notes || null,
      raw_name: rawName,
    };

    locations.push(location);
    locationsBySlug.set(slug, location);
    return location;
  }

  function resolveSpecies(rawName, sourceFile) {
    const normalized = normalizeText(rawName).toLowerCase();
    const hit = lookups.speciesByName.get(normalized) || null;
    if (!hit && rawName)
      warn("unmatched_species", { sourceFile, rawName: cleanCell(rawName) });
    return hit;
  }

  function resolveMove(rawName, sourceFile) {
    const normalized = normalizeText(rawName).toLowerCase();
    const hit = lookups.movesByName.get(normalized) || null;
    if (!hit && rawName)
      warn("unmatched_move", { sourceFile, rawName: cleanCell(rawName) });
    return hit;
  }

  function resolveItem(rawName, sourceFile) {
    const base = cleanCell(rawName)
      .replace(/\s*\[x\d+\]$/i, "")
      .replace(/\s+/g, " ");
    const normalized = normalizeText(base).toLowerCase();
    const hit = lookups.itemsByName.get(normalized) || null;
    if (!hit && base)
      warn("unmatched_item", { sourceFile, rawName: base });
    return hit;
  }

  function addPokemonAcquisition(entry) {
    pokemonAcquisitions.push({
      id: pokemonAcquisitions.length + 1,
      ...entry,
    });
  }

  function addMoveAcquisition(entry) {
    moveAcquisitions.push({
      id: moveAcquisitions.length + 1,
      ...entry,
    });
  }

  function addItemAcquisition(entry) {
    itemAcquisitions.push({
      id: itemAcquisitions.length + 1,
      ...entry,
    });
  }

  function addRaidDen(entry) {
    raidDens.push({
      id: raidDens.length + 1,
      ...entry,
    });
  }

  function addNote(entry) {
    notes.push({
      id: notes.length + 1,
      ...entry,
    });
  }

  return {
    warn,
    upsertLocation,
    resolveSpecies,
    resolveMove,
    resolveItem,
    addPokemonAcquisition,
    addMoveAcquisition,
    addItemAcquisition,
    addRaidDen,
    addNote,
    locations,
    pokemonAcquisitions,
    moveAcquisitions,
    itemAcquisitions,
    raidDens,
    notes,
    warnings,
  };
}

function parseTmHmFile(rows, sourceFile, ctx) {
  for (const row of rows.slice(1)) {
    const left = {
      kind: "tm",
      code: cleanCell(row[0]),
      moveName: cleanCell(row[2]),
      location: cleanCell(row[4]),
    };
    const right = {
      kind: "hm",
      code: cleanCell(row[11]),
      moveName: cleanCell(row[13]),
      location: cleanCell(row[15]),
    };

    for (const side of [left, right]) {
      if (!side.code || !side.moveName || !side.location)
        continue;

      const move = ctx.resolveMove(side.moveName, sourceFile);
      const location = ctx.upsertLocation(side.location);
      const codeType = side.kind;
      const codeNumber = normalizeCodeNumber(side.code);

      ctx.addMoveAcquisition({
        move_id: move?.id ?? null,
        move_name: move?.name ?? side.moveName,
        move_name_raw: side.moveName,
        acquisition_type: codeType,
        code: formatMoveCode(codeType, codeNumber),
        code_number: codeNumber,
        location_id: location?.id ?? null,
        location_name: location?.name ?? side.location,
        cost: null,
        requirements: null,
        hardcore_note: side.location.includes("Hardcore") ? side.location : null,
        notes: null,
        source_file: sourceFile,
      });
    }
  }
}

function parseMoveTutorsFile(rows, sourceFile, ctx) {
  let currentLocation = null;
  let currentNpc = null;
  let currentCost = null;

  for (const row of rows) {
    const locationCell = cleanCell(row[0]);
    const npcCell = cleanCell(row[2]);
    const moveCell = cleanCell(row[7]);
    const costCell = cleanCell(row[13]);

    if (locationCell && !/^Moves highlighted/i.test(locationCell) && !/^Locations\/Move Tutors/i.test(locationCell)) {
      currentLocation = locationCell;
      currentNpc = npcCell || currentNpc;
      currentCost = null;
      continue;
    }

    if (npcCell && !moveCell) {
      currentNpc = npcCell;
      continue;
    }

    if (costCell)
      currentCost = costCell;

    if (!moveCell)
      continue;

    if (["Move Relearner", "Move Deleter", "Egg Move Tutor"].includes(moveCell))
      continue;

    const move = ctx.resolveMove(moveCell, sourceFile);
    const location = ctx.upsertLocation(currentLocation);
    ctx.addMoveAcquisition({
      move_id: move?.id ?? null,
      move_name: move?.name ?? moveCell,
      move_name_raw: moveCell,
      acquisition_type: "tutor",
      code: null,
      code_number: null,
      location_id: location?.id ?? null,
      location_name: location?.name ?? currentLocation,
      npc_name: currentNpc,
      cost: currentCost ? parsePrice(currentCost) ?? currentCost : null,
      requirements: null,
      hardcore_note: null,
      notes: null,
      source_file: sourceFile,
    });
  }
}

function parseOverworldItemsFile(rows, sourceFile, ctx) {
  let currentArea = null;

  for (const row of rows) {
    const cells = nonEmptyCells(row);
    if (cells.length === 1) {
      currentArea = cells[0][1];
      continue;
    }

    if (cells.length < 2)
      continue;

    const itemCell = cells.find(([index]) => index >= 2 && index <= 4)?.[1] || null;
    const locationCell = cells[cells.length - 1]?.[1] || null;
    if (!itemCell || !locationCell)
      continue;

    const tmInfo = extractTmMoveName(itemCell);
    const item = tmInfo ? null : ctx.resolveItem(itemCell, sourceFile);
    const location = ctx.upsertLocation(locationCell || currentArea);
    ctx.addItemAcquisition({
      item_id: item?.id ?? null,
      item_name: item?.name ?? itemCell,
      item_name_raw: itemCell,
      item_category: "overworld",
      acquisition_type: "overworld",
      location_id: location?.id ?? null,
      location_name: location?.name ?? locationCell,
      cost: null,
      requirements: null,
      notes: currentArea && currentArea !== location?.name ? currentArea : null,
      source_file: sourceFile,
    });

    if (tmInfo) {
      const move = ctx.resolveMove(tmInfo.moveName, sourceFile);
      ctx.addMoveAcquisition({
        move_id: move?.id ?? null,
        move_name: move?.name ?? tmInfo.moveName,
        move_name_raw: tmInfo.moveName,
        acquisition_type: tmInfo.codeType.toLowerCase(),
        code: formatMoveCode(tmInfo.codeType, tmInfo.codeNumber),
        code_number: normalizeCodeNumber(tmInfo.codeNumber),
        location_id: location?.id ?? null,
        location_name: location?.name ?? locationCell,
        cost: null,
        requirements: null,
        hardcore_note: null,
        notes: null,
        source_file: sourceFile,
      });
    }
  }
}

function trimTrailingPeriod(value) {
  return String(value || "").replace(/\.+$/, "").trim();
}

function lowercaseFirst(value) {
  const normalized = cleanCell(value);
  if (!normalized)
    return "";
  return normalized.charAt(0).toLowerCase() + normalized.slice(1);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeClauseKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\b(a|an|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLocationSegments(value) {
  return String(value || "")
    .split(",")
    .map((segment) => trimTrailingPeriod(segment))
    .map((segment) => segment.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function dedupeLocationSegments(value) {
  const segments = splitLocationSegments(value);
  const deduped = [];

  for (const segment of segments) {
    const clauseKey = normalizeClauseKey(segment);
    if (!clauseKey)
      continue;

    let handled = false;
    for (let i = 0; i < deduped.length; i++) {
      const existingKey = normalizeClauseKey(deduped[i]);
      if (!existingKey)
        continue;

      if (existingKey === clauseKey || existingKey.includes(clauseKey)) {
        handled = true;
        break;
      }

      if (clauseKey.includes(existingKey)) {
        deduped[i] = segment;
        handled = true;
        break;
      }
    }

    if (!handled)
      deduped.push(segment);
  }

  return deduped.join(", ");
}

function looksLikeDetailPhrase(value) {
  return /^(from|near|behind|below|above|inside|outside|north|south|east|west|center|central|on|at|in|left|right|first|second|third|fourth|fifth|[A-Z]?\dF|B\dF|Area \d+|West Area|East Area|North Area|South Area)/i.test(cleanCell(value));
}

function stripKnownPrefix(value, prefix) {
  const cleanedValue = cleanCell(value);
  const cleanedPrefix = cleanCell(prefix);
  if (!cleanedValue || !cleanedPrefix)
    return cleanedValue;

  if (normalizeText(cleanedValue).toLowerCase().startsWith(normalizeText(cleanedPrefix).toLowerCase())) {
    return cleanedValue.replace(new RegExp(`^${escapeRegex(cleanedPrefix)}\\s*,?\\s*`, "i"), "");
  }

  return cleanedValue;
}

function extractLocationPrefix(value) {
  const segments = splitLocationSegments(value);
  if (!segments.length)
    return "";

  const prefix = [segments[0]];
  const second = segments[1];

  if (segments[0].match(/^\(POST-GAME\)/i) && second)
    prefix.push(second);
  else if (second && /^(?:[A-Z]?\dF|B\dF|Area \d+|West Area|East Area|North Area|South Area|Center Area|Western Area|Eastern Area)$/i.test(second))
    prefix.push(second);

  return dedupeLocationSegments(prefix.join(", "));
}

function scoreLocationText(value) {
  const text = cleanCell(value);
  if (!text)
    return -Infinity;

  const lowered = text.toLowerCase();
  const segments = splitLocationSegments(text);
  const clauseKeys = segments.map(normalizeClauseKey);
  const repeatedClausePenalty = clauseKeys.length - new Set(clauseKeys).size;
  const duplicateKeywordPenalty =
    Math.max(0, (lowered.match(/\bfrom\b/g) || []).length - 1) * 8 +
    Math.max(0, (lowered.match(/\bnear\b/g) || []).length - 1) * 4 +
    Math.max(0, (lowered.match(/\binside\b/g) || []).length - 1) * 4 +
    Math.max(0, (lowered.match(/\babove\b/g) || []).length - 1) * 3 +
    Math.max(0, (lowered.match(/\bbelow\b/g) || []).length - 1) * 3;

  const areaReward = /route|city|cave|forest|tower|zone|island|road|mansion|gym|museum|hideout|s\.s\. anne|power plant|victory road|mt\.|seafoam|silph/i.test(text)
    ? 10
    : 0;
  const detailReward = Math.min(text.length, 120) * 0.08;
  const segmentPenalty = Math.max(0, segments.length - 3) * 2.5;
  const malformedPenalty = /[A-Za-z] From\b/.test(text) ? 6 : 0;

  return detailReward + areaReward - duplicateKeywordPenalty - segmentPenalty - repeatedClausePenalty * 6 - malformedPenalty;
}

function mergeMoveLocationText(primary, secondary) {
  const first = cleanCell(primary);
  const second = cleanCell(secondary);
  if (!first)
    return second;
  if (!second)
    return first;

  const normalizedFirst = normalizeText(first).toLowerCase();
  const normalizedSecond = normalizeText(second).toLowerCase();
  if (normalizedFirst === normalizedSecond)
    return first;
  if (normalizedFirst.includes(normalizedSecond))
    return first;
  if (normalizedSecond.includes(normalizedFirst))
    return second;

  const firstPrefix = extractLocationPrefix(first);
  let secondDetail = second;
  const secondPrefix = extractLocationPrefix(second);
  if (secondPrefix)
    secondDetail = stripKnownPrefix(secondDetail, secondPrefix);
  if (firstPrefix)
    secondDetail = stripKnownPrefix(secondDetail, firstPrefix);

  const firstPrefixSegments = splitLocationSegments(firstPrefix);
  const leadingDetailSegment = splitLocationSegments(secondDetail)[0] || "";
  if (firstPrefixSegments.length && leadingDetailSegment) {
    for (const segment of firstPrefixSegments) {
      const floorMatch = leadingDetailSegment.match(/^([A-Z]?\dF|B\dF|Area \d+|West Area|East Area|North Area|South Area)\s*,?\s*/i);
      if (floorMatch && normalizeText(segment).toLowerCase() === normalizeText(floorMatch[1]).toLowerCase()) {
        secondDetail = secondDetail.replace(new RegExp(`^${escapeRegex(floorMatch[0])}`, "i"), "");
        break;
      }
    }
  }

  const candidates = [
    dedupeLocationSegments(first),
    dedupeLocationSegments(second),
  ];

  if (firstPrefix && looksLikeDetailPhrase(secondDetail)) {
    const loweredDetail = lowercaseFirst(secondDetail);
    if (loweredDetail)
      candidates.push(dedupeLocationSegments(`${trimTrailingPeriod(firstPrefix)}, ${loweredDetail}`));
  }

  if (secondPrefix && looksLikeDetailPhrase(stripKnownPrefix(first, secondPrefix))) {
    const firstDetail = lowercaseFirst(stripKnownPrefix(first, secondPrefix));
    if (firstDetail)
      candidates.push(dedupeLocationSegments(`${trimTrailingPeriod(secondPrefix)}, ${firstDetail}`));
  }

  return candidates
    .filter(Boolean)
    .sort((left, right) => scoreLocationText(right) - scoreLocationText(left))[0];
}

function mergeMoveAcquisitionEntries(entries, upsertLocation) {
  if (entries.length <= 1)
    return entries[0] || null;

  const sourceRank = (entry) => {
    if (entry.source_file?.includes("TMs & HMs"))
      return 0;
    if (entry.source_file?.includes("Overworld Items"))
      return 1;
    return 2;
  };

  const sorted = [...entries].sort((left, right) => sourceRank(left) - sourceRank(right));
  const merged = { ...sorted[0] };
  merged.acquisition_type = sorted.some((entry) => entry.acquisition_type === "hm") ? "hm" : merged.acquisition_type;
  merged.code_number = normalizeCodeNumber(merged.code_number);
  merged.code = formatMoveCode(merged.acquisition_type, merged.code_number) || merged.code;

  const notes = new Set();
  for (const entry of sorted) {
    merged.location_name = mergeMoveLocationText(merged.location_name, entry.location_name);
    if (entry.notes)
      notes.add(entry.notes);
    if (!merged.requirements && entry.requirements)
      merged.requirements = entry.requirements;
    if (!merged.hardcore_note && entry.hardcore_note)
      merged.hardcore_note = entry.hardcore_note;
  }

  if (merged.location_name) {
    const location = upsertLocation(merged.location_name);
    merged.location_id = location?.id ?? null;
    merged.location_name = location?.name ?? merged.location_name;
  }

  merged.notes = notes.size ? Array.from(notes).join(" • ") : null;
  return merged;
}

function normalizeMoveAcquisitions(ctx) {
  const grouped = new Map();
  const passthrough = [];

  for (const entry of ctx.moveAcquisitions) {
    const normalizedCodeNumber = normalizeCodeNumber(entry.code_number);
    const isTmhm = ["tm", "hm"].includes(entry.acquisition_type) && normalizedCodeNumber;

    if (!isTmhm) {
      passthrough.push(entry);
      continue;
    }

    const moveKey = entry.move_id ?? normalizeText(entry.move_name_raw).toLowerCase();
    const key = `${moveKey}|${normalizedCodeNumber}`;
    if (!grouped.has(key))
      grouped.set(key, []);
    grouped.get(key).push({
      ...entry,
      code_number: normalizedCodeNumber,
      code: formatMoveCode(entry.acquisition_type, normalizedCodeNumber) || entry.code,
    });
  }

  const merged = passthrough.slice();
  for (const entries of grouped.values()) {
    const mergedEntry = mergeMoveAcquisitionEntries(entries, ctx.upsertLocation);
    if (mergedEntry)
      merged.push(mergedEntry);
  }

  ctx.moveAcquisitions.length = 0;
  merged
    .sort((left, right) => {
      const leftName = cleanCell(left.move_name || left.move_name_raw);
      const rightName = cleanCell(right.move_name || right.move_name_raw);
      if (leftName !== rightName)
        return leftName.localeCompare(rightName);
      return String(left.code || "").localeCompare(String(right.code || ""));
    })
    .forEach((entry, index) => {
      ctx.moveAcquisitions.push({
        ...entry,
        id: index + 1,
      });
    });
}

function parseShopsFile(rows, sourceFile, ctx) {
  let currentShop = null;

  for (const row of rows) {
    const cells = nonEmptyCells(row);
    if (cells.length === 1 && looksLikeSectionHeader(cells[0][1])) {
      currentShop = cells[0][1];
      ctx.upsertLocation(currentShop);
      continue;
    }

    if (!currentShop || cells.length < 2)
      continue;

    const itemCell = cells.find(([index]) => index >= 6 && index <= 8)?.[1] || null;
    const priceCell = cells[cells.length - 1]?.[1] || null;
    if (!itemCell || !priceCell)
      continue;

    const location = ctx.upsertLocation(currentShop);
    const tmInfo = extractTmMoveName(itemCell);
    const item = tmInfo ? null : ctx.resolveItem(itemCell, sourceFile);

    ctx.addItemAcquisition({
      item_id: item?.id ?? null,
      item_name: item?.name ?? itemCell,
      item_name_raw: itemCell,
      item_category: "shop",
      acquisition_type: "shop",
      location_id: location?.id ?? null,
      location_name: location?.name ?? currentShop,
      cost: parsePrice(priceCell) ?? priceCell,
      requirements: null,
      notes: null,
      source_file: sourceFile,
    });

    if (tmInfo) {
      const move = ctx.resolveMove(tmInfo.moveName, sourceFile);
      ctx.addMoveAcquisition({
        move_id: move?.id ?? null,
        move_name: move?.name ?? tmInfo.moveName,
        move_name_raw: tmInfo.moveName,
        acquisition_type: "tm_shop",
        code: `${tmInfo.codeType} ${tmInfo.codeNumber.padStart(3, "0")}`,
        code_number: tmInfo.codeNumber,
        location_id: location?.id ?? null,
        location_name: location?.name ?? currentShop,
        cost: parsePrice(priceCell) ?? priceCell,
        requirements: null,
        hardcore_note: null,
        notes: "Sold in shop",
        source_file: sourceFile,
      });
    }
  }
}

function parseFossilsFile(rows, sourceFile, ctx) {
  const locationName = "Vermilion City Fanclub";
  const museumLocation = "Pewter Museum";
  const moonLocation = "Mt. Moon";
  const headerRowIndex = rows.findIndex((row) => nonEmptyCells(row).some(([, value]) => /GREEN SHARD/i.test(value)));
  if (headerRowIndex === -1)
    return;

  const headerCells = nonEmptyCells(rows[headerRowIndex]);
  const groups = headerCells.map(([index, value]) => ({ index, header: value }));

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (isBlankRow(row))
      continue;

    for (const group of groups) {
      const speciesName = cleanCell(row[group.index]);
      if (!speciesName)
        continue;

      const species = ctx.resolveSpecies(speciesName, sourceFile);
      let location = null;
      let requirements = null;
      let notes = null;

      if (/SHARD/i.test(group.header)) {
        location = ctx.upsertLocation(locationName);
        requirements = `Trade ${group.header}`;
        notes = "Fossil vendor / shard exchange";
      } else if (/MT\. MOON/i.test(group.header)) {
        location = ctx.upsertLocation(moonLocation);
        requirements = "Choose fossil in Mt. Moon, then revive";
      } else if (/PEWTER MUSEUM/i.test(group.header)) {
        location = ctx.upsertLocation(museumLocation);
        requirements = "Revive museum fossil";
      }

      ctx.addPokemonAcquisition({
        species_id: species?.id ?? null,
        species_name: species?.key ?? speciesName,
        species_name_raw: speciesName,
        acquisition_type: "fossil",
        method: "fossil",
        location_id: location?.id ?? null,
        location_name: location?.name ?? null,
        subarea: null,
        rarity: null,
        rarity_percent: null,
        level_min: null,
        level_max: null,
        level_raw: null,
        time_of_day: null,
        requirements,
        notes,
        postgame: false,
        source_file: sourceFile,
      });
    }
  }
}

function parseEggVendorAndGameCornerFile(rows, sourceFile, ctx) {
  const mansionLocation = "Celadon City Mansion";
  const gameCornerLocation = "Celadon City's Game Corner";
  const shardHeaderIndex = rows.findIndex((row) => nonEmptyCells(row).some(([, value]) => /GREEN SHARD/i.test(value)));
  if (shardHeaderIndex !== -1) {
    const groups = nonEmptyCells(rows[shardHeaderIndex]).map(([index, value]) => ({ index, header: value }));
    for (let rowIndex = shardHeaderIndex + 2; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const cells = nonEmptyCells(row);
      if (!cells.length)
        continue;
      if (cells.some(([, value]) => /GAME CORNER/i.test(value)))
        break;

      for (const group of groups) {
        const speciesName = cleanCell(row[group.index]);
        if (!speciesName)
          continue;
        const species = ctx.resolveSpecies(speciesName, sourceFile);
        const location = ctx.upsertLocation(mansionLocation);
        ctx.addPokemonAcquisition({
          species_id: species?.id ?? null,
          species_name: species?.key ?? speciesName,
          species_name_raw: speciesName,
          acquisition_type: "egg_vendor",
          method: "egg_vendor",
          location_id: location?.id ?? null,
          location_name: location?.name ?? mansionLocation,
          subarea: null,
          rarity: null,
          rarity_percent: null,
          level_min: null,
          level_max: null,
          level_raw: null,
          time_of_day: null,
          requirements: `Trade 1 ${group.header}`,
          notes: /Pikachu/i.test(speciesName) ? "Special Pikachu reward" : "Random starter egg of matching shard color",
          postgame: false,
          source_file: sourceFile,
        });
      }
    }
  }

  const priceRowIndex = rows.findIndex((row) => nonEmptyCells(row).some(([, value]) => /\$100,?000/.test(value)));
  if (priceRowIndex === -1)
    return;

  for (let rowIndex = priceRowIndex + 2; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const cells = nonEmptyCells(row);
    if (!cells.length)
      continue;

    for (const [index, value] of cells) {
      if (index < 3)
        continue;
      const species = ctx.resolveSpecies(value, sourceFile);
      const location = ctx.upsertLocation(gameCornerLocation);
      ctx.addPokemonAcquisition({
        species_id: species?.id ?? null,
        species_name: species?.key ?? value,
        species_name_raw: value,
        acquisition_type: "game_corner",
        method: "game_corner",
        location_id: location?.id ?? null,
        location_name: location?.name ?? gameCornerLocation,
        subarea: null,
        rarity: null,
        rarity_percent: null,
        level_min: null,
        level_max: null,
        level_raw: null,
        time_of_day: null,
        requirements: "$100,000",
        notes: "Hidden Ability selectable; shiny costs +$100,000",
        postgame: false,
        source_file: sourceFile,
      });
    }
  }
}

function parseMysteryGiftsFile(rows, sourceFile, ctx) {
  const location = ctx.upsertLocation("Pokemon Center - Mystery Gift");
  for (const row of rows) {
    const speciesName = cleanCell(row[3]);
    const code = cleanCell(row[5]);
    const info = cleanCell(row[7]);
    if (!speciesName || speciesName === "POKEMON")
      continue;

    const species = ctx.resolveSpecies(speciesName, sourceFile);
    ctx.addPokemonAcquisition({
      species_id: species?.id ?? null,
      species_name: species?.key ?? speciesName,
      species_name_raw: speciesName,
      acquisition_type: "mystery_gift",
      method: "mystery_gift",
      location_id: location?.id ?? null,
      location_name: location?.name ?? "Pokemon Center - Mystery Gift",
      subarea: null,
      rarity: null,
      rarity_percent: null,
      level_min: 85,
      level_max: 85,
      level_raw: "85",
      time_of_day: null,
      requirements: "Hall of Fame required",
      notes: [code ? `Code: ${code}` : null, info || null].filter(Boolean).join(" • ") || null,
      postgame: true,
      source_file: sourceFile,
    });
  }
}

function parsePairedItemLocationsFile(rows, sourceFile, ctx, itemCategory) {
  for (let index = 0; index < rows.length - 1; index++) {
    const itemCells = nonEmptyCells(rows[index]).filter(([, value]) => !looksLikeSectionHeader(value));
    const locationCells = nonEmptyCells(rows[index + 1]);
    if (!itemCells.length || !locationCells.length)
      continue;

    for (const [itemIndex, itemName] of itemCells) {
      if (!/[A-Za-z]/.test(itemName) || /LOCATION/i.test(itemName))
        continue;

      const matchingLocation = locationCells.find(([locationIndex]) => locationIndex === itemIndex - 1 || locationIndex === itemIndex) || null;
      if (!matchingLocation)
        continue;

      const item = ctx.resolveItem(itemName, sourceFile);
      const location = ctx.upsertLocation(matchingLocation[1]);
      ctx.addItemAcquisition({
        item_id: item?.id ?? null,
        item_name: item?.name ?? itemName,
        item_name_raw: itemName,
        item_category: itemCategory,
        acquisition_type: itemCategory,
        location_id: location?.id ?? null,
        location_name: location?.name ?? matchingLocation[1],
        cost: null,
        requirements: null,
        notes: null,
        source_file: sourceFile,
      });
    }
  }
}

function parseOtherUsefulItemsFile(rows, sourceFile, ctx) {
  let itemColumns = [];

  for (const row of rows) {
    const cells = nonEmptyCells(row);
    if (!cells.length)
      continue;

    if (cells.some(([, value]) => /SHARDS/i.test(value)) && cells.some(([, value]) => /GREEN SHARD|BLUE SHARD|RED SHARD|YELLOW SHARD/i.test(value))) {
      itemColumns = cells
        .filter(([, value]) => /SHARD/i.test(value))
        .map(([index, value]) => ({ index, itemName: value }));
      continue;
    }

    if (!itemColumns.length)
      continue;

    for (const { index, itemName } of itemColumns) {
      const speciesName = cleanCell(row[index]);
      if (!speciesName)
        continue;

      const item = ctx.resolveItem(itemName, sourceFile);
      const species = ctx.resolveSpecies(speciesName, sourceFile);
      ctx.addItemAcquisition({
        item_id: item?.id ?? null,
        item_name: item?.name ?? itemName,
        item_name_raw: itemName,
        item_category: "useful_item",
        acquisition_type: "drop_source",
        location_id: null,
        location_name: null,
        source_species_id: species?.id ?? null,
        source_species_name: species?.key ?? speciesName,
        cost: null,
        requirements: null,
        notes: "Drop / farm source from reference sheet",
        source_file: sourceFile,
      });
    }
  }
}

function parseSimpleEncounterMatrix(rows, sourceFile, ctx, acquisitionType) {
  const headerRow = rows.find((row) => nonEmptyCells(row).length > 8);
  const subHeaderRowIndex = rows.indexOf(headerRow) + 1;
  const subHeaderRow = rows[subHeaderRowIndex];
  if (!headerRow || !subHeaderRow)
    return;

  const locationHeaders = nonEmptyCells(headerRow);
  let postgame = false;
  const groups = [];
  for (const [index, value] of locationHeaders) {
    if (looksLikePostgameMarker(value)) {
      postgame = true;
      continue;
    }

    groups.push({
      rarityIndex: index - 1,
      pokemonIndex: index + 1,
      levelIndex: index + 2,
      locationName: value,
      postgame,
    });
    ctx.upsertLocation(value, { postgame });
  }

  for (let rowIndex = subHeaderRowIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (isBlankRow(row))
      break;

    for (const group of groups) {
      const rarity = cleanCell(row[group.rarityIndex]);
      const speciesName = cleanCell(row[group.pokemonIndex]);
      const level = cleanCell(row[group.levelIndex]);
      if (!speciesName)
        continue;

      const species = ctx.resolveSpecies(speciesName, sourceFile);
      const location = ctx.upsertLocation(group.locationName, { postgame: group.postgame });
      const levelRange = parseLevelRange(level);
      ctx.addPokemonAcquisition({
        species_id: species?.id ?? null,
        species_name: species?.key ?? speciesName,
        species_name_raw: speciesName,
        acquisition_type: acquisitionType,
        method: acquisitionType,
        location_id: location?.id ?? null,
        location_name: location?.name ?? group.locationName,
        subarea: null,
        rarity: rarity || null,
        rarity_percent: parsePercent(rarity),
        level_min: levelRange.min,
        level_max: levelRange.max,
        level_raw: levelRange.raw,
        time_of_day: null,
        requirements: null,
        notes: null,
        postgame: group.postgame,
        source_file: sourceFile,
      });
    }
  }
}

function parseGrassAndCavesFile(rows, sourceFile, ctx) {
  const parsedEntries = [];
  let currentTimeOfDay = null;
  let currentGroups = [];

  function parseHeaderRow(row) {
    const locationHeaders = nonEmptyCells(row);
    let postgame = false;
    const groups = [];

    for (const [index, value] of locationHeaders) {
      if (looksLikePostgameMarker(value)) {
        postgame = true;
        continue;
      }

      groups.push({
        rarityIndex: index - 1,
        pokemonIndex: index + 1,
        levelIndex: index + 2,
        locationName: value,
        postgame,
      });
      ctx.upsertLocation(value, { postgame });
    }

    return { groups, postgame };
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const cells = nonEmptyCells(row);
    if (!cells.length)
      continue;

    const firstValue = cells[0][1];
    if (firstValue === "Day") {
      currentTimeOfDay = "day";
      currentGroups = [];
      continue;
    }

    if (firstValue === "Night") {
      currentTimeOfDay = "night";
      currentGroups = [];
      continue;
    }

    if (!currentTimeOfDay)
      continue;

    const nextRow = rows[rowIndex + 1];
    const nextCells = nextRow ? nonEmptyCells(nextRow) : [];
    if (
      cells.length >= 2 &&
      nextCells.some(([, value]) => value === "Rarity")
    ) {
      const headerInfo = parseHeaderRow(row);
      currentGroups = headerInfo.groups;
      continue;
    }

    if (cells.some(([, value]) => value === "Rarity"))
      continue;

    if (!currentGroups.length)
      continue;

    for (const group of currentGroups) {
      const rarity = cleanCell(row[group.rarityIndex]);
      const speciesName = cleanCell(row[group.pokemonIndex]);
      const level = cleanCell(row[group.levelIndex]);
      if (!speciesName)
        continue;

      const species = ctx.resolveSpecies(speciesName, sourceFile);
      const location = ctx.upsertLocation(group.locationName, { postgame: group.postgame });
      const levelRange = parseLevelRange(level);
      parsedEntries.push({
        species_id: species?.id ?? null,
        species_name: species?.key ?? speciesName,
        species_name_raw: speciesName,
        acquisition_type: "grass_cave",
        method: "grass_cave",
        location_id: location?.id ?? null,
        location_name: location?.name ?? group.locationName,
        subarea: null,
        rarity: rarity || null,
        rarity_percent: parsePercent(rarity),
        level_min: levelRange.min,
        level_max: levelRange.max,
        level_raw: levelRange.raw,
        time_of_day: currentTimeOfDay,
        requirements: null,
        notes: null,
        postgame: group.postgame,
        source_file: sourceFile,
      });
    }
  }

  const grouped = new Map();
  for (const entry of parsedEntries) {
    const key = [
      entry.species_id ?? entry.species_name_raw,
      entry.location_id ?? entry.location_name,
      entry.rarity ?? "",
      entry.level_raw ?? "",
      entry.postgame ? "postgame" : "main",
    ].join("|");

    if (!grouped.has(key))
      grouped.set(key, []);
    grouped.get(key).push(entry);
  }

  const emittedKeys = new Set();

  for (const entries of grouped.values()) {
    const baseEntry = entries[0];
    const timeValues = [...new Set(
      entries
        .map((entry) => entry.time_of_day)
        .filter(Boolean)
    )];

    let mergedTimeOfDay = null;
    if (timeValues.includes("day") && timeValues.includes("night"))
      mergedTimeOfDay = "day/night";
    else if (timeValues.length > 0)
      mergedTimeOfDay = timeValues[0];

    const finalEntry = {
      ...baseEntry,
      time_of_day: mergedTimeOfDay,
    };

    const emittedKey = [
      finalEntry.species_id ?? finalEntry.species_name_raw,
      finalEntry.location_id ?? finalEntry.location_name,
      finalEntry.rarity ?? "",
      finalEntry.level_raw ?? "",
      finalEntry.time_of_day ?? "",
      finalEntry.postgame ? "postgame" : "main",
    ].join("|");

    if (emittedKeys.has(emittedKey))
      continue;

    emittedKeys.add(emittedKey);
    ctx.addPokemonAcquisition(finalEntry);
  }
}

function methodFromHeader(value) {
  const normalized = cleanCell(value).toUpperCase();
  if (normalized === "OLD ROD") return "fish_old";
  if (normalized === "GOOD ROD") return "fish_good";
  if (normalized === "SUPER ROD") return "fish_super";
  if (normalized === "SURFING") return "surf";
  if (normalized === "DAY TIME") return "day";
  if (normalized === "NIGHT TIME") return "night";
  return slugify(normalized);
}

function parseFishingAndSurfingFile(rows, sourceFile, ctx) {
  let currentMethod = null;
  let groups = [];
  let currentPostgame = false;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const cells = nonEmptyCells(row);
    if (!cells.length)
      continue;

    const firstCell = cells[0][1];
    if (["OLD ROD", "GOOD ROD", "SUPER ROD", "SURFING"].includes(cleanCell(firstCell))) {
      currentMethod = methodFromHeader(firstCell);
      currentPostgame = false;
      groups = [];
      for (const [index, value] of cells.slice(1)) {
        if (looksLikePostgameMarker(value)) {
          currentPostgame = true;
          continue;
        }
        groups.push({
          rarityIndex: index - 1,
          pokemonIndex: index + 1,
          levelIndex: index + 2,
          locationName: value,
          postgame: currentPostgame,
        });
        ctx.upsertLocation(value, { postgame: currentPostgame });
      }
      continue;
    }

    if (!currentMethod || cleanCell(firstCell).includes("Obtained in Viridian City"))
      continue;

    if (cells.some(([, value]) => value === "Rarity"))
      continue;

    for (const group of groups) {
      const rarity = cleanCell(row[group.rarityIndex]);
      const speciesName = cleanCell(row[group.pokemonIndex]);
      const level = cleanCell(row[group.levelIndex]);
      if (!speciesName)
        continue;

      const species = ctx.resolveSpecies(speciesName, sourceFile);
      const location = ctx.upsertLocation(group.locationName, { postgame: group.postgame });
      const levelRange = parseLevelRange(level);
      ctx.addPokemonAcquisition({
        species_id: species?.id ?? null,
        species_name: species?.key ?? speciesName,
        species_name_raw: speciesName,
        acquisition_type: currentMethod,
        method: currentMethod,
        location_id: location?.id ?? null,
        location_name: location?.name ?? group.locationName,
        subarea: null,
        rarity: rarity || null,
        rarity_percent: parsePercent(rarity),
        level_min: levelRange.min,
        level_max: levelRange.max,
        level_raw: levelRange.raw,
        time_of_day: null,
        requirements: null,
        notes: null,
        postgame: group.postgame,
        source_file: sourceFile,
      });
    }
  }
}

function parseSafariFile(rows, sourceFile, ctx) {
  const zoneRow = rows.find((row) => nonEmptyCells(row).some(([, value]) => /ZONE/i.test(value)));
  const methodRow = rows[rows.indexOf(zoneRow) + 1];
  const headerRow = rows[rows.indexOf(zoneRow) + 2];
  if (!zoneRow || !methodRow || !headerRow)
    return;

  const zoneName = nonEmptyCells(zoneRow)[0]?.[1] || "Safari Zone";
  const groups = nonEmptyCells(methodRow).map(([index, value]) => ({
    rarityIndex: index - 1,
    pokemonIndex: index + 1,
    levelIndex: index + 2,
    method: methodFromHeader(value),
    locationName: `Safari Zone - ${zoneName}`,
    subarea: zoneName,
    timeOfDay: /DAY|NIGHT/i.test(value) ? cleanCell(value) : null,
  }));
  ctx.upsertLocation(`Safari Zone - ${zoneName}`);

  for (let rowIndex = rows.indexOf(headerRow) + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (isBlankRow(row))
      break;

    for (const group of groups) {
      const rarity = cleanCell(row[group.rarityIndex]);
      const speciesName = cleanCell(row[group.pokemonIndex]);
      const level = cleanCell(row[group.levelIndex]);
      if (!speciesName)
        continue;

      const species = ctx.resolveSpecies(speciesName, sourceFile);
      const location = ctx.upsertLocation(group.locationName);
      const levelRange = parseLevelRange(level);
      ctx.addPokemonAcquisition({
        species_id: species?.id ?? null,
        species_name: species?.key ?? speciesName,
        species_name_raw: speciesName,
        acquisition_type: group.method,
        method: group.method,
        location_id: location?.id ?? null,
        location_name: location?.name ?? group.locationName,
        subarea: group.subarea,
        rarity: rarity || null,
        rarity_percent: parsePercent(rarity),
        level_min: levelRange.min,
        level_max: levelRange.max,
        level_raw: levelRange.raw,
        time_of_day: group.timeOfDay,
        requirements: null,
        notes: null,
        postgame: false,
        source_file: sourceFile,
      });
    }
  }
}

function parseRaidDensFile(rows, sourceFile, ctx) {
  let currentLocation = null;
  let currentStars = null;
  let currentSpeciesEntries = [];

  function flushDrops(dropRow) {
    if (!currentLocation || !currentStars || !currentSpeciesEntries.length)
      return;

    const cells = nonEmptyCells(dropRow);
    for (const entry of currentSpeciesEntries) {
      const itemName = cleanCell(dropRow[entry.col + 1]);
      const chance = cleanCell(dropRow[entry.col + 3]);
      if (!itemName)
        continue;
      entry.drops.push({
        item_name_raw: itemName,
        item_name: ctx.resolveItem(itemName, sourceFile)?.name ?? itemName,
        item_id: ctx.resolveItem(itemName, sourceFile)?.id ?? null,
        rarity: chance || null,
        rarity_percent: parsePercent(chance),
      });
    }
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const blockHeader = nonEmptyCells(row)[0]?.[1] || "";
    const blockMatch = blockHeader.match(/^--\s*(.*?)\s*--\s*(★+)/);
    if (blockMatch) {
      currentLocation = blockMatch[1];
      currentStars = blockMatch[2].length;
      currentSpeciesEntries = [];
      continue;
    }

    if (!currentLocation || !currentStars)
      continue;

    const cells = nonEmptyCells(row);
    if (!cells.length)
      continue;

    if (cells.some(([, value]) => value === "Drops:")) {
      continue;
    }

    const speciesCells = cells.filter(([index, value]) => index >= 2 && !/%$/.test(value) && value !== "Drops:");
    if (speciesCells.length && !currentSpeciesEntries.length) {
      currentSpeciesEntries = speciesCells.map(([col, speciesName]) => {
        const species = ctx.resolveSpecies(speciesName, sourceFile);
        const den = {
          location_id: ctx.upsertLocation(currentLocation)?.id ?? null,
          location_name: currentLocation,
          stars: currentStars,
          species_id: species?.id ?? null,
          species_name: species?.key ?? speciesName,
          species_name_raw: speciesName,
          source_file: sourceFile,
          drops: [],
        };
        ctx.addRaidDen(den);
        ctx.addPokemonAcquisition({
          species_id: species?.id ?? null,
          species_name: species?.key ?? speciesName,
          species_name_raw: speciesName,
          acquisition_type: "raid_den",
          method: `raid_${currentStars}_star`,
          location_id: den.location_id,
          location_name: den.location_name,
          subarea: null,
          rarity: null,
          rarity_percent: null,
          level_min: null,
          level_max: null,
          level_raw: null,
          time_of_day: null,
          requirements: `${currentStars}★ Raid Den`,
          notes: null,
          postgame: false,
          source_file: sourceFile,
        });
        return { col, drops: den.drops };
      });
      continue;
    }

    if (currentSpeciesEntries.length)
      flushDrops(row);
  }
}

function parseStaticsFile(rows, sourceFile, ctx) {
  for (const row of rows) {
    const speciesName = cleanCell(row[3]);
    const locationText = cleanCell(row[5]);
    if (!speciesName || !locationText || speciesName === "POKEMON")
      continue;

    const species = ctx.resolveSpecies(speciesName, sourceFile);
    const location = ctx.upsertLocation(locationText.split(",")[0]);
    ctx.addPokemonAcquisition({
      species_id: species?.id ?? null,
      species_name: species?.key ?? speciesName,
      species_name_raw: speciesName,
      acquisition_type: "static",
      method: "static",
      location_id: location?.id ?? null,
      location_name: location?.name ?? locationText,
      subarea: null,
      rarity: null,
      rarity_percent: null,
      level_min: parseLevelRange((locationText.match(/Lv\.\s*(\d+(?:-\d+)?)/i) || [])[1] || "").min,
      level_max: parseLevelRange((locationText.match(/Lv\.\s*(\d+(?:-\d+)?)/i) || [])[1] || "").max,
      level_raw: (locationText.match(/Lv\.\s*(\d+(?:-\d+)?)/i) || [])[1] || null,
      time_of_day: null,
      requirements: null,
      notes: locationText,
      postgame: /POST-GAME/i.test(locationText),
      source_file: sourceFile,
    });
  }
}

function parseGiftsFile(rows, sourceFile, ctx) {
  let currentLocation = null;

  for (const row of rows) {
    const cells = nonEmptyCells(row);
    if (!cells.length)
      continue;

    if (cells.length === 1 && looksLikeSectionHeader(cells[0][1])) {
      currentLocation = cells[0][1];
      continue;
    }

    const speciesName = cleanCell(row[3]);
    const requirements = cleanCell(row[4]);
    const notes = cleanCell(row[8] || row[7] || row[6]);
    if (!speciesName || speciesName === "POKEMON")
      continue;

    const species = ctx.resolveSpecies(speciesName, sourceFile);
    const location = ctx.upsertLocation(currentLocation || "Gift Pokemon");
    ctx.addPokemonAcquisition({
      species_id: species?.id ?? null,
      species_name: species?.key ?? speciesName,
      species_name_raw: speciesName,
      acquisition_type: "gift",
      method: "gift",
      location_id: location?.id ?? null,
      location_name: location?.name ?? currentLocation,
      subarea: null,
      rarity: null,
      rarity_percent: null,
      level_min: parseLevelRange((notes.match(/Lv\.\s*(\d+(?:-\d+)?)/i) || [])[1] || "").min,
      level_max: parseLevelRange((notes.match(/Lv\.\s*(\d+(?:-\d+)?)/i) || [])[1] || "").max,
      level_raw: (notes.match(/Lv\.\s*(\d+(?:-\d+)?)/i) || [])[1] || null,
      time_of_day: null,
      requirements: requirements || null,
      notes: notes || null,
      postgame: /Hall Of Fame|post-game/i.test(`${requirements} ${notes}`),
      source_file: sourceFile,
    });
  }
}

function parseTradesFile(rows, sourceFile, ctx) {
  let locationPairs = [];

  for (const row of rows) {
    const cells = nonEmptyCells(row);
    if (!cells.length)
      continue;

    if (cells.length >= 2 && cells.every(([, value]) => looksLikeSectionHeader(value))) {
      locationPairs = cells.map(([index, value]) => ({ index, locationName: value }));
      continue;
    }

    if (cells.some(([, value]) => /Looking for/i.test(value)))
      continue;

    if (!locationPairs.length)
      continue;

    for (const pair of locationPairs) {
      const lookingFor = cleanCell(row[pair.index]);
      const reward = cleanCell(row[pair.index + 4]);
      if (!lookingFor || !reward)
        continue;

      const requested = ctx.resolveSpecies(lookingFor, sourceFile);
      const offered = ctx.resolveSpecies(reward, sourceFile);
      const location = ctx.upsertLocation(pair.locationName);
      ctx.addPokemonAcquisition({
        species_id: offered?.id ?? null,
        species_name: offered?.key ?? reward,
        species_name_raw: reward,
        acquisition_type: "trade",
        method: "trade",
        location_id: location?.id ?? null,
        location_name: location?.name ?? pair.locationName,
        subarea: null,
        rarity: null,
        rarity_percent: null,
        level_min: null,
        level_max: null,
        level_raw: null,
        time_of_day: null,
        requirements: requested ? `Trade ${requested.key}` : `Trade ${lookingFor}`,
        notes: null,
        postgame: false,
        source_file: sourceFile,
      });
    }
  }
}

function parseUnobtainablesFile(rows, sourceFile, ctx) {
  for (const row of rows) {
    const speciesName = cleanCell(row[3]);
    if (!speciesName || /Unobtainable|Number of currently available/i.test(speciesName))
      continue;

    const species = ctx.resolveSpecies(speciesName, sourceFile);
    ctx.addPokemonAcquisition({
      species_id: species?.id ?? null,
      species_name: species?.key ?? speciesName,
      species_name_raw: speciesName,
      acquisition_type: "unobtainable",
      method: "unobtainable",
      location_id: null,
      location_name: null,
      subarea: null,
      rarity: null,
      rarity_percent: null,
      level_min: null,
      level_max: null,
      level_raw: null,
      time_of_day: null,
      requirements: null,
      notes: "Marked unobtainable in reference sheet",
      postgame: false,
      source_file: sourceFile,
    });
  }
}

function parseNoteHeavyFile(rows, sourceFile, ctx, noteType) {
  for (const row of rows) {
    const line = nonEmptyCells(row).map(([, value]) => value).join(" ").trim();
    if (!line)
      continue;
    ctx.addNote({
      type: noteType,
      source_file: sourceFile,
      text: line,
    });
  }
}

function runParser(fileName, ctx) {
  const filePath = path.join(CSV_DIR, fileName);
  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));

  if (fileName.includes("Mystery Gifts")) return parseMysteryGiftsFile(rows, fileName, ctx);
  if (fileName.includes("TMs & HMs")) return parseTmHmFile(rows, fileName, ctx);
  if (fileName.includes("Move Tutors")) return parseMoveTutorsFile(rows, fileName, ctx);
  if (fileName.includes("Overworld Items")) return parseOverworldItemsFile(rows, fileName, ctx);
  if (fileName.includes("Shops")) return parseShopsFile(rows, fileName, ctx);
  if (fileName.includes("Mega Stones")) return parsePairedItemLocationsFile(rows, fileName, ctx, "mega_stone");
  if (fileName.includes("Z-Crystals")) return parsePairedItemLocationsFile(rows, fileName, ctx, "z_crystal");
  if (fileName.includes("Other Useful Items")) return parseOtherUsefulItemsFile(rows, fileName, ctx);
  if (fileName.includes("Grass & Caves")) return parseGrassAndCavesFile(rows, fileName, ctx);
  if (fileName.includes("Fishing & Surfing")) return parseFishingAndSurfingFile(rows, fileName, ctx);
  if (fileName.includes("Safari Zone")) return parseSafariFile(rows, fileName, ctx);
  if (fileName.endsWith(" - Raid Dens.csv")) return parseRaidDensFile(rows, fileName, ctx);
  if (fileName.includes("Statics & Special Pokemon")) return parseStaticsFile(rows, fileName, ctx);
  if (fileName.includes("Gifts")) return parseGiftsFile(rows, fileName, ctx);
  if (fileName.includes("Trades")) return parseTradesFile(rows, fileName, ctx);
  if (fileName.includes("Unobtainables")) return parseUnobtainablesFile(rows, fileName, ctx);
  if (fileName.includes("Fossils")) return parseFossilsFile(rows, fileName, ctx);
  if (fileName.includes("Egg Vendor & Game Corner")) return parseEggVendorAndGameCornerFile(rows, fileName, ctx);

  ctx.addNote({
    type: "unhandled_csv",
    source_file: fileName,
    text: `No parser registered for ${fileName}`,
  });
}

function main() {
  ensureDir(OUTPUT_DIR);
  const lookups = loadLookups();
  const ctx = createContext(lookups);
  const files = fs.readdirSync(CSV_DIR).filter((name) => name.endsWith(".csv")).sort();

  for (const fileName of files)
    runParser(fileName, ctx);

  normalizeMoveAcquisitions(ctx);

  writeJson("locations.json", ctx.locations);
  writeJson("pokemon_acquisitions.json", ctx.pokemonAcquisitions);
  writeJson("move_acquisitions.json", ctx.moveAcquisitions);
  writeJson("item_acquisitions.json", ctx.itemAcquisitions);
  writeJson("raid_dens.json", ctx.raidDens);
  writeJson("notes.json", ctx.notes);
  writeJson("normalization_report.json", {
    generated_at: new Date().toISOString(),
    source_files: files,
    counts: {
      locations: ctx.locations.length,
      pokemon_acquisitions: ctx.pokemonAcquisitions.length,
      move_acquisitions: ctx.moveAcquisitions.length,
      item_acquisitions: ctx.itemAcquisitions.length,
      raid_dens: ctx.raidDens.length,
      notes: ctx.notes.length,
      warnings: ctx.warnings.length,
    },
    warnings: ctx.warnings,
  });

  console.log(JSON.stringify({
    output_dir: path.relative(ROOT, OUTPUT_DIR),
    locations: ctx.locations.length,
    pokemon_acquisitions: ctx.pokemonAcquisitions.length,
    move_acquisitions: ctx.moveAcquisitions.length,
    item_acquisitions: ctx.itemAcquisitions.length,
    raid_dens: ctx.raidDens.length,
    notes: ctx.notes.length,
    warnings: ctx.warnings.length,
  }, null, 2));
}

main();
