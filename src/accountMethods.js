const backendStatus = document.getElementById("backendStatus");
const accountSignedOut = document.getElementById("accountSignedOut");
const accountSignedIn = document.getElementById("accountSignedIn");
const accountEmail = document.getElementById("accountEmail");
const accountUsername = document.getElementById("accountUsername");
const accountMenu = document.getElementById("accountMenu");
const accountSummaryButton = document.getElementById("accountSummaryButton");
const accountDropdown = document.getElementById("accountDropdown");
const accountStats = document.getElementById("accountStats");
const accountTeamsEmpty = document.getElementById("accountTeamsEmpty");
const accountTeamsList = document.getElementById("accountTeamsList");
const newTeamNameInput = document.getElementById("newTeamNameInput");
const sharedTeamView = document.getElementById("sharedTeamView");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const authStatusMessage = document.getElementById("authStatusMessage");
const authModeSignInButton = document.getElementById("authModeSignInButton");
const authModeSignUpButton = document.getElementById("authModeSignUpButton");
const authEmailInput = document.getElementById("authEmailInput");
const authPasswordInput = document.getElementById("authPasswordInput");
const authSignUpFields = document.getElementById("authSignUpFields");
const authUsernameInput = document.getElementById("authUsernameInput");
const authDisplayNameInput = document.getElementById("authDisplayNameInput");
const authPrimaryButton = document.getElementById("authPrimaryButton");
const authModePromptText = document.getElementById("authModePromptText");
const authModePromptButton = document.getElementById("authModePromptButton");
const GUEST_TEAMS_STORAGE_KEY = "rrdex_guest_teams";
const GUEST_FAVORITES_STORAGE_KEY = "rrdex_guest_favorites";
const SPECIES_PANEL_SAVE_SECTION_STATE_KEY = "rrdex_species_panel_save_collapsed";
const TEAM_UI_STATE_STORAGE_PREFIX = "rrdex_team_ui_state";
let authMode = "signin";
let authBusy = false;
let accountMenuOpen = false;

function setProfileMenuOpen(isOpen) {
	accountMenuOpen = Boolean(isOpen);
	if (accountDropdown)
		accountDropdown.classList.toggle("hide", !accountMenuOpen);
	if (accountSummaryButton)
		accountSummaryButton.setAttribute("aria-expanded", accountMenuOpen ? "true" : "false");
}

function toggleProfileMenu(event) {
	event?.preventDefault();
	event?.stopPropagation();
	setProfileMenuOpen(!accountMenuOpen);
}

document.addEventListener("mousedown", function(event) {
	if (!accountMenuOpen)
		return;

	if (accountMenu?.contains(event.target))
		return;

	setProfileMenuOpen(false);
});

function isSpeciesPanelSaveSectionCollapsed() {
	try {
		const raw = localStorage.getItem(SPECIES_PANEL_SAVE_SECTION_STATE_KEY);
		return raw === null ? true : raw === "true";
	} catch (error) {
		return true;
	}
}

function setSpeciesPanelSaveSectionCollapsed(collapsed) {
	try {
		localStorage.setItem(SPECIES_PANEL_SAVE_SECTION_STATE_KEY, collapsed ? "true" : "false");
	} catch (error) {
		console.warn("Failed to persist species panel section state.", error);
	}
}

function normalizeUsername(value) {
	return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function toggleSpeciesPanelSaveSection() {
	setSpeciesPanelSaveSectionCollapsed(!isSpeciesPanelSaveSectionCollapsed());
	renderSpeciesPanelAccountActions(currentSpeciesPanelMon);
}

function encodeBase64Unicode(value) {
	return btoa(String.fromCharCode(...new TextEncoder().encode(value)));
}

function getAppBaseUrl() {
	return `${window.location.origin}${window.location.pathname}`;
}

function decodeBase64Unicode(value) {
	return new TextDecoder().decode(Uint8Array.from(atob(value), x => x.charCodeAt(0)));
}

function loadGuestTeamsFromStorage() {
	try {
		const raw = localStorage.getItem(GUEST_TEAMS_STORAGE_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch (error) {
		console.warn("Failed to load guest teams from localStorage.", error);
		return [];
	}
}

function persistGuestTeams() {
	try {
		localStorage.setItem(GUEST_TEAMS_STORAGE_KEY, JSON.stringify(guestTeams));
	} catch (error) {
		console.warn("Failed to persist guest teams.", error);
	}
}

function loadGuestFavoritesFromStorage() {
	try {
		const raw = localStorage.getItem(GUEST_FAVORITES_STORAGE_KEY);
		if (!raw)
			return {};

		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch (error) {
		console.warn("Failed to load guest favorites from localStorage.", error);
		return {};
	}
}

function persistGuestFavorites() {
	try {
		localStorage.setItem(GUEST_FAVORITES_STORAGE_KEY, JSON.stringify(favoriteSpecies));
	} catch (error) {
		console.warn("Failed to persist guest favorites.", error);
	}
}

function getTeamUiStateStorageKey() {
	return `${TEAM_UI_STATE_STORAGE_PREFIX}:${authSession?.user?.id || "guest"}`;
}

function loadTeamUiState() {
	activeTeamId = null;
	teamVisibilityState = {};

	try {
		const raw = localStorage.getItem(getTeamUiStateStorageKey());
		if (!raw)
			return;

		const parsed = JSON.parse(raw);
		activeTeamId = parsed?.activeTeamId || null;
		teamVisibilityState = parsed?.teamVisibilityState || {};
	} catch (error) {
		console.warn("Failed to load team UI state.", error);
	}
}

function persistTeamUiState() {
	try {
		localStorage.setItem(getTeamUiStateStorageKey(), JSON.stringify({
			activeTeamId,
			teamVisibilityState,
		}));
	} catch (error) {
		console.warn("Failed to persist team UI state.", error);
	}
}

function syncTeamsFromCurrentMode() {
	userTeams = authSession ? userTeams : guestTeams;

	const validTeamIds = new Set(userTeams.map(team => team.id));
	teamVisibilityState = Object.fromEntries(
		Object.entries(teamVisibilityState).filter(([teamId]) => validTeamIds.has(teamId))
	);

	if (!activeTeamId || !userTeams.find(x => x.id === activeTeamId))
		activeTeamId = userTeams[0]?.id ?? null;

	persistTeamUiState();
}

function buildGuestSharedTeam(team) {
	return {
		team: {
			name: team.name,
			description: team.description || null,
			visibility: "guest",
			share_slug: null,
			display_name: "Guest",
			username: "guest",
		},
		members: team.members || [],
	};
}

function attachMembersToTeams(teams, members) {
	const membersByTeamId = {};

	for (const member of members || []) {
		if (!membersByTeamId[member.team_id])
			membersByTeamId[member.team_id] = [];

		membersByTeamId[member.team_id].push({
			...member,
			moves: (member.team_member_moves || member.moves || [])
				.map(x => ({ slot: x.slot, move_id: x.move_id }))
				.sort((a, b) => a.slot - b.slot),
		});
	}

	return (teams || []).map(team => ({
		...team,
		members: (membersByTeamId[team.id] || []).sort((a, b) => a.slot - b.slot),
	}));
}

function getMemberSpecies(member) {
	return member?.species_id ? species?.[member.species_id] : null;
}

function getTeamMemberTooltipText(member, mon) {
	let segments = [];
	const displayName = member.nickname && mon?.key
		? `${member.nickname} (${mon.key})`
		: (member.nickname || mon?.key || `#${member.species_id}`);

	segments.push(displayName);

	if (member.ability_id && abilities?.[member.ability_id])
		segments.push(`Ability: ${abilities[member.ability_id].names[0]}`);

	if (member.moves?.length) {
		segments.push(`Moves: ${member.moves.map(x => movesGlobalName(x.move_id)).join(", ")}`);
	}

	return segments.join(" • ");
}

function getTeamMemberAbilityMeta(member, mon) {
	if (!member?.ability_id || !mon?.abilities || !abilities?.[member.ability_id])
		return null;

	for (const slot of [1, 2, 0]) {
		const baseAbility = mon.abilities[slot];
		if (!baseAbility || baseAbility[0] === 0)
			continue;

		const mappedAbility = getMappedAbility(baseAbility, mon.ID);
		if (mappedAbility[0] !== member.ability_id)
			continue;

		return {
			id: member.ability_id,
			name: abilities[member.ability_id].names[mappedAbility[1] || 0] || abilities[member.ability_id].names[0],
			description: abilities[member.ability_id].description,
			slot: slot,
			slotLabel: slot === 0 ? "Hidden Ability" : slot === 1 ? "Primary Ability" : "Secondary Ability",
			isHidden: slot === 0,
		};
	}

	return {
		id: member.ability_id,
		name: abilities[member.ability_id].names[0],
		description: abilities[member.ability_id].description,
		slot: null,
		slotLabel: "Selected Ability",
		isHidden: false,
	};
}

function buildTeamMemberMoveRows(member) {
	return (member.moves || [])
		.map(entry => moves?.[entry.move_id])
		.filter(Boolean);
}

function buildTeamMemberHoverCard(member, mon) {
	let card = document.createElement("div");
	card.className = "teamDexHoverCard";

	let title = document.createElement("div");
	title.className = "teamDexHoverTitle";
	title.textContent = member.nickname && mon?.key
		? `${member.nickname} (${mon.key})`
		: (member.nickname || mon?.key || `#${member.species_id}`);
	card.append(title);

	const abilityMeta = getTeamMemberAbilityMeta(member, mon);
	if (abilityMeta) {
		let abilityRow = document.createElement("div");
		abilityRow.className = "teamDexHoverAbilityRow";

		let badge = document.createElement("span");
		badge.className = `teamDexAbilityBadge${abilityMeta.isHidden ? " teamDexAbilityBadgeHidden" : ""}`;
		badge.textContent = abilityMeta.isHidden ? "HA" : abilityMeta.slot === 2 ? "A2" : "A1";

		let abilityText = document.createElement("div");
		abilityText.className = "teamDexHoverAbilityText";
		abilityText.textContent = `${abilityMeta.slotLabel}: ${abilityMeta.name}`;
		if (abilityMeta.description)
			abilityText.title = abilityMeta.description;

		abilityRow.append(badge, abilityText);
		card.append(abilityRow);
	}

	let moveList = document.createElement("div");
	moveList.className = "teamDexHoverMoves";
	for (const move of buildTeamMemberMoveRows(member)) {
		let row = document.createElement("div");
		row.className = "teamDexHoverMoveRow";

		let stats = document.createElement("div");
		stats.className = "teamDexHoverMoveStats";

		let bp = document.createElement("span");
		bp.className = "teamDexHoverMoveStat teamDexHoverMoveStatBp";
		bp.textContent = `BP ${move.power || "-"}`;

		let pp = document.createElement("span");
		pp.className = "teamDexHoverMoveStat teamDexHoverMoveStatPp";
		pp.textContent = `PP ${move.pp || "-"}`;

		stats.append(bp, pp);

		row.append(
			buildWrapperTypes("div", "teamDexHoverMoveType", types[move.type]),
			buildWrapperSprite("div", "teamDexHoverMoveSplit", getSprite(splits[move.split])),
			buildWrapper("div", "teamDexHoverMoveName", move.name),
			stats,
		);

		moveList.append(row);
	}

	if (!moveList.children.length) {
		let emptyMoves = document.createElement("div");
		emptyMoves.className = "teamDexHoverEmpty";
		emptyMoves.textContent = "No moves saved.";
		moveList.append(emptyMoves);
	}

	card.append(moveList);
	return card;
}

function buildTeamMemberEditor(mon, member, teamId, slot) {
	let wrapper = document.createElement("div");
	wrapper.className = "teamMemberDetailEditor";

	let abilitySelect = document.createElement("select");
	abilitySelect.id = "teamMemberDetailAbilitySelect";
	abilitySelect.className = "accountSelect";
	for (const ability of getAvailableAbilityEntries(mon)) {
		let option = document.createElement("option");
		option.value = ability.abilityId;
		option.textContent = ability.label;
		option.selected = Number(member.ability_id) === ability.abilityId;
		abilitySelect.append(option);
	}

	let moveSelectors = document.createElement("div");
	moveSelectors.className = "teamMemberDetailEditorMoves";
	let currentMoves = (member.moves || []).map(x => x.move_id);
	let moveOptions = getDisplayLearnsetOptions(mon);

	for (let moveSlot = 1; moveSlot <= 4; moveSlot++) {
		let moveSelect = document.createElement("select");
		moveSelect.id = `teamMemberDetailMoveSelect${moveSlot}`;
		moveSelect.className = "accountSelect";

		let emptyOption = document.createElement("option");
		emptyOption.value = "";
		emptyOption.textContent = `Move ${moveSlot}`;
		moveSelect.append(emptyOption);

		for (const moveEntry of moveOptions) {
			let option = document.createElement("option");
			option.value = moveEntry.id;
			option.textContent = moveEntry.name;
			option.selected = currentMoves[moveSlot - 1] === moveEntry.id;
			moveSelect.append(option);
		}

		moveSelectors.append(moveSelect);
	}

	let actions = document.createElement("div");
	actions.className = "teamMemberDetailEditorActions";

	let updateButton = document.createElement("button");
	updateButton.textContent = "Update Moves / Ability";
	updateButton.onclick = function() {
		updateTeamMemberFromDetail(mon, teamId, slot, member);
	};

	actions.append(updateButton);
	wrapper.append(abilitySelect, moveSelectors, actions);
	return wrapper;
}

function buildTeamMemberDetailSection(member, mon, slot, options = {}) {
	const teamId = options.teamId || null;
	const editable = Boolean(options.editable);
	let wrapper = document.createElement("div");
	wrapper.className = "teamMemberDetailSection";

	let heading = document.createElement("div");
	heading.className = "teamMemberDetailHeading";
	heading.textContent = `Team Slot ${slot}`;
	wrapper.append(heading);

	let name = document.createElement("div");
	name.className = "teamMemberDetailName";
	name.textContent = member.nickname || mon?.key || `#${member.species_id}`;
	wrapper.append(name);

	if (member.nickname && mon?.key) {
		let speciesName = document.createElement("div");
		speciesName.className = "teamMemberDetailSpecies";
		speciesName.textContent = mon.key;
		wrapper.append(speciesName);
	}

	const abilityMeta = getTeamMemberAbilityMeta(member, mon);
	if (abilityMeta) {
		let abilityRow = document.createElement("div");
		abilityRow.className = "teamMemberDetailAbility";

		let badge = document.createElement("span");
		badge.className = `teamDexAbilityBadge${abilityMeta.isHidden ? " teamDexAbilityBadgeHidden" : ""}`;
		badge.textContent = abilityMeta.isHidden ? "HA" : abilityMeta.slot === 2 ? "A2" : "A1";

		let text = document.createElement("span");
		text.textContent = `${abilityMeta.slotLabel}: ${abilityMeta.name}`;
		abilityRow.append(badge, text);
		wrapper.append(abilityRow);
	}

	let movesGrid = document.createElement("div");
	movesGrid.className = "teamMemberDetailMoves";
	for (const move of buildTeamMemberMoveRows(member)) {
		let row = document.createElement("div");
		row.className = "teamMemberDetailMove";

		let stats = document.createElement("div");
		stats.className = "teamMemberDetailMoveStats";

		let bp = document.createElement("span");
		bp.className = "teamMemberDetailMoveStat teamMemberDetailMoveStatBp";
		bp.textContent = `BP ${move.power || "-"}`;

		let pp = document.createElement("span");
		pp.className = "teamMemberDetailMoveStat teamMemberDetailMoveStatPp";
		pp.textContent = `PP ${move.pp || "-"}`;

		stats.append(bp, pp);
		row.append(
			buildWrapperTypes("div", "teamDexHoverMoveType", types[move.type]),
			buildWrapperSprite("div", "teamDexHoverMoveSplit", getSprite(splits[move.split])),
			buildWrapper("div", "teamMemberDetailMoveName", move.name),
			stats,
		);
		movesGrid.append(row);
	}

	if (!movesGrid.children.length)
		movesGrid.append(buildWrapper("div", "teamDexHoverEmpty", "No moves saved."));

	wrapper.append(movesGrid);

	if (editable && teamId)
		wrapper.append(buildTeamMemberEditor(mon, member, teamId, slot));

	return wrapper;
}

function displayTeamMemberPanel(member, slot, options = {}) {
	const mon = getMemberSpecies(member);
	if (!mon)
		return;

	displaySpeciesPanel(mon);

	const infoDisplay = document.getElementById("speciesPanelInfoDisplay");
	const accountActionsHost = document.getElementById("speciesPanelAccountActionsHost");
	if (!infoDisplay || !accountActionsHost)
		return;

	const detailSection = buildTeamMemberDetailSection(member, mon, slot, options);
	infoDisplay.insertBefore(detailSection, accountActionsHost);
}

function buildTeamMemberDexSlot(member, slot, options = {}) {
	const compact = Boolean(options.compact);
	const summaryOnly = Boolean(options.summaryOnly);
	let wrapper = document.createElement("div");
	wrapper.className = `teamDexSlot${compact ? " teamDexSlotCompact" : ""}${summaryOnly ? " teamDexSlotSummary" : ""}`;

	let slotLabel = document.createElement("div");
	slotLabel.className = "teamDexSlotNumber";
	slotLabel.textContent = `${slot}`;
	wrapper.append(slotLabel);

	if (!member) {
		let empty = document.createElement("div");
		empty.className = "teamDexSlotEmpty";
		empty.textContent = "Empty";
		wrapper.append(empty);
		return wrapper;
	}

	const mon = getMemberSpecies(member);
	const sprite = document.createElement("img");
	sprite.className = "teamDexSlotSprite";
	sprite.src = getSprite(member.species_id || 0);
	sprite.alt = mon?.key || `Species ${member.species_id}`;

	if (summaryOnly) {
		wrapper.classList.add("teamDexSlotSummaryFilled");
		wrapper.setAttribute("tabindex", "0");
		wrapper.append(buildTeamMemberHoverCard(member, mon));
		wrapper.onclick = function(event) {
			event.stopPropagation();
			displayTeamMemberPanel(member, slot, options);
		};
		wrapper.append(sprite);
		return wrapper;
	}

	let info = document.createElement("div");
	info.className = "teamDexSlotInfo";

	let name = document.createElement("div");
	name.className = "teamDexSlotName";
	name.textContent = member.nickname || mon?.key || `#${member.species_id}`;
	info.append(name);

	if (member.nickname && mon?.key) {
		let speciesName = document.createElement("div");
		speciesName.className = "teamDexSlotSpecies";
		speciesName.textContent = mon.key;
		info.append(speciesName);
	}

	if (mon) {
		info.append(buildWrapperTypes("div", "teamDexSlotTypes", types[mon.type[0]], types[mon.type[1]]));
	}

	if (!compact && member.moves?.length) {
		let moves = document.createElement("div");
		moves.className = "teamDexSlotMoves";
		moves.textContent = member.moves
			.map(x => movesGlobalName(x.move_id))
			.join(" • ");
		info.append(moves);
	}

	wrapper.append(sprite, info);
	return wrapper;
}

function movesGlobalName(moveId) {
	return moves?.[moveId]?.name || `#${moveId}`;
}

function buildTeamDexRoster(team, options = {}) {
	const compact = Boolean(options.compact);
	const summaryOnly = Boolean(options.summaryOnly);
	let roster = document.createElement("div");
	roster.className = `teamDexRoster${compact ? " teamDexRosterCompact" : ""}${summaryOnly ? " teamDexRosterSummary" : ""}`;

	const membersBySlot = new Map((team.members || []).map(member => [member.slot, member]));
	for (let slot = 1; slot <= 6; slot++)
		roster.append(buildTeamMemberDexSlot(membersBySlot.get(slot), slot, {
			compact,
			summaryOnly,
			teamId: team.id || null,
			editable: Boolean(options.editable),
		}));

	return roster;
}

function isTeamExpanded(teamId, defaultValue = false) {
	if (!(teamId in teamVisibilityState))
		teamVisibilityState[teamId] = defaultValue;

	return teamVisibilityState[teamId];
}

function toggleTeamVisibility(teamId) {
	teamVisibilityState[teamId] = !isTeamExpanded(teamId);
	persistTeamUiState();
	renderAccountState();
}

function createGuestTeam(name) {
	const team = {
		id: `guest_${Date.now()}`,
		name: name,
		description: null,
		source: "guest",
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		members: [],
	};

	guestTeams = [team].concat(guestTeams);
	persistGuestTeams();
	userTeams = guestTeams;
	activeTeamId = team.id;
	return team;
}

function updateGuestTeam(teamId, updater) {
	guestTeams = guestTeams.map(team => team.id === teamId ? updater(team) : team);
	persistGuestTeams();
	userTeams = guestTeams;
}

function getTeamById(teamId) {
	return userTeams.find(team => team.id === teamId) || null;
}

function getFirstEmptyTeamSlot(teamId) {
	const team = getTeamById(teamId);
	if (!team)
		return 1;

	const occupiedSlots = new Set((team.members || []).map(member => Number(member.slot)));
	for (let slot = 1; slot <= 6; slot++) {
		if (!occupiedSlots.has(slot))
			return slot;
	}

	return 1;
}

function deleteGuestTeam(teamId) {
	guestTeams = guestTeams.filter(team => team.id !== teamId);
	persistGuestTeams();
	userTeams = guestTeams;
}

function setAuthMode(mode = "signin") {
	authMode = mode === "signup" ? "signup" : "signin";

	if (authTitle)
		authTitle.textContent = authMode === "signup" ? "Sign Up" : "Sign In";

	if (authSubtitle) {
		authSubtitle.textContent = authMode === "signup"
			? "Create an account to sync teams, favorites, and profile data."
			: "Use your email and password to access your saved teams and favorites.";
	}

	if (authSignUpFields)
		authSignUpFields.className = authMode === "signup" ? "" : "hide";

	if (authModeSignInButton)
		authModeSignInButton.classList.toggle("active", authMode === "signin");

	if (authModeSignUpButton)
		authModeSignUpButton.classList.toggle("active", authMode === "signup");

	if (authPrimaryButton)
		authPrimaryButton.textContent = authBusy
			? (authMode === "signup" ? "Creating Account..." : "Signing In...")
			: (authMode === "signup" ? "✦ Create Account" : "↪ Sign In");

	if (authModePromptText)
		authModePromptText.textContent = authMode === "signup" ? "Already have an account?" : "Need an account?";

	if (authModePromptButton) {
		authModePromptButton.textContent = authMode === "signup" ? "Sign In" : "Sign Up";
		authModePromptButton.onclick = function() {
			setAuthMode(authMode === "signup" ? "signin" : "signup");
		};
	}

	if (authPasswordInput)
		authPasswordInput.autocomplete = authMode === "signup" ? "new-password" : "current-password";
}

function displayAuthModal(mode = "signin") {
	authPasswordInput.value = "";
	setAuthStatus(
		mode === "signup"
			? "Pick a unique username and create your account."
			: "Sign in with your email and password.",
		"muted"
	);
	setAuthMode(mode);
	$('#authModal').modal('show');
}

function submitAuthForm() {
	if (authMode === "signup")
		return signUpWithPassword();

	return signInWithPassword();
}

function setBackendStatus(message, tone = "muted") {
	if (!backendStatus)
		return;

	backendStatus.textContent = message;
	backendStatus.dataset.tone = tone;
}

function setAuthStatus(message, tone = "muted") {
	if (!authStatusMessage)
		return;

	authStatusMessage.textContent = message;
	authStatusMessage.dataset.tone = tone;
}

function setAuthBusy(isBusy) {
	authBusy = Boolean(isBusy);

	for (const element of [
		authModeSignInButton,
		authModeSignUpButton,
		authEmailInput,
		authPasswordInput,
		authUsernameInput,
		authDisplayNameInput,
		authPrimaryButton,
		authModePromptButton,
	]) {
		if (element)
			element.disabled = authBusy;
	}

	setAuthMode(authMode);
}

function clearAccountStatusTimeout() {
	if (accountStatusTimeout) {
		clearTimeout(accountStatusTimeout);
		accountStatusTimeout = null;
	}
}

function flashBackendStatus(message, tone = "success", duration = 3500) {
	clearAccountStatusTimeout();
	setBackendStatus(message, tone);
	accountStatusTimeout = setTimeout(() => renderBackendStatus(), duration);
}

function renderBackendStatus() {
	if (!isSupabaseConfigured()) {
		setBackendStatus("", "muted");
		setAuthStatus("Set a Supabase URL and anon key to enable cloud accounts, favorites, and team sync.", "warn");
		return;
	}

	if (!backendEnabled) {
		setBackendStatus("", "muted");
		setAuthStatus("Supabase is configured. Open the modal to sign in once the client initializes.", "muted");
		return;
	}

	if (!authSession) {
		setBackendStatus("", "muted");
		setAuthStatus("Create an account or sign in with email and password.", "muted");
		return;
	}

	setBackendStatus("", "muted");
	setAuthStatus("Signed in successfully.", "success");
}

function favoriteMapFromRows(rows) {
	let map = {};
	for (const row of rows)
		map[row.species_id] = row;
	return map;
}

async function initBackend() {
	guestTeams = loadGuestTeamsFromStorage();
	favoriteSpecies = loadGuestFavoritesFromStorage();
	loadTeamUiState();
	userTeams = guestTeams;
	syncTeamsFromCurrentMode();
	renderAccountState();
	renderSpeciesPanelAccountActions(currentSpeciesPanelMon);
	renderBackendStatus();

	await loadSharedTeamFromUrl();
	await waitForSupabaseConfig();

	if (!isSupabaseConfigured())
		return;

	const client = initBackendClient();
	if (!client)
		return;

	backendEnabled = true;

	const { data, error } = await client.auth.getSession();
	if (error)
		console.error("Failed to fetch auth session.", error);
	authSession = data?.session ?? null;
	loadTeamUiState();

	client.auth.onAuthStateChange(async function(_event, session) {
		authSession = session;
		loadTeamUiState();
		await loadAccountData();
	});

	await loadAccountData();
}

async function loadAccountData() {
	if (!backendEnabled)
		return;

	if (!authSession) {
		currentProfile = null;
		guestTeams = loadGuestTeamsFromStorage();
		userTeams = guestTeams;
		favoriteSpecies = loadGuestFavoritesFromStorage();
		syncTeamsFromCurrentMode();
		renderAccountState();
		renderSpeciesPanelAccountActions(currentSpeciesPanelMon);
		renderBackendStatus();
		refreshFavoriteUi();
		return;
	}

	const client = getSupabaseClient();
	const userId = authSession.user.id;

	const [profileResult, teamsResult, favoritesResult] = await Promise.all([
		client.from("profiles").select("*").eq("id", userId).maybeSingle(),
		client.from("teams").select("*").order("updated_at", { ascending: false }),
		client.from("favorite_species").select("*").order("created_at", { ascending: false }),
	]);

	const teamMembersResult = await client
		.from("team_members")
		.select("id, team_id, slot, species_id, nickname, ability_id, item_id, notes, team_member_moves(slot, move_id)")
		.order("slot", { ascending: true });

	if (profileResult.error)
		console.error("Failed to load profile.", profileResult.error);
	if (teamsResult.error)
		console.error("Failed to load teams.", teamsResult.error);
	if (favoritesResult.error)
		console.error("Failed to load favorites.", favoritesResult.error);
	if (teamMembersResult.error)
		console.error("Failed to load team members.", teamMembersResult.error);

	currentProfile = profileResult.data ?? null;
	if (!currentProfile)
		currentProfile = await ensureProfileRow();
	userTeams = attachMembersToTeams(teamsResult.data ?? [], teamMembersResult.data ?? []);
	favoriteSpecies = favoriteMapFromRows(favoritesResult.data ?? []);
	syncTeamsFromCurrentMode();

	renderAccountState();
	renderSpeciesPanelAccountActions(currentSpeciesPanelMon);
	renderBackendStatus();
	refreshFavoriteUi();
}

async function ensureProfileRow() {
	if (!authSession)
		return null;

	const email = authSession.user.email || "";
	const defaultUsername = normalizeUsername(
		authSession.user.user_metadata?.username
		|| email.split("@")[0]
		|| "trainer"
	).slice(0, 24);

	const { data, error } = await getSupabaseClient()
		.from("profiles")
		.upsert({
			id: authSession.user.id,
			username: defaultUsername || "trainer",
			display_name: authSession.user.user_metadata?.display_name || authSession.user.user_metadata?.full_name || defaultUsername || "trainer",
		}, {
			onConflict: "id",
		})
		.select("*")
		.single();

	if (error) {
		console.error("Failed to ensure profile row exists.", error);
		return null;
	}

	return data;
}

function renderAccountState() {
	const isSignedIn = Boolean(authSession && currentProfile);

	accountSignedOut.classList.toggle("hide", isSignedIn);
	accountSignedIn.classList.toggle("hide", !isSignedIn);
	if (!isSignedIn)
		setProfileMenuOpen(false);

	if (!isSignedIn) {
		accountEmail.textContent = "";
		accountUsername.textContent = "";
		accountStats.textContent = `${userTeams.length} local team${userTeams.length === 1 ? "" : "s"} • ${Object.keys(favoriteSpecies).length} local favorite${Object.keys(favoriteSpecies).length === 1 ? "" : "s"}`;
		accountTeamsList.innerHTML = "";
		accountTeamsEmpty.classList.toggle("hide", userTeams.length !== 0);
		for (const team of userTeams)
			accountTeamsList.append(buildTeamCard(team));
		return;
	}

	accountUsername.textContent = currentProfile.display_name
		? `${currentProfile.display_name} (@${currentProfile.username})`
		: `@${currentProfile.username}`;
	accountEmail.textContent = authSession.user.email || "";
	accountStats.textContent = `${userTeams.length} team${userTeams.length === 1 ? "" : "s"} saved • ${Object.keys(favoriteSpecies).length} favorite${Object.keys(favoriteSpecies).length === 1 ? "" : "s"}`;

	accountTeamsList.innerHTML = "";
	accountTeamsEmpty.classList.toggle("hide", userTeams.length !== 0);

	for (const team of userTeams)
		accountTeamsList.append(buildTeamCard(team));
}

function buildTeamCard(team) {
	let wrapper = document.createElement("div");
	wrapper.className = `accountTeamCard${team.id === activeTeamId ? " accountTeamCardActive" : ""}`;
	const expanded = isTeamExpanded(team.id, team.id === activeTeamId);

	let title = document.createElement("div");
	title.className = "accountTeamTitle";
	title.textContent = team.name;

	let meta = document.createElement("div");
	meta.className = "accountTeamMeta";
	meta.textContent = team.source === "guest" ? "Guest team • shareable by URL" : `Visibility: ${team.visibility}`;

	let actions = document.createElement("div");
	actions.className = "accountTeamActions";

	let useButton = document.createElement("button");
	useButton.className = `teamActionButton ${team.id === activeTeamId ? "teamActionActive" : "teamActionUse"}`;
	useButton.textContent = team.id === activeTeamId ? "Active Team" : "Use In Builder";
	useButton.disabled = team.id === activeTeamId;
	useButton.onclick = function() {
		activeTeamId = team.id;
		persistTeamUiState();
		renderAccountState();
		renderSpeciesPanelAccountActions(currentSpeciesPanelMon);
	};

	let deleteButton = document.createElement("button");
	deleteButton.className = "teamActionButton teamActionDelete";
	deleteButton.textContent = "Delete";
	deleteButton.onclick = function() {
		deleteTeam(team.id);
	};

	let toggleButton = document.createElement("button");
	toggleButton.className = "teamActionButton teamActionToggle";
	toggleButton.dataset.expanded = expanded ? "true" : "false";
	toggleButton.textContent = expanded ? "Hide Team" : "Show Team";
	toggleButton.onclick = function() {
		toggleTeamVisibility(team.id);
	};

	actions.append(toggleButton, useButton);
	if (team.source === "guest" || team.visibility !== "private") {
		let shareButton = document.createElement("button");
		shareButton.className = "teamActionButton teamActionShare";
		shareButton.textContent = "Share";
		shareButton.onclick = function() {
			copyTeamShareUrl(team, shareButton);
		};
		actions.append(shareButton);
	}
	if (team.source !== "guest") {
		let visibilitySelect = document.createElement("select");
		visibilitySelect.className = "accountSelect";
		for (const visibility of ["private", "unlisted", "public"]) {
			let option = document.createElement("option");
			option.value = visibility;
			option.textContent = visibility;
			option.selected = team.visibility === visibility;
			visibilitySelect.append(option);
		}
		visibilitySelect.onchange = function() {
			updateTeamVisibility(team.id, visibilitySelect.value);
		};
		actions.append(visibilitySelect);
	}
	actions.append(deleteButton);
	wrapper.append(title, meta, actions);

	let roster = buildTeamDexRoster(team, { summaryOnly: true, editable: true });
	roster.classList.toggle("hide", !expanded);
	wrapper.append(roster);

	return wrapper;
}

function getTeamShareUrl(team) {
	if (team.source === "guest") {
		return `${getAppBaseUrl()}?guestTeam=${encodeURIComponent(encodeBase64Unicode(JSON.stringify(buildGuestSharedTeam(team))))}`;
	}

	return `${getAppBaseUrl()}?team=${encodeURIComponent(team.share_slug)}`;
}

async function upsertTeamMemberSelection(teamId, slot, mon, nickname, abilityId, moveIds) {
	const uniqueMoveIds = Array.from(new Set((moveIds || []).filter(Boolean))).slice(0, 4);

	if (!authSession) {
		updateGuestTeam(teamId, function(team) {
			let members = (team.members || []).filter(x => x.slot !== slot);
			members.push({
				id: `${teamId}_${slot}`,
				slot: slot,
				species_id: mon.ID,
				nickname: nickname,
				ability_id: abilityId,
				item_id: null,
				notes: null,
				moves: uniqueMoveIds.map((moveId, index) => ({
					slot: index + 1,
					move_id: moveId,
				})),
			});
			members.sort((a, b) => a.slot - b.slot);
			return {
				...team,
				updated_at: new Date().toISOString(),
				members: members,
			};
		});

		activeTeamId = teamId;
		renderAccountState();
		return { ok: true, mode: "guest" };
	}

	const client = getSupabaseClient();

	const { data: member, error: memberError } = await client
		.from("team_members")
		.upsert({
			team_id: teamId,
			slot: slot,
			species_id: mon.ID,
			nickname: nickname,
			ability_id: abilityId,
		}, {
			onConflict: "team_id,slot",
		})
		.select("*")
		.single();

	if (memberError)
		return { ok: false, error: memberError };

	const deleteMovesResult = await client
		.from("team_member_moves")
		.delete()
		.eq("team_member_id", member.id);

	if (deleteMovesResult.error)
		return { ok: false, error: deleteMovesResult.error };

	if (uniqueMoveIds.length > 0) {
		const moveRows = uniqueMoveIds.map((moveId, index) => ({
			team_member_id: member.id,
			slot: index + 1,
			move_id: moveId,
		}));

		const insertMovesResult = await client
			.from("team_member_moves")
			.insert(moveRows);

		if (insertMovesResult.error)
			return { ok: false, error: insertMovesResult.error };
	}

	activeTeamId = teamId;
	await loadAccountData();
	return { ok: true, mode: "cloud" };
}

async function copyTextToClipboard(value) {
	if (navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(value);
		return true;
	}

	let textarea = document.createElement("textarea");
	textarea.value = value;
	textarea.setAttribute("readonly", "readonly");
	textarea.style.position = "fixed";
	textarea.style.opacity = "0";
	document.body.append(textarea);
	textarea.select();

	try {
		return document.execCommand("copy");
	} finally {
		textarea.remove();
	}
}

async function copyTeamShareUrl(team, button) {
	try {
		const copied = await copyTextToClipboard(getTeamShareUrl(team));
		if (!copied)
			throw new Error("Copy failed.");

		const previousLabel = button.textContent;
		button.textContent = "Copied";
		window.setTimeout(function() {
			button.textContent = previousLabel;
		}, 1200);
		flashBackendStatus("Share link copied.", "success");
	} catch (error) {
		console.error("Failed to copy team share URL.", error);
		flashBackendStatus("Could not copy the share link.", "error");
	}
}

async function signInWithPassword() {
	if (!backendEnabled) {
		setAuthStatus("Configure Supabase first.", "warn");
		return;
	}

	const email = authEmailInput.value.trim();
	const password = authPasswordInput.value;

	if (!email || !password) {
		setAuthStatus("Email and password are required.", "warn");
		return;
	}

	setAuthBusy(true);
	const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
	setAuthBusy(false);
	if (error) {
		setAuthStatus(error.message, "error");
		return;
	}

	setAuthStatus("Signed in successfully.", "success");
	$('#authModal').modal('hide');
}

async function isUsernameAvailable(username) {
	const { data, error } = await getSupabaseClient().rpc("is_username_available", {
		candidate_username: username,
	});

	if (error) {
		console.error("Failed to validate username.", error);
		return null;
	}

	return Boolean(data);
}

async function signUpWithPassword() {
	if (!backendEnabled) {
		setAuthStatus("Configure Supabase first.", "warn");
		return;
	}

	const email = authEmailInput.value.trim();
	const password = authPasswordInput.value;
	const username = normalizeUsername(authUsernameInput.value);
	const displayName = authDisplayNameInput.value.trim();
	authUsernameInput.value = username;

	if (!email || !password || !username) {
		setAuthStatus("Email, password, and username are required.", "warn");
		return;
	}

	if (username.length < 3 || username.length > 24) {
		setAuthStatus("Username must be 3-24 characters.", "warn");
		return;
	}

	if (!/^[a-z0-9_]+$/.test(username)) {
		setAuthStatus("Username can only use lowercase letters, numbers, and underscores.", "warn");
		return;
	}

	if (password.length < 6) {
		setAuthStatus("Password must be at least 6 characters.", "warn");
		return;
	}

	setAuthStatus("Checking username availability...", "muted");
	setAuthBusy(true);
	const available = await isUsernameAvailable(username);
	if (available === false) {
		setAuthBusy(false);
		setAuthStatus("That username is already taken. Choose a different one.", "error");
		return;
	}

	const { data, error } = await getSupabaseClient().auth.signUp({
		email: email,
		password: password,
		options: {
			emailRedirectTo: getAppBaseUrl(),
			data: {
				username: username,
				display_name: displayName || username,
			},
		},
	});
	setAuthBusy(false);

	if (error) {
		let message = error.message;
		if (/database error saving new user/i.test(message))
			message = "Could not create the account. The username may already be taken.";
		setAuthStatus(message, "error");
		return;
	}

	if (data?.session) {
		setAuthStatus("Account created and signed in.", "success");
		$('#authModal').modal('hide');
		return;
	}

	setAuthStatus("Account created. Confirm your email if required, then sign in.", "success");
	setAuthMode("signin");
}

async function signOutCurrentUser() {
	if (!backendEnabled)
		return;

	setProfileMenuOpen(false);
	const { error } = await getSupabaseClient().auth.signOut();
	if (error) {
		flashBackendStatus(error.message, "error");
		return;
	}

	flashBackendStatus("Signed out.", "success");
}

async function refreshAccountData() {
	setProfileMenuOpen(false);
	if (!authSession) {
		guestTeams = loadGuestTeamsFromStorage();
		userTeams = guestTeams;
		syncTeamsFromCurrentMode();
		renderAccountState();
		renderSpeciesPanelAccountActions(currentSpeciesPanelMon);
		return;
	}

	await loadAccountData();
}

async function createTeamFromInput() {
	const name = newTeamNameInput.value.trim();
	if (!name) {
		flashBackendStatus("Enter a team name first.", "warn");
		return;
	}

	if (!authSession) {
		createGuestTeam(name);
		newTeamNameInput.value = "";
		renderAccountState();
		renderSpeciesPanelAccountActions(currentSpeciesPanelMon);
		flashBackendStatus(`Created local team "${name}".`, "success");
		return;
	}

	const { data, error } = await getSupabaseClient()
		.from("teams")
		.insert({
			owner_id: authSession.user.id,
			name: name,
			visibility: "private",
		})
		.select("*")
		.single();

	if (error) {
		flashBackendStatus(error.message, "error");
		return;
	}

	newTeamNameInput.value = "";
	activeTeamId = data.id;
	await loadAccountData();
	flashBackendStatus(`Created team "${data.name}".`, "success");
}

async function updateTeamVisibility(teamId, visibility) {
	let team = userTeams.find(x => x.id === teamId);
	if (!team)
		return;

	const payload = {
		visibility: visibility,
		published_at: visibility === "private" ? null : (team.published_at || new Date().toISOString()),
	};

	const { error } = await getSupabaseClient()
		.from("teams")
		.update(payload)
		.eq("id", teamId);

	if (error) {
		flashBackendStatus(error.message, "error");
		return;
	}

	await loadAccountData();
	flashBackendStatus("Team visibility updated.", "success");
}

async function deleteTeam(teamId) {
	if (!window.confirm("Delete this team?"))
		return;

	if (!authSession) {
		deleteGuestTeam(teamId);
		if (activeTeamId === teamId)
			activeTeamId = null;
		syncTeamsFromCurrentMode();
		renderAccountState();
		renderSpeciesPanelAccountActions(currentSpeciesPanelMon);
		flashBackendStatus("Local team deleted.", "success");
		return;
	}

	const { error } = await getSupabaseClient()
		.from("teams")
		.delete()
		.eq("id", teamId);

	if (error) {
		flashBackendStatus(error.message, "error");
		return;
	}

	if (activeTeamId === teamId)
		activeTeamId = null;

	await loadAccountData();
	flashBackendStatus("Team deleted.", "success");
}

function isSpeciesFavorited(speciesId) {
	return Boolean(favoriteSpecies[speciesId]);
}

function refreshFavoriteUi() {
	if (typeof refreshSpeciesResults === "function")
		refreshSpeciesResults();

	if (currentSpeciesPanelMon && document.getElementById("speciesModal")?.classList.contains("show"))
		displaySpeciesPanel(currentSpeciesPanelMon);
}

function getFavoriteDefaultVisibility() {
	return currentProfile?.favorites_are_public ? "public" : "private";
}

async function toggleFavoriteSpeciesFromStar(speciesId) {
	await toggleFavoriteSpecies(speciesId, favoriteSpecies[speciesId]?.visibility || getFavoriteDefaultVisibility());
}

async function toggleFavoriteSpecies(speciesId, visibility) {
	if (!authSession) {
		if (favoriteSpecies[speciesId]) {
			delete favoriteSpecies[speciesId];
			persistGuestFavorites();
			renderAccountState();
			renderSpeciesPanelAccountActions(currentSpeciesPanelMon);
			refreshFavoriteUi();
			flashBackendStatus("Favorite removed locally.", "success");
			return;
		}

		favoriteSpecies[speciesId] = {
			species_id: speciesId,
			visibility: "private",
			source: "guest",
		};
		persistGuestFavorites();
		renderAccountState();
		renderSpeciesPanelAccountActions(currentSpeciesPanelMon);
		refreshFavoriteUi();
		flashBackendStatus("Favorite saved locally.", "success");
		return;
	}

	const existing = favoriteSpecies[speciesId];
	if (existing) {
		const { error } = await getSupabaseClient()
			.from("favorite_species")
			.delete()
			.eq("user_id", authSession.user.id)
			.eq("species_id", speciesId);

		if (error) {
			flashBackendStatus(error.message, "error");
			return;
		}

		flashBackendStatus("Favorite removed.", "success");
	} else {
		const { error } = await getSupabaseClient()
			.from("favorite_species")
			.upsert({
				user_id: authSession.user.id,
				species_id: speciesId,
				visibility: visibility,
			}, {
				onConflict: "user_id,species_id",
			});

		if (error) {
			flashBackendStatus(error.message, "error");
			return;
		}

		flashBackendStatus("Favorite saved.", "success");
	}

	await loadAccountData();
	refreshFavoriteUi();
}

function buildSpeciesPanelAccountSection(mon) {
	let wrapper = document.createElement("div");
	wrapper.className = "infoAccountActions";

	const collapsed = isSpeciesPanelSaveSectionCollapsed();

	let toggleButton = document.createElement("button");
	toggleButton.type = "button";
	toggleButton.className = "infoAccountActionsToggle";
	toggleButton.setAttribute("aria-expanded", collapsed ? "false" : "true");
	toggleButton.onclick = toggleSpeciesPanelSaveSection;

	let title = document.createElement("div");
	title.className = "infoAccountActionsTitle";
	title.textContent = "Save To Team";

	let chevron = document.createElement("div");
	chevron.className = `infoAccountActionsChevron${collapsed ? "" : " infoAccountActionsChevronOpen"}`;
	chevron.textContent = collapsed ? "▸" : "▾";

	toggleButton.append(title, chevron);
	wrapper.append(toggleButton);

	if (collapsed)
		return wrapper;

	if (!authSession) {
		let message = document.createElement("div");
		message.className = "infoAccountActionsMessage";
		message.textContent = "Guest teams and favorites work locally. Sign in if you want cloud sync and public favorites.";
		wrapper.append(message);
	}

	let favoriteRow = document.createElement("div");
	favoriteRow.className = "infoAccountRow";

	let favoriteButton = document.createElement("button");
	favoriteButton.textContent = isSpeciesFavorited(mon.ID) ? "Remove Favorite" : "Add Favorite";
	favoriteButton.onclick = function() {
		let visibilitySelect = document.getElementById("favoriteVisibilitySelect");
		toggleFavoriteSpecies(mon.ID, visibilitySelect?.value || "private");
	};
	favoriteRow.append(favoriteButton);

	if (authSession) {
		let favoriteVisibilitySelect = document.createElement("select");
		favoriteVisibilitySelect.id = "favoriteVisibilitySelect";
		favoriteVisibilitySelect.className = "accountSelect";
		for (const visibility of ["private", "public"]) {
			let option = document.createElement("option");
			option.value = visibility;
			option.textContent = visibility;
			option.selected = favoriteSpecies[mon.ID]?.visibility === visibility
				|| (!favoriteSpecies[mon.ID] && currentProfile?.favorites_are_public === (visibility === "public"));
			favoriteVisibilitySelect.append(option);
		}

		favoriteRow.append(favoriteVisibilitySelect);
	}

	wrapper.append(favoriteRow);

	let teamRow = document.createElement("div");
	teamRow.className = "infoAccountTeamBuilder";

	if (userTeams.length === 0) {
		let empty = document.createElement("div");
		empty.className = "infoAccountActionsMessage";
		empty.textContent = "Create a team first, then come back to save this Pokemon into a slot.";
		teamRow.append(empty);
		wrapper.append(teamRow);
		return wrapper;
	}

	let nicknameInput = document.createElement("input");
	nicknameInput.id = "teamMemberNicknameInput";
	nicknameInput.maxLength = 24;
	nicknameInput.placeholder = "Nickname (optional)";

	let teamSelect = document.createElement("select");
	teamSelect.id = "speciesTeamSelect";
	teamSelect.className = "accountSelect";
	for (const team of userTeams) {
		let option = document.createElement("option");
		option.value = team.id;
		option.textContent = team.name;
		option.selected = team.id === activeTeamId;
		teamSelect.append(option);
	}

	let slotSelect = document.createElement("select");
	slotSelect.id = "speciesTeamSlotSelect";
	slotSelect.className = "accountSelect";
	for (let slot = 1; slot <= 6; slot++) {
		let option = document.createElement("option");
		option.value = slot;
		option.textContent = `Slot ${slot}`;
		slotSelect.append(option);
	}

	const syncSuggestedSlot = function() {
		slotSelect.value = String(getFirstEmptyTeamSlot(teamSelect.value));
	};
	syncSuggestedSlot();
	teamSelect.onchange = syncSuggestedSlot;

	let abilitySelect = document.createElement("select");
	abilitySelect.id = "speciesAbilitySelect";
	abilitySelect.className = "accountSelect";
	for (const ability of getAvailableAbilityEntries(mon)) {
		let option = document.createElement("option");
		option.value = ability.abilityId;
		option.textContent = ability.label;
		abilitySelect.append(option);
	}

	let moves = getDisplayLearnsetOptions(mon);
	let moveSelectors = document.createElement("div");
	moveSelectors.className = "infoAccountMoveGrid";
	for (let slot = 1; slot <= 4; slot++) {
		let moveSelect = document.createElement("select");
		moveSelect.id = `speciesMoveSelect${slot}`;
		moveSelect.className = "accountSelect";

		let emptyOption = document.createElement("option");
		emptyOption.value = "";
		emptyOption.textContent = `Move ${slot}`;
		moveSelect.append(emptyOption);

		for (const moveEntry of moves) {
			let option = document.createElement("option");
			option.value = moveEntry.id;
			option.textContent = moveEntry.name;
			moveSelect.append(option);
		}

		moveSelectors.append(moveSelect);
	}

	let saveButton = document.createElement("button");
	saveButton.textContent = "Save To Team Slot";
	saveButton.onclick = function() {
		saveSpeciesPanelTeamSelection(mon);
	};

	teamRow.append(teamSelect, slotSelect, nicknameInput, abilitySelect, moveSelectors, saveButton);
	wrapper.append(teamRow);
	return wrapper;
}

function renderSpeciesPanelAccountActions(mon = currentSpeciesPanelMon) {
	let host = document.getElementById("speciesPanelAccountActionsHost");
	if (!host)
		return;

	host.innerHTML = "";
	if (!mon)
		return;

	host.append(buildSpeciesPanelAccountSection(mon));
}

async function saveSpeciesPanelTeamSelection(mon) {
	const teamId = document.getElementById("speciesTeamSelect")?.value;
	const slot = Number(document.getElementById("speciesTeamSlotSelect")?.value || 0);
	const abilityId = Number(document.getElementById("speciesAbilitySelect")?.value || 0) || null;
	const nickname = document.getElementById("teamMemberNicknameInput")?.value.trim() || null;

	if (!teamId || !slot) {
		flashBackendStatus("Choose a team and slot first.", "warn");
		return;
	}

	const moveIds = [];
	for (let idx = 1; idx <= 4; idx++) {
		const value = document.getElementById(`speciesMoveSelect${idx}`)?.value;
		if (value)
			moveIds.push(Number(value));
	}

	const result = await upsertTeamMemberSelection(teamId, slot, mon, nickname, abilityId, moveIds);
	if (!result.ok) {
		flashBackendStatus(result.error.message, "error");
		return;
	}

	renderSpeciesPanelAccountActions(mon);
	flashBackendStatus(`${mon.key} saved to ${result.mode === "guest" ? "local " : ""}team slot ${slot}.`, "success");
}

async function updateTeamMemberFromDetail(mon, teamId, slot, existingMember) {
	const abilityId = Number(document.getElementById("teamMemberDetailAbilitySelect")?.value || 0) || null;
	const moveIds = [];
	for (let idx = 1; idx <= 4; idx++) {
		const value = document.getElementById(`teamMemberDetailMoveSelect${idx}`)?.value;
		if (value)
			moveIds.push(Number(value));
	}

	const result = await upsertTeamMemberSelection(
		teamId,
		slot,
		mon,
		existingMember.nickname || null,
		abilityId,
		moveIds,
	);

	if (!result.ok) {
		flashBackendStatus(result.error.message, "error");
		return;
	}

	const updatedTeam = userTeams.find(x => x.id === teamId);
	const updatedMember = updatedTeam?.members?.find(x => x.slot === slot);
	if (updatedMember) {
		flashBackendStatus("Team member updated.", "success");
		displayTeamMemberPanel(updatedMember, slot, { teamId, editable: true });
		return;
	}

	flashBackendStatus("Team member updated.", "success");
}

async function loadSharedTeamFromUrl() {
	const params = new URLSearchParams(window.location.search);
	const guestPayload = params.get("guestTeam");
	if (guestPayload) {
		try {
			const data = JSON.parse(decodeBase64Unicode(decodeURIComponent(guestPayload)));
			renderSharedTeamView(data);
		} catch (error) {
			console.error("Failed to decode guest team payload.", error);
			sharedTeamView.classList.remove("hide");
			sharedTeamView.innerHTML = `<div class="sharedTeamMissing">Guest team link could not be decoded.</div>`;
		}
		return;
	}

	const teamSlug = params.get("team");
	if (!teamSlug) {
		sharedTeamView.classList.add("hide");
		sharedTeamView.innerHTML = "";
		return;
	}

	if (!backendEnabled)
		return;

	const config = getSupabaseConfig();
	const { data, error } = await getSupabaseClient().rpc(
		config.sharedTeamRpc || "get_shared_team",
		{ team_slug: teamSlug }
	);

	if (error) {
		console.error("Failed to load shared team.", error);
		return;
	}

	if (!data) {
		sharedTeamView.classList.remove("hide");
		sharedTeamView.innerHTML = `<div class="sharedTeamMissing">Shared team not found.</div>`;
		return;
	}

	renderSharedTeamView(data);
}

function renderSharedTeamView(data) {
	let team = data.team;
	let members = data.members || [];

	sharedTeamView.classList.remove("hide");
	sharedTeamView.innerHTML = "";

	let title = document.createElement("div");
	title.className = "sharedTeamTitle";
	title.textContent = `${team.name} by ${team.display_name || team.username}`;

	let meta = document.createElement("div");
	meta.className = "sharedTeamMeta";
	meta.textContent = team.visibility === "guest" ? "Guest share link" : `${team.visibility} share link`;

	let membersWrapper = document.createElement("div");
	membersWrapper.className = "sharedTeamMembers";
	let toggleButton = document.createElement("button");
	toggleButton.className = "sharedTeamToggle teamActionButton teamActionToggle";
	toggleButton.dataset.expanded = "true";
	toggleButton.textContent = "Hide Team";

	let roster = buildTeamDexRoster({ members }, { summaryOnly: true, editable: false });
	toggleButton.onclick = function() {
		const hidden = !roster.classList.contains("hide");
		roster.classList.toggle("hide", hidden);
		toggleButton.dataset.expanded = hidden ? "false" : "true";
		toggleButton.textContent = hidden ? "Show Team" : "Hide Team";
	};

	membersWrapper.append(toggleButton, roster);

	sharedTeamView.append(title, meta, membersWrapper);
}
