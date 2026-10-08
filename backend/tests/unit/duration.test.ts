import { describe, expect, it } from 'vitest';
import { parseDurationToSeconds } from '../../src/utils/duration.js';

describe('parseDurationToSeconds', () => {
  it('convierte segundos, minutos, horas y días', () => {
    expect(parseDurationToSeconds('90s')).toBe(90);
    expect(parseDurationToSeconds('15m')).toBe(900);
    expect(parseDurationToSeconds('2h')).toBe(7200);
    expect(parseDurationToSeconds('30d')).toBe(2592000);
  });

  it('acepta espacios alrededor', () => {
    expect(parseDurationToSeconds(' 15m ')).toBe(900);
  });

  it('rechaza formatos inválidos', () => {
    expect(() => parseDurationToSeconds('15')).toThrow('Invalid duration');
    expect(() => parseDurationToSeconds('15x')).toThrow('Invalid duration');
    expect(() => parseDurationToSeconds('m15')).toThrow('Invalid duration');
    expect(() => parseDurationToSeconds('')).toThrow('Invalid duration');
  });
});
