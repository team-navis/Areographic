/** Resolve bundled public assets for local root hosting and a Pages project path. */
export function assetUrl(path, base = import.meta.env?.BASE_URL ?? '/') {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return prefix + path.replace(/^\/+/, '');
}