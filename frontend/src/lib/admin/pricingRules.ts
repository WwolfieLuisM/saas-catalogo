import type { PricingRule } from './types.ts';

export interface RuleDraft {
  id: string | null;
  minSize: number;
  maxSize: number | null;
  price: number;
  active: boolean;
}

export function ruleRangeLabel(rule: Pick<RuleDraft, 'minSize' | 'maxSize'>): string {
  if (rule.maxSize == null) return `más de ${rule.minSize} GB`;
  return `${rule.minSize} a ${rule.maxSize} GB`;
}

export function draftFromRule(rule: PricingRule): RuleDraft {
  return {
    id: rule.id,
    minSize: rule.minSize,
    maxSize: rule.maxSize,
    price: rule.price,
    active: rule.active,
  };
}

export function validateRules(rows: RuleDraft[]): string[] {
  const errors: string[] = [];
  rows.forEach((row, index) => {
    if (!(row.minSize >= 0)) {
      errors.push(`Regla ${index + 1}: el mínimo debe ser 0 o mayor.`);
    }
    if (row.maxSize != null && !(row.maxSize > row.minSize)) {
      errors.push(`Regla ${index + 1}: el máximo debe ser mayor que el mínimo.`);
    }
    if (!(row.price >= 0)) {
      errors.push(`Regla ${index + 1}: el precio no es válido.`);
    }
  });
  const active = rows
    .filter((row) => row.active)
    .slice()
    .sort((a, b) => a.minSize - b.minSize);
  for (let i = 1; i < active.length; i += 1) {
    const prev = active[i - 1];
    const curr = active[i];
    if (prev.maxSize == null) {
      errors.push('Hay una regla sin límite superior antes de otras reglas.');
    } else if (curr.minSize <= prev.maxSize) {
      errors.push(
        `Se solapan los rangos "${ruleRangeLabel(prev)}" y "${ruleRangeLabel(curr)}".`,
      );
    }
  }
  return errors;
}
