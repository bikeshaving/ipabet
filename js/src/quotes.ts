// The bracket-key quotes per locale — [open1, close1, open2, close2]. CLDR
// <delimiters> reference data the engine owns, not keyboard layout (mirrors the
// Rust builtin_quotes). The quote locale is CONFIGURATION, not composition state.
export const QUOTE_LOCALES: {default: string; locales: Record<string, string[]>} = {
	default: "en",
	locales: {
		en: ["“", "”", "‘", "’"], de: ["„", "“", "‚", "‘"], fr: ["«", "»", "‹", "›"],
		ch: ["»", "«", "›", "‹"], pl: ["„", "”", "«", "»"], ru: ["«", "»", "„", "“"], sv: ["”", "”", "’", "’"],
	},
};
