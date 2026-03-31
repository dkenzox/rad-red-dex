async function fetchDataFile(url, useCache = false) {
	let request = new Request(url);
	let response = null;

	if (useCache && typeof caches !== "undefined") {
		const cache = await caches.open(version);
		response = await cache.match(request);

		if (!response) {
			const networkResponse = await fetch(request);
			if (!networkResponse.ok) {
				throw new Error(`Request failed for ${url} (${networkResponse.status})`);
			}
			await cache.put(request, networkResponse.clone());
			response = networkResponse;
		}
	} else {
		response = await fetch(request);
		if (!response.ok) {
			throw new Error(`Request failed for ${url} (${response.status})`);
		}
	}

	let data = await response.text();
	return new Function("return " + data + ";")();
}

function applyData(data) {
	species = data.species;
	moves = data.moves;
	abilities = data.abilities;
	items = data.items;
	areas = data.areas;
	tmMoves = data.tmMoves;
	tutorMoves = data.tutorMoves;
	trainers = data.trainers;
	natures = data.natures;
	eggGroups = data.eggGroups;
	types = data.types;
	splits = data.splits;
	evolutions = data.evolutions;
	scaledLevels = data.scaledLevels;
	capIDs = data.capIDs;
	sprites = data.sprites;
}

async function fetchData() {
	const sources = [
		{ url: "data.js", useCache: false },
		{ url: `https://raw.githubusercontent.com/${repo}/master/data.js`, useCache: true },
	];

	let lastError = null;
	for (const source of sources) {
		try {
			const data = await fetchDataFile(source.url, source.useCache);
			applyData(data);

			const loadingScreen = document.getElementById("loadingScreen");
			const main = document.querySelector("main");
			loadingScreen.className = "hide";
			main.className = "";
			return;
		} catch (error) {
			lastError = error;
			console.warn(`Failed to load data from ${source.url}`, error);
		}
	}

	const loadingScreen = document.getElementById("loadingScreen");
	loadingScreen.innerHTML = "<p>Failed to load Pokedex data. Try reloading the page or running the site from a local web server.</p>";
	throw lastError;
}

async function onStartup() {
	
	await fetchData();
	
	setupTables();
	
	setupFilters();
	
	if(Array.prototype.equals)
			console.warn("Overriding existing Array.prototype.equals. Possible causes: New API defines the method, there's a framework conflict or you've got double inclusions in your code.");
	// attach the .equals method to Array's prototype to call it on any array
	Array.prototype.equals = function (array) {
		// if the other array is a falsy value, return
		if (!array)
			return false;
		// if the argument is the same array, we can be sure the contents are same as well
		if(array === this)
			return true;
		// compare lengths - can save a lot of time 
		if (this.length != array.length)
			return false;
	
		for (var i = 0, l=this.length; i < l; i++) {
			// Check if we have nested arrays
			if (this[i] instanceof Array && array[i] instanceof Array) {
				// recurse into the nested arrays
				if (!this[i].equals(array[i]))
					return false;       
			}           
			else if (this[i] != array[i]) { 
				// Warning - two different object instances will never be equal: {x:20} != {x:20}
				return false;   
			}           
		}       
		return true;
	}
	// Hide method from for-in loops
	Object.defineProperty(Array.prototype, "equals", {enumerable: false});
}

onStartup();
