/**
 * Resolves a path inside `public/` against the deployed base URL.
 *
 * The app is served from the site root in development and from a sub-path
 * (for example `/music-player/`) on GitHub Pages, so root-relative literals break there.
 */
export const publicUrl = (path: string): string =>
  `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
