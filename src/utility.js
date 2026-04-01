function getAbilityName(ability, species, raw = false) {
  if (ability[0] === 0) return undefined;

  const mappedAbility = raw ? ability : getMappedAbility(ability, species);
  return abilities[mappedAbility[0]].names[mappedAbility[1]];
}

function getMove(moveIdx, species, raw = false) {
  return moves[raw ? moveIdx : getMappedMove(moveIdx, species)];
}

function getFullLearnset(mon) {
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

function getSprite(ID) {
  let sprite = sprites[ID];
  if (sprite === undefined) sprite = sprites[0];
  return sprite;
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
