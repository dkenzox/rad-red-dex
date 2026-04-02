function getAbilityName(ability, species, raw = false) {
  if (ability[0] === 0) return undefined;

  const mappedAbility = raw ? ability : getMappedAbility(ability, species);
  return abilities[mappedAbility[0]].names[mappedAbility[1]];
}

function getMove(moveIdx, species, raw = false) {
  return moves[raw ? moveIdx : getMappedMove(moveIdx, species)];
}

function getFullLearnset(mon) {
  if (mon.learnedMoveIds)
    return [...new Set(mon.learnedMoveIds
      .filter((moveId) => moveId > 0)
      .map((moveId) => getMappedMove(moveId, mon.ID)))];

  let learnset = [];
  if (mon.levelupMoves) {
	// Pass the species ID in so it gets the mapped move properly
    const levelMoves = mon.levelupMoves.map((x) => {
      const move = getMove(x[0], mon.ID);
      return move.ID;
    });

    learnset.push(...levelMoves);
  }

  if (mon.tmMoves) learnset.push(...mon.tmMoves.map((x) => tmMoves[x]));
  if (mon.tutorMoves)
    learnset.push(...mon.tutorMoves.map((x) => tutorMoves[x]));
  if (mon.eggMoves) learnset.push(...mon.eggMoves);
  return learnset;
}

function mergeSpeciesData(summaryMon, details = {}) {
  if (!summaryMon)
    return null;

  return {
    ...summaryMon,
    ...details,
  };
}

function getMergedSpeciesSync(speciesIdOrMon) {
  const speciesId = typeof speciesIdOrMon === "object" ? speciesIdOrMon?.ID : speciesIdOrMon;
  const summaryMon = typeof speciesIdOrMon === "object"
    ? (species?.[speciesId] || speciesIdOrMon)
    : species?.[speciesId];

  if (!summaryMon)
    return null;

  return mergeSpeciesData(summaryMon, speciesDetailsById?.[speciesId] || {});
}

function getSprite(ID) {
  const splitSprites = {
    Physical: "graphics/0.png",
    Special: "graphics/1.png",
    Status: "graphics/2.png",
  };

  if (typeof ID === "string" && splitSprites[ID])
    return splitSprites[ID];

  if (sprites?.[ID] !== undefined)
    return sprites[ID];

  const normalizedId = Number.isFinite(Number(ID)) ? Number(ID) : 0;
  return `graphics/species/front/${normalizedId}.png`;
}

function isSpeciesSpritePath(src) {
  return typeof src === "string" && src.startsWith("graphics/species/front/");
}

async function getTransparentSpriteUrl(src) {
  if (!isSpeciesSpritePath(src))
    return src;

  if (transparentSpriteUrlCache?.has(src))
    return transparentSpriteUrlCache.get(src);

  if (transparentSpritePromiseCache?.has(src))
    return transparentSpritePromiseCache.get(src);

  const work = (async () => {
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const background = [pixels[0], pixels[1], pixels[2]];

    for (let i = 0; i < pixels.length; i += 4) {
      if (
        pixels[i] === background[0] &&
        pixels[i + 1] === background[1] &&
        pixels[i + 2] === background[2]
      ) {
        pixels[i] = 0;
        pixels[i + 1] = 0;
        pixels[i + 2] = 0;
        pixels[i + 3] = 0;
      }
    }

    context.putImageData(imageData, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const objectUrl = URL.createObjectURL(blob);
    transparentSpriteUrlCache.set(src, objectUrl);
    transparentSpritePromiseCache.delete(src);
    return objectUrl;
  })().catch((error) => {
    transparentSpritePromiseCache.delete(src);
    console.warn("Failed to convert sprite transparency.", src, error);
    return src;
  });

  transparentSpritePromiseCache.set(src, work);
  return work;
}

function setSpriteImage(img, src) {
  if (!img)
    return;

  if (isSpeciesSpritePath(src)) {
    img.style.visibility = "hidden";
    getTransparentSpriteUrl(src).then((transparentSrc) => {
      if (!img.isConnected)
        return;
      img.src = transparentSrc;
      img.style.visibility = "";
    });
    return;
  }

  img.src = src;
}

function parseRgbColor(color) {
  if (typeof color === "string" && color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.split("").map(x => x + x).join("");
    }

    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }

  const match = color.match(/\d+/g);
  if (!match || match.length < 3)
    return [63, 40, 40];

  return match.slice(0, 3).map(Number);
}

function mixRgbColor(start, end, ratio) {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  return [
    Math.round(start[0] + (end[0] - start[0]) * clampedRatio),
    Math.round(start[1] + (end[1] - start[1]) * clampedRatio),
    Math.round(start[2] + (end[2] - start[2]) * clampedRatio),
  ];
}

function arrayEquals(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right))
    return false;

  if (left === right)
    return true;

  if (left.length !== right.length)
    return false;

  for (let i = 0; i < left.length; i++) {
    if (Array.isArray(left[i]) || Array.isArray(right[i])) {
      if (!arrayEquals(left[i], right[i]))
        return false;
      continue;
    }

    if (left[i] !== right[i])
      return false;
  }

  return true;
}

function getAvailableAbilityEntries(mon) {
  let options = [];

  for (const slot of [1, 2, 0]) {
    if (!mon.abilities || !mon.abilities[slot] || mon.abilities[slot][0] === 0)
      continue;

    const mappedAbility = getMappedAbility(mon.abilities[slot], mon.ID);
    const label = slot === 1 ? "Primary" : slot === 2 ? "Secondary" : "Hidden";
    options.push({
      slot: slot,
      abilityId: mappedAbility[0],
      label: `${label}: ${abilities[mappedAbility[0]].names[mappedAbility[1]]}`,
    });
  }

  return options;
}

function getDisplayLearnsetOptions(mon) {
  let moveMap = new Map();

  function addMove(moveId, source) {
    const move = getMove(moveId, mon.ID);
    if (!move)
      return;

    let entry = moveMap.get(move.ID);
    if (!entry) {
      entry = {
        id: move.ID,
        name: move.name,
        move: move,
        sources: [],
      };
      moveMap.set(move.ID, entry);
    }

    if (!entry.sources.includes(source))
      entry.sources.push(source);
  }

  if (mon.prevoMoves)
    mon.prevoMoves.forEach(x => addMove(x, "Pre-evo"));
  if (mon.levelupMoves)
    mon.levelupMoves.forEach(x => addMove(x[0], `Level ${x[1]}`));
  if (mon.tmMoves)
    mon.tmMoves.forEach(x => addMove(tmMoves[x], "TM/HM"));
  if (mon.tutorMoves)
    mon.tutorMoves.forEach(x => addMove(tutorMoves[x], "Tutor"));
  if (mon.eggMoves)
    mon.eggMoves.forEach(x => addMove(x, "Egg"));
  if (mon.eventMoves)
    mon.eventMoves.forEach(x => addMove(x, "Event"));

  return Array.from(moveMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function loadChunk(tracker, toClear) {
  let rowsAdded = 0;

  if (toClear) {
    if (scrollIntoView && tracker.body.getBoundingClientRect().top < 0)
      tracker.body.scrollIntoView({ behavior: "smooth", block: "start" });
    tracker.body.innerText = "";
    tracker.index = 0;
  }

  let data = tracker.data;
  let i = tracker.index;
  for (j = data.length, k = tracker.maxRows; rowsAdded < k && i < j; i++) {
    tracker.displayMethod(tracker, data[i]);
    rowsAdded++;
  }
  tracker.index = i;
}

const COVERAGE_MODE_STORAGE_KEY = "rrdex_coverage_mode";
const COVERAGE_DEFAULT_SOURCES = {
  levelup: true,
  tmhm: true,
  tutor: false,
  prevo: false,
  event: false,
};
const COVERAGE_ROLE_THRESHOLD = 15;
const COVERAGE_STRONG_SCORE_THRESHOLD = 90;
const COVERAGE_OFFPLAN_LOW_BP_PENALTY = 0.7;
const COVERAGE_ROLE_MISMATCH_PENALTY = 0.7;

const COVERAGE_MOVE_TAGS = Object.fromEntries(
  Object.entries({
    bite: [
      "Bite", "Crunch", "Fire Fang", "Hyper Fang", "Ice Fang", "Jaw Lock",
      "Poison Fang", "Psychic Fangs", "Thunder Fang", "Fishious Rend"
    ],
    pulse: [
      "Aura Sphere", "Dark Pulse", "Dragon Pulse", "Origin Pulse",
      "Terrain Pulse", "Water Pulse"
    ],
    sound: [
      "Alluring Voice", "Boomburst", "Bug Buzz", "Clanging Scales",
      "Clangorous Soulblaze", "Disarming Voice", "Echoed Voice",
      "Hyper Voice", "Overdrive", "Psychic Noise", "Relic Song", "Round",
      "Snarl", "Snore", "Sparkling Aria", "Torch Song", "Uproar"
    ],
    punch: [
      "Bullet Punch", "Comet Punch", "Drain Punch", "Dynamic Punch",
      "Fire Punch", "Focus Punch", "Hammer Arm", "Ice Hammer", "Ice Punch",
      "Mach Punch", "Mega Punch", "Meteor Mash", "Plasma Fists",
      "Power-Up Punch", "Shadow Punch", "Sky Uppercut", "Surging Strikes",
      "Thunder Punch"
    ],
    slicing: [
      "Air Cutter", "Aqua Cutter", "Behemoth Blade", "Bitter Blade",
      "Ceaseless Edge", "Cross Poison", "Cut", "Fury Cutter", "Kowtow Cleave",
      "Leaf Blade", "Night Slash", "Psycho Cut", "Razor Shell",
      "Sacred Sword", "Shadow Claw", "Slash", "Solar Blade", "Stone Axe",
      "X-Scissor"
    ],
  }).map(([tag, names]) => [tag, new Set(names)])
);

const COVERAGE_CONTACT_NAME_SET = new Set([
  "Aqua Tail", "Astonish", "Bitter Blade", "Bite", "Body Slam",
  "Brick Break", "Close Combat", "Cross Chop", "Crunch", "Cut",
  "Darkest Lariat", "Dire Claw", "Double-Edge", "Double Kick",
  "Dragon Claw", "Dragon Tail", "Drain Punch", "Dual Chop",
  "Extreme Speed", "False Swipe", "Fire Fang", "Fire Punch",
  "Flame Charge", "Flare Blitz", "Fury Cutter", "Headbutt",
  "Ice Fang", "Ice Hammer", "Ice Punch", "Jaw Lock", "Knock Off",
  "Leaf Blade", "Mach Punch", "Metal Claw", "Night Slash", "Play Rough",
  "Poison Fang", "Poison Jab", "Power-Up Punch", "Quick Attack",
  "Rage Fist", "Rock Climb", "Sacred Sword", "Scratch", "Shadow Claw",
  "Shadow Sneak", "Slash", "Smart Strike", "Spirit Break", "Sucker Punch",
  "Superpower", "Surging Strikes", "Thunder Fang", "Thunder Punch",
  "U-turn", "Wake-Up Slap", "Wood Hammer", "X-Scissor", "Zen Headbutt"
]);

const COVERAGE_NON_CONTACT_NAME_SET = new Set([
  "Air Cutter", "Air Slash", "Aura Sphere", "Boomburst", "Bug Buzz",
  "Dark Pulse", "Dragon Pulse", "Echoed Voice", "Flash", "Hyper Voice",
  "Origin Pulse", "Overdrive", "Psycho Cut", "Psychic Noise", "Razor Wind",
  "Round", "Snarl", "Sparkling Aria", "Terrain Pulse", "Torch Song",
  "Water Pulse"
]);

function getCoverageModePreference() {
  try {
    const raw = localStorage.getItem(COVERAGE_MODE_STORAGE_KEY);
    if (["auto", "physical", "special", "mixed"].includes(raw))
      return raw;
  } catch (error) {
    console.warn("Failed to read coverage mode preference.", error);
  }
  return "auto";
}

function setCoverageModePreference(mode) {
  const normalized = normalizeCoverageMode(mode);
  try {
    localStorage.setItem(COVERAGE_MODE_STORAGE_KEY, normalized);
  } catch (error) {
    console.warn("Failed to persist coverage mode preference.", error);
  }
}

function normalizeCoverageMode(mode) {
  return ["auto", "physical", "special", "mixed"].includes(mode) ? mode : "auto";
}

function getCoverageRoleLabel(mode) {
  switch (mode) {
    case "physical":
      return "Physical Attacker";
    case "special":
      return "Special Attacker";
    default:
      return "Mixed Attacker";
  }
}

function getTypeEffectivenessMultiplier(moveTypeId, defenderTypeId) {
  const matchup = types?.[moveTypeId]?.matchup?.[defenderTypeId];
  if (matchup === 20)
    return 2;
  if (matchup === 5)
    return 0.5;
  if (matchup === 1)
    return 0;
  return 1;
}

function getTypeIdByName(typeName) {
  const normalized = String(typeName || "").toLowerCase();
  const match = Object.values(types || {}).find(x => x?.name?.toLowerCase() === normalized);
  return match?.ID;
}

function getMoveTags(moveOrId, speciesOrMon = undefined) {
  const move = typeof moveOrId === "object"
    ? moveOrId
    : getMove(moveOrId, speciesOrMon?.ID || speciesOrMon, true);
  const tags = new Set();

  if (!move)
    return tags;

  for (const [tag, names] of Object.entries(COVERAGE_MOVE_TAGS)) {
    if (names.has(move.name))
      tags.add(tag);
  }

  if (
    COVERAGE_CONTACT_NAME_SET.has(move.name) ||
    (
      !COVERAGE_NON_CONTACT_NAME_SET.has(move.name) &&
      (
        tags.has("punch") ||
        tags.has("bite") ||
        /(?:Claw|Kick|Punch|Fang|Headbutt|Tail|Tackle|Smack|Jab|Strike|Break|Slam|Swipe|Whip|Lariat|Rend|Combat|Stomp|Crash)$/i.test(move.name)
      )
    )
  ) {
    tags.add("contact");
  }

  if (move.power > 0 && (move.secondaryEffectChance || 0) > 0)
    tags.add("sheerForceEligible");

  return tags;
}

function moveHasTag(moveOrId, tag, speciesOrMon = undefined) {
  return getMoveTags(moveOrId, speciesOrMon).has(tag);
}

function getSpeciesAbilityVariants(mon) {
  const entries = [];
  const seenAbilityIds = new Set();

  if (!mon?.abilities)
    return entries;

  for (const slot of [1, 2, 0]) {
    const rawAbility = mon.abilities[slot];
    if (!rawAbility || rawAbility[0] === 0)
      continue;

    const mappedAbility = getMappedAbility(rawAbility, mon.ID);
    if (!mappedAbility || seenAbilityIds.has(mappedAbility[0]))
      continue;

    seenAbilityIds.add(mappedAbility[0]);
    entries.push({
      id: mappedAbility[0],
      name: abilities?.[mappedAbility[0]]?.names?.[mappedAbility[1] || 0] || abilities?.[mappedAbility[0]]?.names?.[0],
      description: abilities?.[mappedAbility[0]]?.description || "",
      slot,
      slotLabel: slot === 0 ? "Hidden Ability" : slot === 2 ? "Secondary Ability" : "Primary Ability",
      isHidden: slot === 0,
    });
  }

  return entries;
}

function getCoverageTmhmSourceMon(mon) {
  if (mon?.tmMoves?.length)
    return mon;

  const formBase = Object.values(species || {}).find(x =>
    x.dexID === mon?.dexID &&
    (x.order === 0 || x.order === undefined)
  );

  return formBase || mon;
}

function getCoverageCandidateMoves(mon, options = {}) {
  const sources = { ...COVERAGE_DEFAULT_SOURCES, ...options };
  const moveMap = new Map();

  function registerMove(moveId, sourceLabel, raw = false) {
    const move = getMove(moveId, mon.ID, raw);
    if (!move || move.power <= 0 || move.split === 2)
      return;

    let entry = moveMap.get(move.ID);
    if (!entry) {
      entry = {
        ...move,
        coverageSources: [],
        coverageSourceSet: new Set(),
      };
      moveMap.set(move.ID, entry);
    }

    if (!entry.coverageSourceSet.has(sourceLabel)) {
      entry.coverageSourceSet.add(sourceLabel);
      entry.coverageSources.push(sourceLabel);
    }
  }

  if (sources.levelup && mon.levelupMoves) {
    for (const [moveId, level] of mon.levelupMoves)
      registerMove(getMappedMove(moveId, mon.ID), `Level ${level}`, true);
  }

  if (sources.tmhm) {
    const tmhmSourceMon = getCoverageTmhmSourceMon(mon);
    const tmSourceLabel = tmhmSourceMon.ID === mon.ID ? "TM/HM" : "TM/HM (base form)";
    if (tmhmSourceMon.tmMoves) {
      for (const tmIdx of tmhmSourceMon.tmMoves)
        registerMove(tmMoves[tmIdx], tmSourceLabel, true);
    }
  }

  if (sources.tutor && mon.tutorMoves) {
    for (const tutorIdx of mon.tutorMoves)
      registerMove(tutorMoves[tutorIdx], "Tutor", true);
  }

  if (sources.prevo && mon.prevoMoves) {
    for (const moveId of mon.prevoMoves)
      registerMove(getMappedMove(moveId, mon.ID), "Pre-evo", true);
  }

  if (sources.event && mon.eventMoves) {
    for (const moveId of mon.eventMoves)
      registerMove(moveId, "Event", true);
  }

  return Array.from(moveMap.values())
    .map(move => ({
      ...move,
      coverageSourceLabel: move.coverageSources.join(" • "),
    }))
    .sort((a, b) =>
      b.power - a.power ||
      a.name.localeCompare(b.name)
    );
}

function getRoleAdjustedStats(mon, abilityVariant = null) {
  let atk = mon?.stats?.[1] || 0;
  let spa = mon?.stats?.[4] || 0;
  const explanations = [];
  const abilityName = abilityVariant?.name || "";

  if (abilityName === "Huge Power" || abilityName === "Pure Power") {
    atk *= 2;
    explanations.push("Attack doubled");
  }

  if (abilityName === "Feline Prowess") {
    spa *= 2;
    explanations.push("Sp. Atk doubled");
  }

  return { atk, spa, explanations };
}

function getEffectiveOffenseProfile(mon, modeOverride = "auto") {
  const normalized = normalizeCoverageMode(modeOverride);
  let inferredMode = normalized;
  let inferredAtk = mon?.stats?.[1] || 0;
  let inferredSpa = mon?.stats?.[4] || 0;

  if (normalized === "auto") {
    for (const abilityVariant of getSpeciesAbilityVariants(mon)) {
      const adjusted = getRoleAdjustedStats(mon, abilityVariant);
      inferredAtk = Math.max(inferredAtk, adjusted.atk);
      inferredSpa = Math.max(inferredSpa, adjusted.spa);
    }

    if (inferredAtk - inferredSpa >= COVERAGE_ROLE_THRESHOLD)
      inferredMode = "physical";
    else if (inferredSpa - inferredAtk >= COVERAGE_ROLE_THRESHOLD)
      inferredMode = "special";
    else
      inferredMode = "mixed";
  }

  return {
    mode: inferredMode,
    selectedMode: normalized,
    label: getCoverageRoleLabel(inferredMode),
    isAuto: normalized === "auto",
    inferredAtk,
    inferredSpa,
  };
}

function getResolvedCoverageMove(move, mon, abilityVariant = null) {
  let resolvedTypeId = move.type;
  let moveMultiplier = 1;
  const explanations = [];
  const factors = [];
  const notes = [];
  const tags = getMoveTags(move, mon);
  const abilityName = abilityVariant?.name || "";

  if (abilityName === "Liquid Voice" && move.type === 0 && tags.has("sound")) {
    const waterTypeId = getTypeIdByName("Water");
    if (waterTypeId !== undefined) {
      resolvedTypeId = waterTypeId;
      moveMultiplier *= 1.2;
      explanations.push("Sound move converted to Water");
      explanations.push("Liquid Voice boost");
      factors.push({ label: "Liquid Voice", multiplier: 1.2 });
      notes.push("Normal sound move becomes Water");
    }
  }

  if (abilityName === "Technician" && move.power <= 60) {
    moveMultiplier *= 1.5;
    explanations.push("Technician boost");
    factors.push({ label: "Technician", multiplier: 1.5 });
  }

  if (abilityName === "Tough Claws" && tags.has("contact")) {
    moveMultiplier *= 1.3;
    explanations.push("Contact boost");
    factors.push({ label: "Tough Claws", multiplier: 1.3 });
  }

  if (abilityName === "Mega Launcher" && tags.has("pulse")) {
    moveMultiplier *= 1.5;
    explanations.push("Pulse boost");
    factors.push({ label: "Mega Launcher", multiplier: 1.5 });
  }

  if (abilityName === "Strong Jaw" && tags.has("bite")) {
    moveMultiplier *= 1.5;
    explanations.push("Bite boost");
    factors.push({ label: "Strong Jaw", multiplier: 1.5 });
  }

  if (abilityName === "Sharpness" && tags.has("slicing")) {
    moveMultiplier *= 1.5;
    explanations.push("Slicing boost");
    factors.push({ label: "Sharpness", multiplier: 1.5 });
  }

  if (abilityName === "Iron Fist" && tags.has("punch")) {
    moveMultiplier *= 1.3;
    explanations.push("Punch boost");
    factors.push({ label: "Iron Fist", multiplier: 1.3 });
  }

  if (abilityName === "ORAORAORAORA!" && tags.has("punch")) {
    moveMultiplier *= 1.5;
    explanations.push("Bonus punch hit");
    factors.push({ label: "ORAORAORAORA!", multiplier: 1.5 });
  }

  if (abilityName === "Sheer Force" && tags.has("sheerForceEligible")) {
    moveMultiplier *= 1.3;
    explanations.push("Sheer Force boost");
    factors.push({ label: "Sheer Force", multiplier: 1.3 });
  }

  return {
    move,
    resolvedTypeId,
    moveMultiplier,
    tags,
    explanations,
    factors,
    notes,
  };
}

function getMovePowerPreview(move, mon, abilityVariant = null) {
  const resolvedMove = getResolvedCoverageMove(move, mon, abilityVariant);
  const explanations = [...resolvedMove.explanations];
  const notes = [...resolvedMove.notes];
  const abilityName = abilityVariant?.name || "";
  const isStab = mon?.type?.includes(resolvedMove.resolvedTypeId);
  let stabMultiplier = 1;
  let roleAbilityMultiplier = 1;
  const factors = [...resolvedMove.factors];

  if (isStab) {
    stabMultiplier = abilityName === "Adaptability" ? 2 : 1.5;
    explanations.unshift(abilityName === "Adaptability" ? "Adaptability STAB" : "STAB");
    factors.unshift({
      label: abilityName === "Adaptability" ? "Adaptability STAB" : "STAB",
      multiplier: stabMultiplier,
    });
  }

  if ((abilityName === "Huge Power" || abilityName === "Pure Power") && move.split === 0) {
    roleAbilityMultiplier *= 2;
    explanations.push("Attack doubled");
    factors.push({ label: abilityName, multiplier: 2 });
  }

  if (abilityName === "Feline Prowess" && move.split === 1) {
    roleAbilityMultiplier *= 2;
    explanations.push("Sp. Atk doubled");
    factors.push({ label: "Feline Prowess", multiplier: 2 });
  }

  return {
    basePower: move.power,
    resolvedTypeId: resolvedMove.resolvedTypeId,
    isStab,
    stabMultiplier,
    moveMultiplier: resolvedMove.moveMultiplier,
    roleAbilityMultiplier,
    previewPower: move.power * stabMultiplier * resolvedMove.moveMultiplier * roleAbilityMultiplier,
    explanations,
    factors,
    notes,
  };
}

function getMovePowerPreviewVariants(move, mon) {
  const normal = getMovePowerPreview(move, mon, null);
  const variants = [];

  for (const abilityVariant of getSpeciesAbilityVariants(mon)) {
    const preview = getMovePowerPreview(move, mon, abilityVariant);
    if (
      Math.abs(preview.previewPower - normal.previewPower) < 0.01 &&
      preview.resolvedTypeId === normal.resolvedTypeId
    ) {
      continue;
    }

    variants.push({
      abilityId: abilityVariant.id,
      abilityName: abilityVariant.name,
      ...preview,
    });
  }

  return { normal, variants };
}

function formatCoverageMultiplier(multiplier) {
  return Number(multiplier).toFixed(2).replace(/\.?0+$/, "");
}

function buildPowerPreviewFormula(preview) {
  const parts = [`${preview.basePower} base`];
  for (const factor of preview.factors || [])
    parts.push(`× ${formatCoverageMultiplier(factor.multiplier)} ${factor.label}`);
  return `${parts.join(" ")} = ${Math.round(preview.previewPower)}`;
}

const WORLD_ACQUISITION_GROUPS = [
  {
    key: "wild",
    label: "Wild encounters",
    types: ["grass_cave", "day", "night"],
  },
  {
    key: "water",
    label: "Surfing & fishing",
    types: ["surf", "fish_old", "fish_good", "fish_super"],
  },
  {
    key: "special",
    label: "Static encounters & raids",
    types: ["static", "raid_den"],
  },
  {
    key: "tradeGift",
    label: "Gifts & trades",
    types: ["gift", "trade", "mystery_gift"],
  },
  {
    key: "specialSources",
    label: "Special sources",
    types: ["egg_vendor", "game_corner", "fossil"],
  },
  {
    key: "unobtainable",
    label: "Availability notes",
    types: ["unobtainable"],
  },
];

const WORLD_ACQUISITION_LABELS = {
  grass_cave: "Grass/Cave",
  day: "Day",
  night: "Night",
  surf: "Surf",
  fish_old: "Old Rod",
  fish_good: "Good Rod",
  fish_super: "Super Rod",
  static: "Static",
  raid_den: "Raid Den",
  gift: "Gift",
  trade: "Trade",
  mystery_gift: "Mystery Gift",
  egg_vendor: "Egg Vendor",
  game_corner: "Game Corner",
  fossil: "Fossil",
  unobtainable: "Unobtainable",
};

function pushIndexedRow(index, key, row) {
  if (key === undefined || key === null)
    return;

  if (!index[key])
    index[key] = [];
  index[key].push(row);
}

function sortWorldRows(rows) {
  return [...rows].sort((left, right) =>
    (left.postgame === right.postgame ? 0 : left.postgame ? 1 : -1)
    || String(left.location_name || "").localeCompare(String(right.location_name || ""))
    || String(left.acquisition_type || "").localeCompare(String(right.acquisition_type || ""))
    || (Number(left.level_min || 0) - Number(right.level_min || 0))
    || (Number(left.id || 0) - Number(right.id || 0))
  );
}

function buildWorldDataIndexes(payloads = {}) {
  const locations = Array.isArray(payloads.locations) ? payloads.locations : [];
  const pokemonAcquisitions = Array.isArray(payloads.pokemonAcquisitions) ? payloads.pokemonAcquisitions : [];
  const moveAcquisitions = Array.isArray(payloads.moveAcquisitions) ? payloads.moveAcquisitions : [];
  const itemAcquisitions = Array.isArray(payloads.itemAcquisitions) ? payloads.itemAcquisitions : [];
  const raidDens = Array.isArray(payloads.raidDens) ? payloads.raidDens : [];
  const notes = Array.isArray(payloads.notes) ? payloads.notes : [];

  worldData = {
    locations,
    pokemonAcquisitions,
    moveAcquisitions,
    itemAcquisitions,
    raidDens,
    notes,
  };

  locationsById = Object.fromEntries(locations.map((row) => [row.id, row]));
  pokemonAcquisitionsBySpeciesId = {};
  moveAcquisitionsByMoveId = {};
  itemAcquisitionsByItemId = {};
  raidDensBySpeciesId = {};

  for (const row of pokemonAcquisitions)
    pushIndexedRow(pokemonAcquisitionsBySpeciesId, row.species_id, row);

  for (const row of moveAcquisitions)
    pushIndexedRow(moveAcquisitionsByMoveId, row.move_id, row);

  for (const row of itemAcquisitions)
    pushIndexedRow(itemAcquisitionsByItemId, row.item_id, row);

  for (const row of raidDens)
    pushIndexedRow(raidDensBySpeciesId, row.species_id, row);
}

function getLocationNameById(locationId, fallback = "") {
  return locationsById?.[locationId]?.name || fallback || "";
}

function getCoverageWorldSourceMon(mon) {
  if (!mon?.ancestor || mon.ancestor === mon.ID)
    return { sourceMon: mon, usedAncestorFallback: false };

  const ancestorMon = getMergedSpeciesSync(mon.ancestor);
  if (!ancestorMon || ancestorMon.dexID !== mon.dexID)
    return { sourceMon: mon, usedAncestorFallback: false };

  const directRows = pokemonAcquisitionsBySpeciesId?.[mon.ID] || [];
  if (directRows.length > 0)
    return { sourceMon: mon, usedAncestorFallback: false };

  const ancestorRows = pokemonAcquisitionsBySpeciesId?.[ancestorMon.ID] || [];
  if (ancestorRows.length > 0)
    return { sourceMon: ancestorMon, usedAncestorFallback: true };

  return { sourceMon: mon, usedAncestorFallback: false };
}

function getSpeciesAcquisitionRows(monOrId) {
  const mon = typeof monOrId === "object"
    ? getMergedSpeciesSync(monOrId)
    : getMergedSpeciesSync(monOrId);

  if (!mon)
    return { rows: [], usedAncestorFallback: false, sourceMon: null };

  const { sourceMon, usedAncestorFallback } = getCoverageWorldSourceMon(mon);
  const rows = sortWorldRows(pokemonAcquisitionsBySpeciesId?.[sourceMon?.ID] || []);
  return { rows, usedAncestorFallback, sourceMon };
}

function getMoveAcquisitionRows(moveOrId, acquisitionTypes = null) {
  const moveId = typeof moveOrId === "object" ? moveOrId?.ID : moveOrId;
  let rows = [...(moveAcquisitionsByMoveId?.[moveId] || [])];

  if (Array.isArray(acquisitionTypes) && acquisitionTypes.length > 0) {
    const allowed = new Set(acquisitionTypes);
    rows = rows.filter((row) => allowed.has(row.acquisition_type));
  }

  const grouped = new Map();
  for (const row of rows) {
    const isCodeMove = ["tm", "hm", "tm_shop"].includes(row.acquisition_type);
    const normalizedCodeNumber = String(row.code_number || "").replace(/^0+/, "") || "0";
    const dedupeKey = isCodeMove
      ? [
          row.move_id ?? moveId,
          normalizedCodeNumber,
          row.acquisition_type === "hm" ? "hm" : "tmhm",
        ].join("|")
      : [
          row.move_id ?? moveId,
          row.acquisition_type || "",
          row.location_id || row.location_name || "",
        ].join("|");

    if (!grouped.has(dedupeKey))
      grouped.set(dedupeKey, []);
    grouped.get(dedupeKey).push(row);
  }

  return [...grouped.values()].map((group) => mergeMoveAcquisitionRows(group)).sort((left, right) =>
    String(left.acquisition_type || "").localeCompare(String(right.acquisition_type || ""))
    || String(left.code || "").localeCompare(String(right.code || ""))
    || String(left.location_name || "").localeCompare(String(right.location_name || ""))
    || Number(left.id || 0) - Number(right.id || 0)
  );
}

function getMoveAcquisitionCodeLabel(row) {
  const number = String(row?.code_number || "").replace(/^0+/, "") || String(row?.code_number || "");
  if (row?.acquisition_type === "hm")
    return number ? `HM ${number.padStart(3, "0")}` : "HM";
  if (row?.acquisition_type === "tm" || row?.acquisition_type === "tm_shop")
    return number ? `TM ${number.padStart(3, "0")}` : "TM";
  return row?.code || getAcquisitionTypeLabel(row?.acquisition_type);
}

function normalizeAcquisitionPhrase(value) {
  return cleanCell(value).toLowerCase().replace(/[.]/g, "");
}

function mergeLocationPhrases(values) {
  const unique = [];
  const seen = new Set();

  for (const rawValue of values) {
    const value = cleanCell(rawValue);
    if (!value)
      continue;
    const normalized = normalizeAcquisitionPhrase(value);
    if (!normalized || seen.has(normalized))
      continue;
    seen.add(normalized);
    unique.push(value);
  }

  if (unique.length <= 1)
    return unique[0] || "";

  const sorted = unique.sort((left, right) => right.length - left.length);
  let primary = sorted[0];
  const extras = [];
  const primaryNormalized = normalizeAcquisitionPhrase(primary);

  for (const candidate of sorted.slice(1)) {
    const normalized = normalizeAcquisitionPhrase(candidate);
    if (primaryNormalized.includes(normalized) || normalized.includes(primaryNormalized))
      continue;
    extras.push(candidate.replace(/\.$/, ""));
  }

  if (extras.length === 0)
    return primary;

  return `${primary.replace(/\.$/, "")} • ${extras.join(" • ")}.`;
}

function mergeMoveAcquisitionRows(rows) {
  if (!rows || rows.length === 0)
    return null;
  if (rows.length === 1)
    return rows[0];

  const preferredType = rows.some((row) => row.acquisition_type === "hm")
    ? "hm"
    : rows.some((row) => row.acquisition_type === "tm_shop")
      ? "tm_shop"
      : rows[0].acquisition_type;
  const preferredCodeRow = rows.find((row) => /^(TM|HM)\s/i.test(String(row.code || ""))) || rows[0];
  const preferredLocationRow = [...rows].sort((left, right) =>
    (String(right.location_name || "").length - String(left.location_name || "").length)
    || ((right.notes ? 1 : 0) - (left.notes ? 1 : 0))
  )[0];

  const mergedLocation = mergeLocationPhrases(rows.map((row) => row.location_name));
  const mergedRequirements = mergeLocationPhrases(rows.map((row) => row.requirements));
  const mergedNotes = mergeLocationPhrases(rows.map((row) => row.notes));

  return {
    ...preferredLocationRow,
    acquisition_type: preferredType,
    code: preferredCodeRow.code,
    code_number: preferredCodeRow.code_number,
    location_name: mergedLocation || preferredLocationRow.location_name,
    requirements: mergedRequirements || preferredLocationRow.requirements,
    notes: mergedNotes || preferredLocationRow.notes,
  };
}

function getAcquisitionTypeLabel(type) {
  return WORLD_ACQUISITION_LABELS[type] || type || "Unknown";
}

function getSpeciesAcquisitionGroups(monOrId) {
  const result = getSpeciesAcquisitionRows(monOrId);
  const groups = [];

  for (const group of WORLD_ACQUISITION_GROUPS) {
    const rows = result.rows.filter((row) => group.types.includes(row.acquisition_type));
    if (rows.length === 0)
      continue;
    groups.push({
      ...group,
      rows,
    });
  }

  return {
    ...result,
    groups,
  };
}

function formatLevelRange(row) {
  if (row.level_min && row.level_max && row.level_min !== row.level_max)
    return `Lv. ${row.level_min}-${row.level_max}`;
  if (row.level_min)
    return `Lv. ${row.level_min}`;
  if (row.level_raw)
    return `Lv. ${row.level_raw}`;
  return "";
}

function formatPokemonAcquisitionMeta(row) {
  const parts = [getAcquisitionTypeLabel(row.acquisition_type)];
  if (row.rarity)
    parts.push(row.rarity);
  else if (row.rarity_percent)
    parts.push(`${row.rarity_percent}%`);

  const level = formatLevelRange(row);
  if (level)
    parts.push(level);
  if (row.time_of_day)
    parts.push(row.time_of_day);
  if (row.requirements)
    parts.push(row.requirements);
  if (row.notes)
    parts.push(row.notes);
  if (row.postgame)
    parts.push("Postgame");

  return parts.filter(Boolean).join(" • ");
}

function formatMoveAcquisitionSummary(row) {
  const locationName = getLocationNameById(row.location_id, row.location_name);
  const parts = [];

  if (locationName)
    parts.push(locationName);
  if (row.npc_name)
    parts.push(row.npc_name);
  if (row.cost !== undefined && row.cost !== null && row.cost !== "")
    parts.push(String(row.cost));
  if (row.requirements)
    parts.push(row.requirements);
  if (row.notes)
    parts.push(row.notes);
  if (row.hardcore_note)
    parts.push(`HC: ${row.hardcore_note}`);

  return parts.filter(Boolean).join(" • ");
}
