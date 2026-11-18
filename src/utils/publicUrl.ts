/**
 * Resolves a path inside `public/` against the deployed base URL.
 *
 * The app is served from the site root in development and from a sub-path
 * (for example `/music-player/`) on GitHub Pages, so root-relative literals break there.
 * Falls back to `/` where Vite has not injected `import.meta.env` (for example test harnesses).
 */
export const publicUrl = (path: string): string => {
  const base = import.meta.env?.BASE_URL ?? '/';
  return `${base}${path.replace(/^\/+/, '')}`;
};
