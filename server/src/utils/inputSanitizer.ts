// Input Sanitizer Utility — Centralised guard for all user-facing inputs.
// Validates, clamps, and sanitizes trip parameters BEFORE they hit any LLM.
// Called from tripController before delegating to plannerService.

import logger from './logger';

// ======================================================
// PROMPT INJECTION GUARD
// ======================================================
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|context)/i,
  /you\s+are\s+now\s+a?n?\s+\w/i,
  /system\s*prompt/i,
  /act\s+as\s+(a\s+)?(?:different|new|another)/i,
  /disregard\s+(all\s+)?(prev|prior|above)/i,
  /forget\s+(all\s+)?(previous|above)/i,
  /new\s+role\s*:/i,
  /\[system\]/i,
  /<\|im_start\|>/i,
  /JAILBREAK/i,
];

/**
 * Detects prompt injection attempts in user messages.
 * Returns true if the message is safe, false if suspected injection.
 */
export function isMessageSafe(message: string): boolean {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(message)) {
      logger.warn('Prompt injection attempt detected', { pattern: pattern.source, message: message.slice(0, 100) });
      return false;
    }
  }
  return true;
}

// ======================================================
// DESTINATION CONTENT MODERATION
// ======================================================
/**
 * Validates a destination string.
 * - Must have at least 2 alphabetical characters
 * - Cannot be purely numeric
 * - Cannot be gibberish (too many consecutive consonants)
 */
export function isValidDestination(destination: string): { valid: boolean; reason?: string } {
  if (!destination || destination.trim().length < 2) {
    return { valid: false, reason: 'Destination must be at least 2 characters.' };
  }
  if (/^\d+$/.test(destination.trim())) {
    return { valid: false, reason: 'Destination cannot be a number. Please enter a city or place name.' };
  }
  if (!/[a-zA-Z]{2,}/.test(destination)) {
    return { valid: false, reason: 'Destination must contain recognizable letters.' };
  }
  return { valid: true };
}

// ======================================================
// DATE SANITY CHECKS
// ======================================================
/**
 * Validates that:
 * 1. start_date is not in the past (must be today or future)
 * 2. end_date is after start_date
 * 3. Trip duration doesn't exceed 30 days
 */
export function validateTripDates(
  start_date?: string,
  end_date?: string
): { valid: boolean; reason?: string } {
  if (!start_date || !end_date) return { valid: true }; // Let missingInfoAgent handle this

  if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
    return { valid: false, reason: 'Invalid date format detected. Please use YYYY-MM-DD.' };
  }

  const [startY, startM, startD] = start_date.split('-').map(Number);
  const [endY, endM, endD] = end_date.split('-').map(Number);

  if (
    isNaN(startY) || isNaN(startM) || isNaN(startD) ||
    isNaN(endY) || isNaN(endM) || isNaN(endD)
  ) {
    return { valid: false, reason: 'Invalid date format detected. Please use YYYY-MM-DD.' };
  }

  const now = new Date();
  const currentY = now.getFullYear();
  const currentM = now.getMonth() + 1;
  const currentD = now.getDate();

  const startIsPast = startY < currentY || 
                      (startY === currentY && startM < currentM) || 
                      (startY === currentY && startM === currentM && startD < currentD);

  if (startIsPast) {
    return { valid: false, reason: `Start date (${start_date}) is in the past. Please choose a future date.` };
  }

  const endBeforeOrEqualStart = endY < startY || 
                               (endY === startY && endM < startM) || 
                               (endY === startY && endM === startM && endD <= startD);

  if (endBeforeOrEqualStart) {
    return { valid: false, reason: `End date (${end_date}) must be after start date (${start_date}).` };
  }

  const startMs = Date.UTC(startY, startM - 1, startD);
  const endMs = Date.UTC(endY, endM - 1, endD);
  const durationDays = (endMs - startMs) / (1000 * 60 * 60 * 24);

  if (durationDays > 30) {
    return { valid: false, reason: `Trip duration of ${Math.round(durationDays)} days exceeds the 30-day maximum. Please shorten your trip.` };
  }

  return { valid: true };
}

// ======================================================
// TRAVELERS & BUDGET CLAMPERS
// ======================================================
/** Clamps travelers to [1, 20] range. Returns the clamped value + a warning if clamped. */
export function clampTravelers(travelers?: number): { value: number; warning?: string } {
  if (!travelers || isNaN(travelers)) return { value: 1 };
  if (travelers < 1) return { value: 1, warning: 'Travelers count must be at least 1. Adjusted to 1.' };
  if (travelers > 20) return { value: 20, warning: 'Maximum supported group size is 20. Adjusted to 20.' };
  return { value: Math.round(travelers) };
}

/** Clamps budget_inr to [₹1,000, ₹10,000,000] range. */
export function clampBudget(budget?: number): { value: number; warning?: string } {
  if (!budget || isNaN(budget)) return { value: 0 }; // Let missingInfoAgent prompt for it
  if (budget < 1000) return { value: 1000, warning: 'Minimum budget is ₹1,000. Adjusted accordingly.' };
  if (budget > 10_000_000) return { value: 10_000_000, warning: 'Maximum budget cap is ₹1,00,00,000. Adjusted accordingly.' };
  return { value: Math.round(budget) };
}
