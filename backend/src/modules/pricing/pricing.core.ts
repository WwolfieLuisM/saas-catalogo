import type { PricingRule } from '../../generated/client.js';

/**
 * Núcleo del cálculo de precios, sin dependencias del servicio.
 *
 * Vive aparte para que `games` pueda sellar el precio al crear una oferta sin
 * importar `pricing.service`, que a su vez importa de `games` (ciclo).
 */

export function sizeToGb(sizeValue: number, sizeUnit: 'MB' | 'GB' | 'TB'): number {
  if (sizeUnit === 'MB') return sizeValue / 1000;
  if (sizeUnit === 'TB') return sizeValue * 1000;
  return sizeValue;
}

export function calculatePrice(sizeGb: number, rules: PricingRule[]): number | null {
  const ordered = rules.filter((rule) => rule.active).sort((a, b) => a.minSize - b.minSize);
  const match = ordered.find(
    (rule) => sizeGb >= rule.minSize && (rule.maxSize === null || sizeGb <= rule.maxSize),
  );
  return match ? Number(match.price) : null;
}
