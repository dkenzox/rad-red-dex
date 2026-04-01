window.RRDEX_SUPABASE_CONFIG = window.RRDEX_SUPABASE_CONFIG || {
	url: "https://cpqjsozgzondhsqtegjj.supabase.co",
	anonKey: "sb_publishable_Nf5fa6f_ae-fm7DbyFQxTQ_buVQSncp",
	sharedTeamRpc: "get_shared_team",
	saveImportFunction: "import-save",
};

window.RRDEX_SUPABASE_CONFIG_LOCAL = window.RRDEX_SUPABASE_CONFIG_LOCAL || null;
window.RRDEX_SUPABASE_CONFIG_READY = window.RRDEX_SUPABASE_CONFIG_READY || Promise.resolve();

function mergeSupabaseConfigOverride(override) {
	if (!override || typeof override !== "object")
		return;

	window.RRDEX_SUPABASE_CONFIG = Object.assign({}, window.RRDEX_SUPABASE_CONFIG, override);
}

function loadSupabaseConfigStorageOverride() {
	try {
		const raw = window.localStorage.getItem("rrdex_supabase_config_override");
		if (!raw)
			return null;
		return JSON.parse(raw);
	} catch (error) {
		console.warn("Failed to read local Supabase config override.", error);
		return null;
	}
}

function waitForSupabaseConfig() {
	return window.RRDEX_SUPABASE_CONFIG_READY || Promise.resolve();
}

mergeSupabaseConfigOverride(loadSupabaseConfigStorageOverride());
