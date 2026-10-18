const STORAGE_KEY = 'sonic-studio-pro:recent-searches';
const MAX_ENTRIES = 6;

/** Reads the recent search terms, ignoring anything malformed. */
export function loadRecentSearches(): string[] {
  if (typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

/** Adds a term to the history, moving it to the front when it is already there. */
export function rememberSearch(term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) return loadRecentSearches();

  const next = [trimmed, ...loadRecentSearches().filter((item) => item !== trimmed)].slice(0, MAX_ENTRIES);

  try {
    localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }

  return next;
}

export function clearRecentSearches(): void {
  try {
    localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
