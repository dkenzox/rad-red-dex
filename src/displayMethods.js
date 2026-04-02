function displayHelp() {
	$('#helpModal').modal('show');
}

function toggleLearnsetSection(sectionId) {
	let section = document.getElementById(sectionId);
	if (!section)
		return;

	section.classList.toggle('learnsetToggleCollapsed');
	let chevron = section.querySelector('.learnsetToggleChevron');
	if (chevron)
		chevron.textContent = section.classList.contains('learnsetToggleCollapsed') ? '▸' : '▾';
}

function displaySpeciesRow(tracker, mon) {
	let currentRow = document.createElement('tr');
	currentRow.className = 'speciesRow';
	currentRow.onclick = function(event) {
		if (event.target.closest('.favoriteStarButton'))
			return;
		displaySpeciesPanel(mon);
	};
	tracker.body.appendChild(currentRow);

	currentRow.append(
		buildWrapper('td', 'speciesDexIDWrapper', mon.dexID),
		buildWrapperSprite('td', 'speciesSprite', getSprite(mon.ID)),
		buildWrapperSpeciesName('td', 'speciesName', mon),
		buildWrapperTypes('td', 'speciesTypes', types[mon.type[0]], types[mon.type[1]]),
		buildWrapperAbilities('td', 'speciesAbilities', mon.abilities, mon.ID),
		buildWrapperStat('td', 'speciesStat', 'HP', mon.stats[0]),
		buildWrapperStat('td', 'speciesStat', 'Atk', mon.stats[1]),
		buildWrapperStat('td', 'speciesStat', 'Def', mon.stats[2]),
		buildWrapperStat('td', 'speciesStat', 'SpA', mon.stats[4]),
		buildWrapperStat('td', 'speciesStat', 'SpD', mon.stats[5]),
		buildWrapperStat('td', 'speciesStat', 'Spe', mon.stats[3]),
		buildWrapperStat('td', 'speciesStat', 'BST', mon.stats.reduce((total, y) => total += y, 0))
	);

	buildBackgroundColor(currentRow, mon);
}

function buildFavoriteStar(mon, contextClass = '') {
	const isFavorited = typeof isSpeciesFavorited === 'function' && isSpeciesFavorited(mon.ID);
	let button = document.createElement('button');
	button.type = 'button';
	button.className = `favoriteStarButton${contextClass ? ' ' + contextClass : ''}${isFavorited ? ' favoriteStarButtonActive' : ''}`;
	button.textContent = '★';
	button.setAttribute('aria-label', `${isFavorited ? 'Remove' : 'Add'} ${mon.key} ${'from favorites'}`);
	button.title = `${isFavorited ? 'Remove from' : 'Add to'} favorites`;
	button.addEventListener('click', function(event) {
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();

		if (typeof toggleFavoriteSpeciesFromStar === 'function')
			toggleFavoriteSpeciesFromStar(mon.ID);
	});
	return button;
}

function buildWrapperSpeciesName(tag, className, mon) {
	let wrapper = buildWrapper(tag, className + 'Wrapper');
	let content = buildWrapper('div', className + 'Content');
	let header = buildWrapper('div', className + 'Header');
	header.append(
		buildFavoriteStar(mon, `${className}FavoriteStar`),
		buildWrapper('div', className + 'Label', mon.key)
	);
	content.append(header);

	wrapper.append(content);
	return wrapper;
}

function displayLevelUpMovesRow(tracker, movePair) {
	let [move, level] = movePair;
	let currentRow = document.createElement('tr');
	currentRow.className = 'movesRow';
	tracker.body.appendChild(currentRow);
	
	currentRow.append(
		buildWrapper('td', 'moveLevelWrapper', level),
		buildWrapper('td', 'moveNameWrapper', move.name),
		buildWrapperTypes('td', 'moveType', types[move.type]),
		buildWrapperSprite('td', 'moveSplit', getSprite(splits[move.split])),
		buildWrapperMovePower('td', 'movePower', move, currentSpeciesPanelMon),
		buildWrapper('td', 'moveAccuracyWrapper', move.accuracy),
		buildWrapperMoveDescription('td', 'moveDescription', move, tracker)
	);
}

function displayMovesRow(tracker, move) {
	let currentRow = document.createElement('tr');
	currentRow.className = 'movesRow';
	tracker.body.appendChild(currentRow);
	
	currentRow.append(
		buildWrapper('td', 'moveNameWrapper', move.name),
		buildWrapperTypes('td', 'moveType', types[move.type]),
		buildWrapperSprite('td', 'moveSplit', getSprite(splits[move.split])),
		buildWrapperMovePower('td', 'movePower', move, currentSpeciesPanelMon),
		buildWrapper('td', 'moveAccuracyWrapper', move.accuracy),
		buildWrapperMoveDescription('td', 'moveDescription', move, tracker)
	);
}

function setCoverageModeAndRefresh(mode) {
	setCoverageModePreference(mode);
	if (currentSpeciesPanelMon)
		displaySpeciesPanel(currentSpeciesPanelMon);
}

function buildCoverageModeSelector(profile) {
	let wrapper = buildWrapper('div', 'infoCoverageModeWrapper');
	wrapper.append(buildWrapper('div', 'infoCoverageModeLabel', 'Coverage mode'));

	let controls = buildWrapper('div', 'infoCoverageModeControls');
	for (const mode of ["auto", "physical", "special", "mixed"]) {
		let button = document.createElement("button");
		button.type = "button";
		button.className = `infoCoverageModeButton${profile.selectedMode === mode ? ' infoCoverageModeButtonActive' : ''}`;
		button.textContent = mode === "auto"
			? "Auto"
			: mode.charAt(0).toUpperCase() + mode.slice(1);
		button.onclick = function() {
			setCoverageModeAndRefresh(mode);
		};
		controls.append(button);
	}

	wrapper.append(controls);
	return wrapper;
}

function buildCoverageRoleBadge(profile) {
	let wrapper = buildWrapper(
		'div',
		`infoCoverageRoleBadge infoCoverageRoleBadge${profile.mode.charAt(0).toUpperCase() + profile.mode.slice(1)}`,
		profile.label
	);
	if (profile.isAuto)
		applyHoverTooltip(wrapper, 'Auto-selected from offensive stats and relevant abilities.');
	return wrapper;
}

async function displaySpeciesPanel(mon) {
	mon = await ensureSpeciesDetails(mon);
	if (!mon)
		return;

	let infoDisplay = document.getElementById('speciesPanelInfoDisplay');
	currentSpeciesPanelMon = mon;
	const coverageSummary = getCoverageSummary(mon, { mode: getCoverageModePreference() });
	let tables = [
		['speciesLearnsetPrevoExclusiveTable', mon.prevoMoves?.map(x => getMove(x, mon.ID))],
		['speciesLearnsetLevelUpTable', mon.levelupMoves?.map(x => [getMove(x[0], mon.ID), x[1]])],
		['speciesLearnsetTMHMTable', mon.tmMoves?.map(x => getMove(tmMoves[x], mon.ID, true)).filter(x => x !== undefined)],
		['speciesLearnsetTutorTable', mon.tutorMoves?.map(x => getMove(tutorMoves[x], mon.ID, true)).filter(x => x !== undefined)],
		['speciesLearnsetEggMovesTable', mon.eggMoves?.map(x => getMove(x, mon.ID, true))],
		['speciesLearnsetEventTable', mon.eventMoves?.map(x => getMove(x, mon.ID, true))],
	]
	
	infoDisplay.innerText = '';
	
	infoDisplay.append(
		buildWrapperSprite('div', 'infoSprite', getSprite(mon.ID)),
		(() => {
			let header = buildWrapper('div', 'infoNameHeader');
			header.append(
				buildFavoriteStar(mon, 'infoNameFavoriteStar'),
				buildWrapper('div', 'infoNameName', mon.key)
			);
			return header;
		})(),
		buildWrapper('div', 'infoDexIDWrapper',  '#' + mon.dexID),
		buildWrapperTypes('div', 'infoTypes', types[mon.type[0]], types[mon.type[1]]),
		buildWrapperAbilitiesFull('div', 'infoAbilities', mon.abilities, mon.ID),
		buildCoverageModeSelector(coverageSummary.offenseProfile),
		buildCoverageRoleBadge(coverageSummary.offenseProfile)
	);

	let accountActionsHost = buildWrapper('div', 'infoAccountActionsHost');
	accountActionsHost.id = 'speciesPanelAccountActionsHost';
	
	let statWrapper = buildWrapper('div', 'infoStats');
	statWrapper.append(
		buildWrapperStatFull('div', 'infoStat', 'HP', mon.stats[0]),
		buildWrapperStatFull('div', 'infoStat', 'Atk', mon.stats[1]),
		buildWrapperStatFull('div', 'infoStat', 'Def', mon.stats[2]),
		buildWrapperStatFull('div', 'infoStat', 'SpA', mon.stats[4]),
		buildWrapperStatFull('div', 'infoStat', 'SpD', mon.stats[5]),
		buildWrapperStatFull('div', 'infoStat', 'Spe', mon.stats[3]),
		buildWrapperStat('div', 'infoStat', 'BST', mon.stats.reduce((total, y) => total += y, 0))
	);
	
	infoDisplay.append(
		accountActionsHost,
		statWrapper,
		buildWrapperChangelog('div', 'infoChangelog', mon),
		buildWrapperFamilyTree('div', 'infoFamilyTree', mon),
		buildWrapperWorldLocations('div', 'infoWorldLocations', mon),
		buildWrapperCoverageDefensive('div', 'infoCoverage', mon.type[0], mon.type[1]),
		buildWrapperCoverageVsThreats('div', 'infoCoverageThreats', mon, coverageSummary),
		buildWrapperOffensiveTypeReference('div', 'infoOffensiveChart', mon),
		//buildWrapperCap('div', 'infoCap', mon.ID),
			buildWrapperHeldItems('div', 'infoItems', mon.items),
			//buildWrapperEggGroups('div', 'infoEggGroups', mon.eggGroup),
	);

	if (typeof renderSpeciesPanelAccountActions === 'function')
		renderSpeciesPanelAccountActions(mon);

	for (const [ID, data] of tables) {
		let table = document.getElementById(ID);
		table.className = ID === 'speciesLearnsetEggMovesTable'
			? 'tableWrapper learnsetToggleWrapper learnsetToggleCollapsed'
			: 'tableWrapper';
		if (data && data.length > 0) {
			populateTable(ID, data);
			table.classList.remove('hide');
			if (ID === 'speciesLearnsetEggMovesTable') {
				let chevron = table.querySelector('.learnsetToggleChevron');
				if (chevron)
					chevron.textContent = '▸';
			}
		}
		else
			table.classList.add('hide');
	}

	$('#speciesModal').modal('show');
}

function buildWrapper(tag, className, text=null) {
	let wrapper = document.createElement(tag);
	wrapper.className = className;
	if (text)
		wrapper.textContent = text;
	if (text === 0)
		wrapper.textContent = '-';
	
	return wrapper;
}

function applyHoverTooltip(element, text) {
	element.classList.add('hoverTooltip');
	element.dataset.tooltip = text;
	return element;
}

function buildCoverageMoveHoverCard(move) {
	let card = buildWrapper('div', 'coverageMoveHoverCard');
	let header = buildWrapper('div', 'coverageMoveHoverHeader');
	header.append(
		buildWrapper('div', 'coverageMoveHoverHeading', 'Type'),
		buildWrapper('div', 'coverageMoveHoverHeading', 'Category'),
		buildWrapper('div', 'coverageMoveHoverHeading', 'Power'),
		buildWrapper('div', 'coverageMoveHoverHeading', 'Acc')
	);

	let values = buildWrapper('div', 'coverageMoveHoverValues');
	values.append(
		buildWrapperTypes('div', 'coverageMoveHoverType', types[move.type]),
		buildWrapperSprite('div', 'coverageMoveHoverSplit', getSprite(splits[move.split])),
		buildWrapper('div', 'coverageMoveHoverStat', move.power),
		buildWrapper('div', 'coverageMoveHoverStat', move.accuracy)
	);

	let scoreLabel = buildWrapper('div', 'coverageMoveHoverScoreLabel', 'Coverage value vs this threat');
	let scoreRows = buildWrapper('div', 'coverageMoveHoverScoreRows');

	function appendScoreRow(label, entry) {
		let row = buildWrapper('div', 'coverageMoveHoverScoreRow');
		row.append(
			buildWrapper('div', 'coverageMoveHoverScoreName', label),
			buildWrapper('div', 'coverageMoveHoverScoreValue', Math.round(entry.coverageValue)),
		);

		let detail = buildWrapper('div', 'coverageMoveHoverScoreDetail');
		const matchupText = entry.matchupMultiplier === 4
			? '4× super-effective'
			: entry.matchupMultiplier === 2
				? '2× super-effective'
				: entry.matchupMultiplier === 1
					? '1× neutral'
					: `${formatCoverageMultiplier(entry.matchupMultiplier)}× matchup`;
		const parts = [
			`${types[entry.resolvedTypeId]?.name || types[move.type]?.name} type`,
			`${buildPowerPreviewFormula(entry)} × ${formatCoverageMultiplier(entry.matchupMultiplier)} = ${Math.round(entry.coverageValue)}`,
			matchupText,
			entry.fitLabel,
			...(entry.notes || []),
		];
		detail.textContent = parts.join(' • ');
		row.append(detail);
		scoreRows.append(row);
	}

	appendScoreRow(move.normalScore.isStab ? 'Standard STAB' : 'No ability boost', move.normalScore);
	for (const variant of move.abilityVariants || [])
		appendScoreRow(variant.abilityName, variant);

	card.append(
		header,
		buildWrapper('div', 'coverageMoveHoverName', move.name),
		values,
		scoreLabel,
		scoreRows,
		buildWrapper('div', 'coverageMoveHoverNote', 'These numbers include the matchup against this specific threat. Internal ranking still weighs role fit and weak off-plan penalties.'),
		buildWrapper('div', 'coverageMoveHoverSource', move.coverageSourceLabel || ''),
		buildWrapper('div', 'coverageMoveHoverDescription', move.description)
	);

	return card;
}

function buildWrapperSprite(tag, className, src) {
	let wrapper = buildWrapper(tag, className + 'Wrapper');
	
	let img = document.createElement('img');
	img.className = className;
	setSpriteImage(img, src);
	wrapper.append(img);
	
	return wrapper;
}

//function buildWrapperName(tag, className, mon) {
//	let wrapper = buildWrapper(tag, className + 'Wrapper');
//	
//	if (mon.family.variant)
//		wrapper.append(buildWrapper('div', className + 'Region', regions[mon.family.region].variant));
//	
//	wrapper.append(buildWrapper('div', className + 'Name', mon.name));
//
//	if (mon.family.form)
//		wrapper.append(buildWrapper('div', className + 'Form', mon.family.form));
//	
//	return wrapper;
//}

function buildWrapperTypes(tag, className, primary, secondary=null) {
	let wrapper = buildWrapper(tag, className + 'Wrapper');
	
	let typeBlock = buildWrapper('div', 'typeWrapper', primary.name);
	typeBlock.style.backgroundColor = primary.color;
	wrapper.append(typeBlock);
	
	if (secondary) {
		typeBlock = buildWrapper('div', 'typeWrapper', secondary.name);
		typeBlock.style.backgroundColor = secondary.color;
		wrapper.append(typeBlock);
	}
	
	return wrapper;
}

function buildWrapperMovePower(tag, className, move, mon = null) {
	let preview = mon ? getMovePowerPreviewVariants(move, mon) : null;
	let displayPower = preview
		? Math.round(preview.normal.previewPower)
		: move.power;
	let wrapper = buildWrapper(tag, className + 'Wrapper', displayPower);

	if (!preview)
		return wrapper;

	const defaultPreviewLabel = preview.normal.isStab ? 'Standard STAB' : 'No ability boost';
	const lines = [
		'Displayed power',
		`Base Power: ${move.power}`,
		`${defaultPreviewLabel}: ${Math.round(preview.normal.previewPower)}`,
		`${types[preview.normal.resolvedTypeId]?.name || types[move.type]?.name} type • ${buildPowerPreviewFormula(preview.normal)}`,
	];

	for (const variant of preview.variants) {
		let extras = [
			`${types[variant.resolvedTypeId]?.name || types[move.type]?.name} type`,
			buildPowerPreviewFormula(variant),
		];
		if (variant.notes?.length)
			extras.push(...variant.notes);
		lines.push(`${variant.abilityName}: ${Math.round(variant.previewPower)}`);
		lines.push(extras.join(' • '));
	}

	if (lines.length > 1)
		applyHoverTooltip(wrapper, lines.join('\n'));

	return wrapper;
}

function buildWrapperMoveDescription(tag, className, move, tracker = null) {
	let wrapper = buildWrapper(tag, className + 'Wrapper');
	wrapper.append(buildWrapper('div', className + 'Text', move.description));

	let acquisitionTypes = null;
	if (tracker?.name === 'speciesLearnsetTMHMTable')
		acquisitionTypes = ['tm', 'hm', 'tm_shop'];
	else if (tracker?.name === 'speciesLearnsetTutorTable')
		acquisitionTypes = ['tutor'];

	if (!acquisitionTypes)
		return wrapper;

	const sources = getMoveAcquisitionRows(move.ID, acquisitionTypes);
	if (sources.length === 0)
		return wrapper;

	let list = buildWrapper('div', 'moveSourceList');
	for (const source of sources) {
		let entry = buildWrapper('div', 'moveSourceEntry');
		entry.append(
			buildWrapper('div', 'moveSourceBadge', getMoveAcquisitionCodeLabel(source)),
			buildWrapper('div', 'moveSourceText', formatMoveAcquisitionSummary(source))
		);
		list.append(entry);
	}

	wrapper.append(list);
	return wrapper;
}

function buildWrapperAbilities(tag, className, a, species) {
	let wrapper = buildWrapper(tag, className + 'Wrapper');
	
	if ((name = getAbilityName(a[1], species))) {
		let ability = getMappedAbility(a[1], species);
		let entry = buildWrapper('div', className + 'Primary', name);
		applyHoverTooltip(entry, abilities[ability[0]].description);
		wrapper.append(entry);
	}
	
	if ((name = getAbilityName(a[2], species))) {
		let ability = getMappedAbility(a[2], species);
		let entry = buildWrapper('div', className + 'Secondary', name);
		applyHoverTooltip(entry, abilities[ability[0]].description);
		wrapper.append(entry);
	}
	
	if ((name = getAbilityName(a[0], species))) {
		let ability = getMappedAbility(a[0], species);
		let entry = buildWrapper('div', className + 'Hidden', name);
		applyHoverTooltip(entry, abilities[ability[0]].description);
		wrapper.append(entry);
	}
	
	return wrapper;
}

function buildWrapperAbilitiesFull(tag, className, a, species) {
	let wrapper = buildWrapper(tag, className + 'Wrapper');
	
	let ability;
	if ((name = getAbilityName(a[1], species))) {
		ability = getMappedAbility(a[1], species);
		let entry = buildWrapper('div', className + 'Primary', name + ' - ' + abilities[ability[0]].description);
		applyHoverTooltip(entry, abilities[ability[0]].description);
		wrapper.append(entry);
	}

	if ((name = getAbilityName(a[2], species))) {
		ability = getMappedAbility(a[2], species);
		let entry = buildWrapper('div', className + 'Secondary', name + ' - ' + abilities[ability[0]].description);
		applyHoverTooltip(entry, abilities[ability[0]].description);
		wrapper.append(entry);
	}

	if ((name = getAbilityName(a[0], species))) {
		ability = getMappedAbility(a[0], species);
		let entry = buildWrapper('div', className + 'Hidden', name + ' - ' + abilities[ability[0]].description);
		applyHoverTooltip(entry, abilities[ability[0]].description);
		wrapper.append(entry);
	}

	return wrapper;
}

function buildWrapperStat(tag, className, label, value) {
	let wrapper = buildWrapper(tag, className + 'Wrapper');
	
	wrapper.append(buildWrapper('div', className + 'Label', label));
	wrapper.append(buildWrapper('div', className + 'Value', value));
	
	return wrapper;
}

function buildWrapperStatFull(tag, className, label, value) {
	let wrapper = buildWrapperStat(tag, className, label, value);
	
	let rank = 6;
	if (value < 150)
		rank = 5;
	if (value < 120)
		rank = 4;
	if (value < 90)
		rank = 3;
	if (value < 60)
		rank = 2;
	if (value < 30)
		rank = 1;
	
	let bar = buildWrapper('div', 'infoStatBar rank' + rank);
	bar.style.width = `${(value / 255) * 300}px`;
	wrapper.append(bar);
	
	return wrapper;
}

function buildWrapperChangelog(tag, className, mon) {
	let wrapper = buildWrapper(tag, className + 'Wrapper');
	
	if (!mon.changes)
		return wrapper;
	
	wrapper.append(buildWrapper('div', 'infoChangelogLabel', 'RR Changes'));
	
	if (mon.changes == 'new') {
		wrapper.append(buildWrapper('div', 'infoChangelogUnique', 'All New Pokemon!'));
		return wrapper;
	}
	
	if (mon.changes.type) {
		let typeWrapper = buildWrapper('div', 'infoChangelogTypesWrapper');
		typeWrapper.append(buildWrapperTypes('div', 'infoChangelogOldType', types[mon.changes.type[0]], types[mon.changes.type[1]]));
		typeWrapper.append(buildWrapper('div', className + 'ArrowWrapper', '→'));
		typeWrapper.append(buildWrapperTypes('div', 'infoChangelogNewType', types[mon.type[0]], types[mon.type[1]]));
		wrapper.append(typeWrapper);
	}
	
	if (mon.changes.abilities) {
		let abilityWrapper = buildWrapper('div', 'infoChangelogAbilityWrapper');
		for (const ability of [1, 2, 0]) {
			let oldAbility = mon.changes.abilities[ability];
			let newAbility = mon.abilities[ability];

			if (arrayEquals(newAbility, oldAbility))
				continue;
			if (typeof oldAbility !== 'string')
				oldAbility = getAbilityName(oldAbility, mon.ID, true);
			newAbility = getAbilityName(newAbility, mon.ID, true);
		
			if (oldAbility && newAbility)
				abilityWrapper.append(buildWrapper('div', 'infoChangelogAbility' + ability, oldAbility + ' → ' + newAbility));
			else if (newAbility)
				abilityWrapper.append(buildWrapper('div', 'infoChangelogAbility' + ability, 'None → ' + newAbility));
			else
				abilityWrapper.append(buildWrapper('div', 'infoChangelogAbility' + ability, oldAbility + ' → None'));
			}
		wrapper.append(abilityWrapper);
	}
	
	if (mon.changes.stats) {
		let statsWrapper = buildWrapper('div', className);
		
		for (const [idx, label] of Object.entries({HP:0, Atk:1, Def:2, SpA:4, SpD:5, Spe:3})) {
			if (mon.changes.stats[idx] === mon.stats[idx])
				continue;
			let statClass = mon.changes.stats[idx] < mon.stats[idx] ? 'infoChangelogBuff' : 'infoChangelogNerf';
			statsWrapper.append(buildWrapper('div', statClass, label + ' ' + mon.changes.stats[idx] + ' → ' + mon.stats[idx]));
		}
		wrapper.append(statsWrapper);
	}
	
	return wrapper;
}

function buildWrapperFamilyTree(tag, className, mon) {
	let wrapper = buildWrapper(tag, className + 'Wrapper');
	wrapper.append(buildWrapper('div', 'infoTreeEvoLabel', 'Evolution Line'));
	let display = buildWrapper('div', 'infoEvolutionMethods');
	const ancestorMon = getMergedSpeciesSync(mon.ancestor);
	if (ancestorMon)
		wrapper.append(familyTree(display, ancestorMon));
	wrapper.append(display);
	
	
	if (mon.order !== undefined) {
		let forms = Object.values(species).filter(x => x.dexID == mon.dexID).sort(cmp(x => x.order));
		wrapper.append(buildWrapper('div', 'infoTreeFormsLabel', 'Alternate Forms'));
		let formsWrapper = buildWrapper('div', 'infoFormsWrapper');
		for (const form of forms) {
			let spriteWrapper = buildWrapper('div', 'infoTreeSpriteWrapper');
			let img = document.createElement('img');
			img.className = 'infoTreeSprite';
			setSpriteImage(img, getSprite(form.ID));
			img.onclick = function () {
				displaySpeciesPanel(form);
			}
			spriteWrapper.append(img);
			formsWrapper.append(spriteWrapper);
		}
		wrapper.append(formsWrapper);
	}

	return wrapper;
}

function familyTree(display, mon, prevo=null, evo=null) {
	let wrapper = buildWrapper('div', 'infoTreeWrapper ' + mon.key);
	
	if (prevo) {
		wrapper.className += ' inner';
		let evoWrapper = buildWrapper('div', 'evoMethodWrapper');
		let arrow = buildWrapper('div', 'infoTreeArrow', `→`);
		
		let leftMon = prevo.key;
		let rightMon = mon.key;
		let description = eval(evolutions[evo[0]]);
		arrow.title = description;
		let method = buildWrapper('div', 'evoMethod');
		
		method.innerHTML = `<span>${leftMon}</span> → <span>${rightMon}</span> ${description}.`;
		display.append(method);
		
		evoWrapper.append(arrow);
		wrapper.append(evoWrapper);
	}
	else
		wrapper.className += ' outer';
	
	let spriteWrapper = buildWrapper('div', 'infoTreeSpriteWrapper');
	let img = document.createElement('img');
	img.className = 'infoTreeSprite';
	setSpriteImage(img, getSprite(mon.ID));
	img.onclick = function () {
		displaySpeciesPanel(mon);
	}
	spriteWrapper.append(img);
	wrapper.append(spriteWrapper);	
	if (mon.evolutions) {
		if (mon.evolutions.length === 1)
			wrapper.className += ' single';
		let branchWrapper = buildWrapper('div', 'infoTreeBranchWrapper');
		for (const evolution of mon.evolutions) {
			const evolvedMon = getMergedSpeciesSync(evolution[2]);
			if (evolvedMon)
				branchWrapper.append(familyTree(display, evolvedMon, mon, evolution));
		}
		wrapper.append(branchWrapper);
	}
	
	return wrapper;
}

function defensiveMultiplierWhenAttackedBy(attackerTypeEntry, primary, secondary) {
	let matchup = 1;
	for (const speciesType of [primary, secondary]) {
		if (speciesType === undefined)
			continue;
		switch (attackerTypeEntry.matchup[speciesType]) {
			case 20: matchup *= 2;   break;
			case  5: matchup *= 0.5; break;
			case  1: matchup *= 0;   break;
		}
	}
	return matchup;
}

function moveTypesSuperEffectiveVs(defenderTypeId) {
	let out = [];
	for (const moveType of Object.values(types)) {
		if (moveType.matchup[defenderTypeId] === 20)
			out.push(moveType);
	}
	out.sort((a, b) => a.name.localeCompare(b.name));
	return out;
}

function getCoverageThreats(mon) {
	let threats = [];
	for (const atkType of Object.values(types)) {
		let mult = defensiveMultiplierWhenAttackedBy(atkType, mon.type[0], mon.type[1]);
		if (mult >= 2)
			threats.push({ atkType, mult });
	}
	threats.sort((a, b) => b.mult - a.mult || a.atkType.name.localeCompare(b.atkType.name));
	return threats;
}

function scoreCoverageMove(move, mon, threatType, offenseProfile, abilityVariant = null) {
	const resolvedMove = getResolvedCoverageMove(move, mon, abilityVariant);
	const preview = getMovePowerPreview(move, mon, abilityVariant);
	let matchupMultiplier = getTypeEffectivenessMultiplier(resolvedMove.resolvedTypeId, threatType.ID);
	const splitMode = move.split === 0 ? 'physical' : 'special';
	const isStab = preview.isStab;
	const rolePenalty = offenseProfile.mode === 'mixed'
		? 1
		: (offenseProfile.mode === splitMode ? 1 : COVERAGE_ROLE_MISMATCH_PENALTY);
	const lowPowerPenalty = !isStab && move.power <= 60
		? COVERAGE_OFFPLAN_LOW_BP_PENALTY
		: 1;
	const explanations = [...preview.explanations];
	const stabMultiplier = preview.stabMultiplier;

	if (abilityVariant?.name === "Tinted Lens" && matchupMultiplier > 0 && matchupMultiplier < 1) {
		matchupMultiplier *= 2;
		explanations.push("Tinted Lens boost");
	}

	const coverageValue = preview.previewPower * matchupMultiplier;

	let score = coverageValue
		* rolePenalty
		* lowPowerPenalty;

	if (move.priority > 0)
		score *= 1.05;

	return {
		score,
		basePower: move.power,
		previewPower: preview.previewPower,
		coverageValue,
		matchupMultiplier,
		stabMultiplier,
		isStab,
		resolvedTypeId: resolvedMove.resolvedTypeId,
		fitLabel: offenseProfile.mode === 'mixed'
			? 'Mixed fit'
			: offenseProfile.mode === splitMode
				? `Fits ${offenseProfile.mode} role`
				: `Off-role ${splitMode} move`,
		explanations,
		abilityVariant,
		move,
	};
}

function buildCoverageMoveRecommendation(move, mon, threatType, offenseProfile) {
	const normalScore = scoreCoverageMove(move, mon, threatType, offenseProfile, null);
	const abilityVariants = [];

	for (const abilityVariant of getSpeciesAbilityVariants(mon)) {
		const scored = scoreCoverageMove(move, mon, threatType, offenseProfile, abilityVariant);
		if (
			Math.abs(scored.score - normalScore.score) < 0.01 &&
			scored.resolvedTypeId === normalScore.resolvedTypeId
		) {
			continue;
		}

		abilityVariants.push({
			...scored,
			abilityId: abilityVariant.id,
			abilityName: abilityVariant.name,
		});
	}

	const bestEntry = [normalScore, ...abilityVariants]
		.sort((a, b) =>
			b.score - a.score ||
			b.matchupMultiplier - a.matchupMultiplier ||
			b.stabMultiplier - a.stabMultiplier ||
			b.move.power - a.move.power ||
			a.move.name.localeCompare(b.move.name)
		)[0];

	return {
		...move,
		normalScore,
		abilityVariants,
		bestEntry,
		bestScore: bestEntry.score,
	};
}

function getCoverageSummary(mon, options = {}) {
	const threats = getCoverageThreats(mon);
	const offenseProfile = getEffectiveOffenseProfile(mon, options.mode || "auto");
	const candidateMoves = getCoverageCandidateMoves(mon, {
		levelup: true,
		tmhm: true,
		tutor: false,
		prevo: false,
		event: false,
	});

	const threatCoverage = threats.map((threat) => {
		const recommendations = candidateMoves
			.map(move => buildCoverageMoveRecommendation(move, mon, threat.atkType, offenseProfile))
			.filter(entry => entry.bestScore > 0)
			.sort((a, b) =>
				b.bestScore - a.bestScore ||
				b.bestEntry.matchupMultiplier - a.bestEntry.matchupMultiplier ||
				b.bestEntry.stabMultiplier - a.bestEntry.stabMultiplier ||
				b.power - a.power ||
				a.name.localeCompare(b.name)
			);

		const bestScore = recommendations[0]?.bestScore || 0;
		return {
			threat,
			bestScore,
			hasStrongCoverage: bestScore >= COVERAGE_STRONG_SCORE_THRESHOLD,
			recommendations: recommendations.slice(0, 3),
			bestEntry: recommendations[0]?.bestEntry || null,
		};
	});

	const uncoveredThreats = threatCoverage
		.filter(entry => !entry.hasStrongCoverage)
		.map(entry => ({ ...entry.threat, isUncovered: true }));

	return {
		threats,
		threatCoverage,
		uncoveredThreats,
		hasFullCoverage: threats.length > 0 && threatCoverage.every(entry => entry.hasStrongCoverage),
		offenseProfile,
		candidateMoveTypes: [...new Set(candidateMoves.map(move => move.type))]
			.map(typeId => types[typeId])
			.filter(Boolean)
			.sort((a, b) => a.name.localeCompare(b.name)),
	};
}

function buildWrapperCoverageDefensive(tag, className, primary, secondary=undefined) {
	let wrapper = buildWrapper(tag, className + 'Wrapper');
	
	let label = buildWrapper('div', 'coverageLabelWrapper', 'Weakness');
	let matchups = buildWrapper('div', 'coverageMatchupsWrapper');
	
	for (const type of Object.values(types)) {
		let matchup = defensiveMultiplierWhenAttackedBy(type, primary, secondary);
		matchups.append(buildWrapperTypeMatchup(type, matchup));
	}
	
	wrapper.append(label, matchups);
	
	return wrapper;
}

function buildWrapperCoverageThreatPills(tag, className, threats) {
	let wrapper = buildWrapper(tag, className + 'Wrapper');
	if (threats.length === 0) {
		wrapper.append(buildWrapper('div', 'coverageMoveNote', 'None'));
		return wrapper;
	}

	for (const threat of threats) {
		let pill = buildWrapperTypes('div', className, threat.atkType);
		if (threat.isUncovered) {
			pill.classList.add('coverageThreatMissing');
			applyHoverTooltip(pill, 'No trainable damaging move currently covers this weakness.');
		}
		wrapper.append(pill);
	}
	return wrapper;
}

function buildWrapperCoverageMovePills(tag, className, movesList, isDisabled = false) {
	let wrapper = buildWrapper(tag, className + 'Wrapper');
	if (isDisabled) {
		wrapper.classList.add('coverageMovesDisabled');
		wrapper.append(buildWrapper('div', 'coverageMoveNote', 'No strong learned move recommendation in this mode.'));
		return wrapper;
	}

	for (const move of movesList) {
		let chip = buildWrapper('div', 'coverageMoveChip', move.name);
		chip.classList.add('coverageMoveChipTrigger');
		if (move.bestEntry?.matchupMultiplier > 1)
			chip.classList.add('coverageMoveChipStrong');
		chip.append(buildCoverageMoveHoverCard(move));
		wrapper.append(chip);
	}
	return wrapper;
}

function buildWrapperCoverageVsThreats(tag, className, mon, providedSummary = null) {
	let wrapper = buildWrapper(tag, className + 'Wrapper');
	wrapper.append(buildWrapper('div', 'coverageLabelWrapper', 'Coverage vs threats'));
	wrapper.append(buildWrapper('div', 'coverageHelpText',
		'Ranks level-up and TM/HM damaging moves by heuristic effective power, STAB, role fit, and applicable ability boosts.'));

	const summary = providedSummary || getCoverageSummary(mon, { mode: getCoverageModePreference() });
	const threats = summary.threats;

	if (threats.length === 0) {
		wrapper.append(buildWrapper('div', 'coverageHelpText', 'No typings hit you for 2× or more.'));
		return wrapper;
	}

	let mergeBlock = buildWrapper('div', 'coverageMergedSuggestions');
	mergeBlock.append(buildWrapper('div', 'coverageSubLabel', 'Threats you want to answer'));
	const uncoveredThreatIds = new Set(summary.uncoveredThreats.map(({ atkType }) => atkType.ID));
	const orderedThreats = [
		...threats
			.filter(({ atkType }) => !uncoveredThreatIds.has(atkType.ID))
			.map((threat) => ({ ...threat, isUncovered: false })),
		...threats
			.filter(({ atkType }) => uncoveredThreatIds.has(atkType.ID))
			.map((threat) => ({ ...threat, isUncovered: true })),
	];
	mergeBlock.append(buildWrapperCoverageThreatPills('div', 'coveragePillRow', orderedThreats));
	wrapper.append(mergeBlock);

	for (const entry of summary.threatCoverage) {
		let line = buildWrapper(
			'div',
			`coverageThreatLine ${entry.hasStrongCoverage ? 'coverageThreatLineActive' : 'coverageThreatLineDisabled'}`
		);
		let left = buildWrapper('div', 'coverageThreatLeft');
		left.append(buildWrapperTypes('div', 'coverageThreatAttacker', entry.threat.atkType));
		line.append(left);

		let answers = buildWrapper('div', 'coverageThreatAnswers');
		answers.append(buildWrapper('div', 'coverageSectionLabel', 'Recommended moves'));
		answers.append(buildWrapperCoverageMovePills('div', 'coverageMoves', entry.recommendations, entry.recommendations.length === 0));
		line.append(answers);

		let movesWrapper = buildWrapper('div', 'coverageThreatMoves');
		movesWrapper.append(buildWrapper('div', 'coverageSectionLabel', 'Coverage status'));
		movesWrapper.append(buildWrapper(
			'div',
			'coverageMoveNote',
			entry.hasStrongCoverage
				? 'Strong learned answer found for this weakness.'
				: 'Best learned move is weak, off-role, or too low-power to count as strong coverage.'
		));
		line.append(movesWrapper);

		wrapper.append(line);
	}

	return wrapper;
}

function buildWrapperOffensiveTypeReference(tag, className, mon) {
	let wrapper = buildWrapper(tag, className + 'Wrapper');
	let det = document.createElement('details');
	det.className = 'offensiveTypeChartDetails';
	let sum = document.createElement('summary');
	sum.className = 'coverageLabelWrapper offensiveChartSummary';
	sum.textContent = 'Learned move type coverage graph';
	det.append(sum);
	let intro = buildWrapper('div', 'coverageHelpText',
		'Only level-up and TM/HM damaging move types are shown here. Each branch leads to the defending types that move type hits for 2×.');
	det.append(intro);

	const learnedMoveTypes = [...new Set(
		getCoverageCandidateMoves(mon, {
			levelup: true,
			tmhm: true,
			tutor: false,
			prevo: false,
			event: false,
		}).map(move => move.type)
	)]
		.map((typeId) => ({
			moveType: types[typeId],
			targets: Object.values(types)
				.filter((defenderType) => types[typeId].matchup[defenderType.ID] === 20)
				.sort((a, b) => a.name.localeCompare(b.name)),
		}))
		.filter((entry) => entry.moveType && entry.targets.length > 0)
		.filter(Boolean)
		.sort((a, b) => a.moveType.name.localeCompare(b.moveType.name));

	if (learnedMoveTypes.length === 0) {
		det.append(buildWrapper('div', 'coverageMoveNote', 'No learned damaging move types available.'));
		wrapper.append(det);
		return wrapper;
	}

	let scroller = buildWrapper('div', 'offensiveTypeChartScroller');
	let inner = buildWrapper('div', 'offensiveTree');
	for (const entry of learnedMoveTypes) {
		let row = buildWrapper('div', 'offensiveTreeRow');
		row.append(buildWrapperTypes('div', 'offensiveTreeMoveType', entry.moveType));

		let branch = buildWrapper('div', 'offensiveTreeBranch');
		let branchLine = buildWrapper('div', 'offensiveTreeBranchLine');
		let branchNode = buildWrapper('div', 'offensiveTreeBranchNode');
		branchNode.style.backgroundColor = entry.moveType.color;
		branch.append(branchLine, branchNode);
		row.append(branch);

		let targets = buildWrapper('div', 'offensiveTreeTargets');
		for (const defenderType of entry.targets) {
			let target = buildWrapperTypes('div', 'offensiveTreeTargetType', defenderType);
			applyHoverTooltip(target, `${entry.moveType.name} hits ${defenderType.name} super-effectively.`);
			targets.append(target);
		}
		row.append(targets);
		inner.append(row);
	}

	scroller.append(inner);
	det.append(scroller);
	wrapper.append(det);
	return wrapper;
}

function buildWrapperTypeMatchup(type, matchup) {
	let wrapper = buildWrapper('div', 'typeMatchupWrapper');
	
	wrapper.append(buildWrapperTypes('div', 'typeMatchupLabel', type));
	wrapper.append(buildWrapper('div', 'typeMatchupMultiplier x' + (matchup * 100), matchup + 'x'));
	
	return wrapper;
}

function buildWrapperCap(tag, className, ID) {
	let wrapper = buildWrapper(tag, className + 'Wrapper');
	
	let myAreas = Object.values(areas).reduce((listx, x) => listx.concat(x.areas), []).filter(x => Object.values(x).reduce((listy, y) => list.concat(Object.entries(y).filter(z => z[0].includes('wild') || z[0].includes('fixed')).map(z => z[1]).reduce((listz, z) => listz.concat(Object.values(z)), [])), []));
	
	wrapper.append(buildWrapper('div', 'infoCapLabel', 'Availability'));
	if (myAreas.length > 0) {
		for (const area of myAreas) {
			wrapper.append(buildWrapper('div', className, area.name));
		}
	}
	else {
		wrapper.append(buildWrapper('div', className, 'Unobtainable in the wild.'));
	}
	
	//wrapper.append(buildWrapper('div', 'infoCapLabel', 'Level Cap'));
	
	//if ('normal' in cap) {
	//	wrapper.append(buildWrapper('div', className, 'Available on Normal ' + caps[cap.normal].name + '.'));
	//}
	//else {
	//	wrapper.append(buildWrapper('div', className, 'Unobtainable on Normal Difficulty.'));
	//}
	//
	//if ('hardcore' in cap) {
	//	wrapper.append(buildWrapper('div', className, 'Available on Hardcore ' + caps[cap.hardcore].name + '.'));
	//}
	//else {
	//	wrapper.append(buildWrapper('div', className, 'Unobtainable on Hardcore Difficulty.'));
	//}
	
	return wrapper;
}

function buildWrapperHeldItems(tag, className, i) {
	let wrapper = buildWrapper(tag, className + 'Wrapper');
	
	if (arrayEquals(i, [0, 0])) //why must it be this way?
		return wrapper;
	wrapper.append(buildWrapper('div', 'infoItemsLabel', 'Held Items'));
	if (i[0])
		wrapper.append(buildWrapper('div', className, 'Common: ' + items[i[0]].name));
	if (i[1])
		wrapper.append(buildWrapper('div', className, 'Rare: ' + items[i[1]].name));
	
	return wrapper;
}

function buildWrapperWorldLocations(tag, className, mon) {
	let wrapper = buildWrapper(tag, className + 'Wrapper');
	const grouped = getSpeciesAcquisitionGroups(mon);
	if (!grouped.groups || grouped.groups.length === 0)
		return wrapper;

	wrapper.append(buildWrapper('div', 'infoWorldLocationsLabel', 'Locations & acquisition'));
	if (grouped.usedAncestorFallback) {
		wrapper.append(buildWrapper(
			'div',
			'infoWorldLocationsNote',
			'Using base-form acquisition data because this form does not list separate encounter data.'
		));
	}

	for (const group of grouped.groups) {
		let details = document.createElement('details');
		details.className = 'infoWorldLocationsGroup';
		if (group.key === 'wild' || group.key === 'special')
			details.open = true;

		let summary = buildWrapper('summary', 'infoWorldLocationsSummary');
		summary.append(
			buildWrapper('span', 'infoWorldLocationsSummaryLabel', group.label),
			buildWrapper('span', 'infoWorldLocationsSummaryCount', String(group.rows.length))
		);
		details.append(summary);

		let list = buildWrapper('div', 'infoWorldLocationsList');
		for (const row of group.rows) {
			let entry = buildWrapper('div', 'infoWorldLocationEntry');
			entry.append(
				buildWrapper('div', 'infoWorldLocationTitle', getLocationNameById(row.location_id, row.location_name) || row.species_name || row.species_name_raw || 'Unknown'),
				buildWrapper('div', 'infoWorldLocationMeta', formatPokemonAcquisitionMeta(row))
			);
			list.append(entry);
		}

		details.append(list);
		wrapper.append(details);
	}

	return wrapper;
}

function buildWrapperEggGroups(tag, className, e) {
	let wrapper = buildWrapper(tag, className + 'Wrapper');
	
	if (arrayEquals(e, [0, 0]))
		return wrapper;
	
	wrapper.append(buildWrapper('div', 'infoEggGroupsLabel', 'Egg Groups'));
	if (e[0])
		wrapper.append(buildWrapper('div', className, 'egg1'));//eggGroups[e[0]].name));
	if (e[1])
		wrapper.append(buildWrapper('div', className, 'egg2'));//eggGroups[e[1]].name));
	
	return wrapper;
}

function buildBackgroundColor(currentRow, mon) {
	const primaryColor = parseRgbColor(types[mon.type[0]].color);
	const secondaryColor = mon.type[1] !== undefined
		? parseRgbColor(types[mon.type[1]].color)
		: [63, 40, 40];
	const cells = Array.from(currentRow.children);
	const rowWidth = currentRow.getBoundingClientRect().width
		|| cells.reduce((sum, cell) => sum + cell.getBoundingClientRect().width, 0)
		|| 1;
	const gradient = `linear-gradient(to right, rgba(${primaryColor[0]}, ${primaryColor[1]}, ${primaryColor[2]}, 0.3), rgba(${secondaryColor[0]}, ${secondaryColor[1]}, ${secondaryColor[2]}, 0.3))`;

	currentRow.style.setProperty('--species-row-start', `rgba(${primaryColor[0]}, ${primaryColor[1]}, ${primaryColor[2]}, 0.3)`);
	currentRow.style.setProperty('--species-row-end', `rgba(${secondaryColor[0]}, ${secondaryColor[1]}, ${secondaryColor[2]}, 0.3)`);
	currentRow.style.backgroundColor = '';
	currentRow.style.backgroundImage = '';

	for (let index = 0; index < cells.length; index++) {
		const left = cells[index].offsetLeft || 0;
		cells[index].style.backgroundColor = 'transparent';
		cells[index].style.backgroundImage = gradient;
		cells[index].style.backgroundSize = `${rowWidth}px 100%`;
		cells[index].style.backgroundPosition = `-${left}px 0`;
		cells[index].style.backgroundRepeat = 'no-repeat';
	}
	return;
	
	//if (mon.type.secondary) {
	//	let gradient = [];
	//	currentRow.style.backgroundColor = types[mon.type.primary].color;
	//	gradient.push(currentRow.style.backgroundColor.substr(3).replace(')', ', 0.4)'));
	//	currentRow.style.backgroundColor = types[mon.type.secondary].color;
	//	gradient.push(currentRow.style.backgroundColor.substr(3).replace(')', ', 0.4)'));
	//	currentRow.style.backgroundColor = '';
	//	currentRow.style.backgroundImage = 'linear-gradient(to right, rgba' + gradient[0] + ', rgba' + gradient[1] + ')';
	//}
	//else {
	//	currentRow.style.backgroundColor = types[mon.type.primary].color;
	//	currentRow.style.backgroundImage = 'linear-gradient(to right, rgba' + currentRow.style.backgroundColor.substr(3).replace(')', ', 0.4)') + ', rgb(63, 40, 40, 0.4))';
	//	currentRow.style.backgroundColor = '';
	//}
}
