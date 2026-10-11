import type { GameRequirements, PricingRule } from './types.ts';

export function sizeToGb(sizeValue: number, sizeUnit: string): number {
  if (sizeUnit === 'MB') return sizeValue / 1000;
  if (sizeUnit === 'TB') return sizeValue * 1000;
  return sizeValue;
}

export function priceFor(sizeGb: number, rules: PricingRule[]): number | null {
  const ordered = rules.filter((rule) => rule.active).sort((a, b) => a.minSize - b.minSize);
  const match = ordered.find(
    (rule) => sizeGb >= rule.minSize && (rule.maxSize === null || sizeGb <= rule.maxSize),
  );
  return match ? match.price : null;
}

export function reqFor(size: number): { min: GameRequirements; rec: GameRequirements } {
  const m: [string, string, number, string] =
    size < 10
      ? ['Intel i3', 'GTX', 4, 'HDD']
      : size < 50
        ? ['Intel i5', 'GTX', 8, 'HDD']
        : ['Intel i5', 'GTX', 12, 'SSD'];
  const r: [string, string, number, string] =
    size < 10
      ? ['Intel i5', 'GTX', 8, 'HDD']
      : size < 50
        ? ['Intel i7', 'GTX', 16, 'SSD']
        : ['Intel i7', 'RTX', 16, 'SSD'];
  const mk = (a: [string, string, number, string]): GameRequirements => ({
    cpu: a[0],
    gpu: a[1],
    ram: `${a[2]} GB`,
    os: 'Windows 10 64-bit',
    directX: 'DirectX 11',
    storage: a[3],
  });
  return { min: mk(m), rec: mk(r) };
}
