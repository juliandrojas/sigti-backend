const AREA_ALIASES = new Map([
  ['bienestar', 'Bienestar']
]);

export function normalizeArea(value) {
  const trimmed = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'Área no definida';
  return AREA_ALIASES.get(trimmed.toLocaleLowerCase('es-CO')) ?? trimmed;
}
