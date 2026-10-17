export interface OfertaLegible {
  platform: { name: string } | null;
  platforms: Array<{ name: string }>;
}

export const SIN_PLATAFORMA = '—';

export function etiquetaPlataforma(oferta: OfertaLegible): string {
  const propia = oferta.platform?.name?.trim();
  if (propia && propia.length > 0) return propia;

  const heredadas = oferta.platforms
    .map((item) => item.name?.trim() ?? '')
    .filter((name) => name.length > 0);

  return heredadas.length > 0 ? heredadas.join(', ') : SIN_PLATAFORMA;
}