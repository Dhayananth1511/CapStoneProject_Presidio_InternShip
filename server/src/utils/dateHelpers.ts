/**
 * Calculates the fractional number of days between two dates.
 * Returns 5 as a fallback if dates are invalid or missing.
 */
export function calculateDaysBetween(startDate?: string | Date, endDate?: string | Date): number {
  if (!startDate || !endDate) return 5;
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return 5;
  }

  return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Calculates the integer number of nights/days between two dates (minimum 1).
 */
export function calculateNights(checkIn?: string | Date, checkOut?: string | Date): number {
  const days = calculateDaysBetween(checkIn, checkOut);
  return Math.max(1, Math.round(days));
}
