const SUPER_DIGITS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

/** Parse a numeric answer without evaluation or accepting arbitrary expressions. */
export function parseNumericalAnswer(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input !== 'string') return null;
  let value = input.trim().replace(/[−–]/g, '-').replace(/\s+/g, '');
  if (!value) return null;
  value = value.replace(/([0-9]+)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_, base, exponent) => `${base}^${[...exponent].map((digit) => SUPER_DIGITS[digit]).join('')}`);
  const power = value.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\^([+-]?\d+)$/);
  if (power) {
    const base = Number(power[1]);
    const exponent = Number(power[2]);
    if (!Number.isFinite(base) || !Number.isInteger(exponent) || Math.abs(exponent) > 308) return null;
    const result = base ** exponent;
    return Number.isFinite(result) ? result : null;
  }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
