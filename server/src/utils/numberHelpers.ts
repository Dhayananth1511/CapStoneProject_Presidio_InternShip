/**
 * Standard utility to parse the first numeric value from a string or unknown input,
 * returning 0 if no numbers match.
 */
export function parseFirstNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const match = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
    if (match) {
      return Number(match[0]);
    }
  }

  return 0;
}
