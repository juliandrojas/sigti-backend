const AREA_ALIASES = new Map([
  ['bienestar', 'BIENESTAR']
]);

export function normalizeArea(value) {
  const trimmed = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'ÁREA NO DEFINIDA';
  const normalized = AREA_ALIASES.get(trimmed.toLocaleLowerCase('es-CO')) ?? trimmed;
  return normalized.toLocaleUpperCase('es-CO');
}
