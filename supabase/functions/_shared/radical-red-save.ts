export type RandomizerFlags = {
  abilities: boolean;
  learnset: boolean;
  normalSpecies: boolean;
  scaledSpecies: boolean;
};

export type SaveMetadata = {
  trainerName: string;
  trainerId: number;
  restricted: boolean;
  hardmode: boolean;
  random: RandomizerFlags;
};

export type ParsedPokemon = {
  containerType: "party" | "box";
  containerIndex: number;
  slotIndex: number;
  speciesId?: number;
  nickname?: string;
  level?: number;
  metLocationId?: number;
  metLevel?: number;
  metGame?: number;
  abilityId?: number;
  abilitySlot?: number;
  heldItemId?: number;
  rawData?: Record<string, unknown>;
  moveIds?: number[];
};

export type ParseSaveResult = {
  metadata: SaveMetadata;
  party: ParsedPokemon[];
  boxedPokemon: ParsedPokemon[];
  warnings: string[];
};

const NAME_OFFSET = 0x000;
const TRAINED_ID_OFFSET = 0x00a;
const HARDMODE_BITFLAG = 0x0db2;
const RESTRICTED_BITFLAG = 0x0dc3;
const SCALED_SPECIES_BITFLAG = 0x0f2b;
const NORMAL_SPECIES_LEARNSET_ABILITY_BITFLAG = 0x0f2c;
const SECTOR_SIZE = 0x1000;
const SAVE_SCAN_LIMIT = 0x1c000;

const CHARACTER_ENCODINGS = [
  " ", "À", "Á", "Â", "Ç", "È", "É", "Ê", "Ë", "Ì", "", "Î", "Ï", "Ò", "Ó", "Ô",
  "Œ", "Ù", "Ú", "Û", "Ñ", "ß", "à", "á", "", "ç", "è", "é", "ê", "ë", "ì", "",
  "î", "ï", "ò", "ó", "ô", "œ", "ù", "ú", "û", "ñ", "º", "ª", "er", "&", "+", "",
  "", "", "", "", "Lv", "=", ";", "", "", "", "", "", "", "", "", "",
  "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
  "▯", "¿", "¡", "PK", "MN", "PO", "Ke", "", "", "", "Í", "%", "(", ")", " ", " ",
  " ", " ", " ", " ", " ", "", "", "", "â", "", "", "", "", "", "", "í",
  "", "", "", "", "", "", "", "", "", "↑", "↓", "←", "→", "*", "*", "*",
  "*", "*", "*", "*", "e", "<", ">", "", "", "", "", "", "", "", "", "",
  "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
  "re", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "!", "?", ".", "-", "･",
  "…", "“", "”", "‘", "’", "♂", "♀", "$", ",", "×", "/", "A", "B", "C", "D", "E",
  "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U",
  "V", "W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k",
  "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "►",
  ":", "Ä", "Ö", "Ü", "ä", "ö", "ü", "", "", "", "", "", "", "", "", "",
];

function findSector(file: DataView, id: number): number {
  let latestOffset = -1;
  let latestSaveIndex = -1;

  for (let offset = 0; offset < SAVE_SCAN_LIMIT; offset += SECTOR_SIZE) {
    const sectorId = file.getUint16(offset + 0x0ff4, true);
    const saveIndex = file.getUint32(offset + 0x0ffc, true);

    if (sectorId === id && saveIndex > latestSaveIndex) {
      latestOffset = offset;
      latestSaveIndex = saveIndex;
    }
  }

  return latestOffset;
}

function decodeTrainerName(file: DataView, trainerInfoOffset: number): string {
  let name = "";

  for (let idx = 0; idx < 8; idx++) {
    const charCode = file.getUint8(trainerInfoOffset + NAME_OFFSET + idx);
    if (charCode === 0xff) {
      break;
    }

    name += CHARACTER_ENCODINGS[charCode] ?? "";
  }

  return name.trim();
}

function parseSaveMetadata(file: DataView): SaveMetadata {
  for (let sectorId = 0; sectorId < 14; sectorId++) {
    if (findSector(file, sectorId) === -1) {
      throw new Error("Missing required save sector. Expected a .sav file, not a save state.");
    }
  }

  const trainerInfo = findSector(file, 0x0);
  const trainerId = file.getUint32(trainerInfo + TRAINED_ID_OFFSET, true);

  const scaledBitflag = file.getUint8(trainerInfo + SCALED_SPECIES_BITFLAG);
  const scaledSpecies = (scaledBitflag & 0x4) > 0;

  const randomBitFlag = file.getUint8(
    trainerInfo + NORMAL_SPECIES_LEARNSET_ABILITY_BITFLAG,
  );
  const normalSpecies = (randomBitFlag & 0x1) > 0;
  const learnset = (randomBitFlag & 0x2) > 0;
  const abilities = (randomBitFlag & 0x4) > 0;

  const gameSpecificData = findSector(file, 0x4);
  const hardmodeBitflag = file.getUint8(gameSpecificData + HARDMODE_BITFLAG);
  const restrictedBitFlag = file.getUint8(gameSpecificData + RESTRICTED_BITFLAG);

  return {
    trainerName: decodeTrainerName(file, trainerInfo),
    trainerId,
    restricted: (restrictedBitFlag & 0x40) > 0,
    hardmode: (hardmodeBitflag & 0x10) > 0,
    random: {
      abilities,
      learnset,
      normalSpecies,
      scaledSpecies,
    },
  };
}

function parsePartyPokemon(_file: DataView): ParsedPokemon[] {
  // TODO:
  // Parse the Gen III party structs from the save and surface the actual roster,
  // learned moves, held items, and origin metadata.
  //
  // The save format stores per-mon origin info such as met location, met level,
  // and met game. We can expose those fields here later once the Radical Red
  // box/party offsets and map-section lookup table are wired in.
  return [];
}

function parseBoxPokemon(_file: DataView): ParsedPokemon[] {
  // TODO:
  // Parse PC storage once party import is working. This should return the same
  // shape as party import so the frontend can reuse team-import UI.
  return [];
}

export function parseRadicalRedSave(buffer: ArrayBuffer): ParseSaveResult {
  const file = new DataView(buffer);
  const metadata = parseSaveMetadata(file);

  return {
    metadata,
    party: parsePartyPokemon(file),
    boxedPokemon: parseBoxPokemon(file),
    warnings: [
      "Party and PC parsing are not implemented yet in the server parser scaffold.",
      "Met-location IDs can be extracted once Gen III mon structs are parsed and mapped to Radical Red area names.",
    ],
  };
}
