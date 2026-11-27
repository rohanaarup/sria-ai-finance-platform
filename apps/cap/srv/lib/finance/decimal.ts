/**
 * Decimal-safe money arithmetic (G2-01, ADR-013, decision D-03).
 *
 * All monetary and ratio arithmetic in calculation code goes through these helpers.
 * Binary floating point (IEEE-754) is never used for money: 0.1 + 0.2 must equal 0.3.
 *
 * D-03: decimal.js (arbitrary-precision decimal) rather than integer minor units, because
 * metrics include ratios and percentages that need division; amounts arrive as decimal
 * strings/numbers from providers and are converted through their string form.
 *
 * Rounding rule: ROUND_HALF_UP ("commercial rounding", half away from zero), applied once
 * per metric to the metric's declared number of decimals. Derived metrics use the rounded
 * values of the metrics they depend on (as published figures do).
 */
import { Decimal } from 'decimal.js';

export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof Dec>;

export const ZERO: Dec = new Dec(0);

/** Convert a provider value to Decimal through its string form (never through float maths). */
export function dec(v: number | string | Dec): Dec {
  if (v instanceof Dec) return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new RangeError(`Non-finite monetary value: ${v}`);
    return new Dec(String(v));
  }
  if (!/^-?\d+(\.\d+)?$/.test(v.trim())) throw new RangeError(`Invalid decimal string: "${v}"`);
  return new Dec(v.trim());
}

export function sum(values: Iterable<Dec>): Dec {
  let acc = ZERO;
  for (const v of values) acc = acc.plus(v);
  return acc;
}

export function roundTo(v: Dec, places: number): Dec {
  return v.toDecimalPlaces(places, Dec.ROUND_HALF_UP);
}

/** JSON boundary: a number that exactly represents the rounded decimal (2–6 dp values are safe). */
export function toApiNumber(v: Dec): number {
  return v.toNumber();
}

/** Fixed-point string for display, e.g. "40.00". */
export function toFixedString(v: Dec, places: number): string {
  return roundTo(v, places).toFixed(places);
}
