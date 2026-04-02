function buildDataUrl(path) {
	const encodedVersion = encodeURIComponent(version || "rrdex");
	return `${path}?v=${encodedVersion}`;
}

async function fetchJsonFile(path) {
	const response = await fetch(buildDataUrl(path), { cache: "no-store" });
	if (!response.ok)
		throw new Error(`Request failed for ${path} (${response.status})`);
	return response.json();
}

async function fetchOptionalJsonFile(path, fallback = null) {
	try {
		return await fetchJsonFile(path);
	}
	catch (error) {
		console.warn(`Optional data unavailable for ${path}.`, error);
		return fallback;
	}
}

function applySharedData(payloads) {
	species = payloads.speciesSummary;
	moves = payloads.moves;
	abilities = payloads.abilities;
	typeData = payloads.types;
	types = payloads.types.byId || payloads.types;

	const support = payloads.support || {};
	items = support.items || {};
	areas = support.areas || {};
	tmMoves = support.tmMoves || {};
	tutorMoves = support.tutorMoves || {};
	trainers = support.trainers || {};
	natures = support.natures || {};
	eggGroups = support.eggGroups || {};
	splits = support.splits || {};
	evolutions = support.evolutions || {};
	scaledLevels = support.scaledLevels || {};
	capIDs = support.capIDs || support.caps || {};
	sprites = support.sprites || {};
}

async function loadSpeciesDetailsIndex() {
	if (speciesDetailsLoaded)
		return speciesDetailsById;

	if (!speciesDetailsPromise) {
		speciesDetailsPromise = fetchJsonFile("species-details.json")
			.then((details) => {
				speciesDetailsById = details || {};
				speciesDetailsLoaded = true;
				return speciesDetailsById;
			})
			.catch((error) => {
				speciesDetailsPromise = null;
				throw error;
			});
	}

	return speciesDetailsPromise;
}

async function ensureSpeciesDetails(monOrId) {
	const speciesId = typeof monOrId === "object" ? monOrId?.ID : monOrId;
	const summaryMon = typeof monOrId === "object"
		? (species?.[speciesId] || monOrId)
		: species?.[speciesId];

	if (!summaryMon)
		return null;

	if (speciesDetailsLoaded && speciesDetailsById?.[speciesId])
		return mergeSpeciesData(summaryMon, speciesDetailsById[speciesId]);

	await loadSpeciesDetailsIndex();
	return mergeSpeciesData(summaryMon, speciesDetailsById?.[speciesId] || {});
}

async function fetchData() {
	const [
		speciesSummary,
		movesData,
		abilitiesData,
		typesData,
		supportData,
		spritesData,
	] = await Promise.all([
		fetchJsonFile("species-summary.json"),
		fetchJsonFile("movements.json"),
		fetchJsonFile("abilities.json"),
		fetchJsonFile("types.json"),
		fetchJsonFile("support-data.json"),
		fetchJsonFile("sprites.json"),
	]);

	const [
		locationsData,
		pokemonAcquisitionsData,
		moveAcquisitionsData,
		itemAcquisitionsData,
		raidDensData,
		notesData,
	] = await Promise.all([
		fetchOptionalJsonFile("output/world-data/locations.json", []),
		fetchOptionalJsonFile("output/world-data/pokemon_acquisitions.json", []),
		fetchOptionalJsonFile("output/world-data/move_acquisitions.json", []),
		fetchOptionalJsonFile("output/world-data/item_acquisitions.json", []),
		fetchOptionalJsonFile("output/world-data/raid_dens.json", []),
		fetchOptionalJsonFile("output/world-data/notes.json", []),
	]);

	applySharedData({
		speciesSummary,
		moves: movesData,
		abilities: abilitiesData,
		types: typesData,
		support: { ...supportData, sprites: spritesData },
	});

	if (typeof buildWorldDataIndexes === "function") {
		buildWorldDataIndexes({
			locations: locationsData,
			pokemonAcquisitions: pokemonAcquisitionsData,
			moveAcquisitions: moveAcquisitionsData,
			itemAcquisitions: itemAcquisitionsData,
			raidDens: raidDensData,
			notes: notesData,
		});
	}

	const loadingScreen = document.getElementById("loadingScreen");
	const main = document.querySelector("main");
	loadingScreen.className = "hide";
	main.className = "";
}

async function onStartup() {
	await fetchData();
	setupTables();
	setupFilters();

	if (typeof initBackend === "function")
		await initBackend();
}

onStartup().catch((error) => {
	console.warn("Failed to load Pokedex data.", error);
	const loadingScreen = document.getElementById("loadingScreen");
	if (loadingScreen)
		loadingScreen.innerHTML = "<p>Failed to load Pokedex data. Try reloading the page or running the site from a local web server.</p>";
});
