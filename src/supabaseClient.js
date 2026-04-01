function getSupabaseConfig() {
	return window.RRDEX_SUPABASE_CONFIG || {};
}

function isSupabaseConfigured() {
	const config = getSupabaseConfig();
	return Boolean(config.url && config.anonKey);
}

function initBackendClient() {
	if (supabaseClient || !isSupabaseConfigured())
		return supabaseClient;

	if (!window.supabase || typeof window.supabase.createClient !== "function") {
		console.warn("Supabase client library is not available.");
		return null;
	}

	const config = getSupabaseConfig();
	supabaseClient = window.supabase.createClient(config.url, config.anonKey, {
		auth: {
			autoRefreshToken: true,
			detectSessionInUrl: true,
			persistSession: true,
		},
	});

	return supabaseClient;
}

function getSupabaseClient() {
	return supabaseClient || initBackendClient();
}
