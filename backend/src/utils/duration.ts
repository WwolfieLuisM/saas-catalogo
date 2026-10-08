const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  const amount = match?.[1];
  const unit = match?.[2];

  if (amount === undefined || unit === undefined) {
    throw new Error(`Invalid duration: ${value}`);
  }

  const factor = UNIT_SECONDS[unit];
  if (factor === undefined) {
    throw new Error(`Invalid duration unit: ${unit}`);
  }

  return Number(amount) * factor;
}
