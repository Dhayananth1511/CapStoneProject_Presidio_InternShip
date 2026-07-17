/**
 * Helpers for trip information extraction and city name normalization.
 */

export const cleanCityName = (value?: string): string | undefined => {
  if (!value) return undefined;
  const city = value
    .replace(/[.,;:!?]+$/g, '')
    .replace(/\b(?:from|and|with|for|on|before|after|please|replan)\b.*$/i, '')
    .trim();

  if (!/[a-zA-Z]{2,}/.test(city)) return undefined;
  return city
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

export const extractExplicitReplanInput = (reason: string): { destination?: string; origin?: string } => {
  const destinationPatterns = [
    /\bdestination\s+(?:from\s+)?[a-zA-Z][a-zA-Z\s.'-]{1,50}?\s+to\s+([a-zA-Z][a-zA-Z\s.'-]{1,50})/i,
    /\b(?:change|update|set|switch)\s+(?:the\s+)?destination\s+(?:from\s+)?[a-zA-Z][a-zA-Z\s.'-]{1,50}?\s+to\s+([a-zA-Z][a-zA-Z\s.'-]{1,50})/i,
    /\b(?:change|update|set|switch)\s+(?:the\s+)?destination\s+(?:to|as|is)?\s+([a-zA-Z][a-zA-Z\s.'-]{1,50})/i,
    /\bdestination\s+(?:is|to|as)\s+([a-zA-Z][a-zA-Z\s.'-]{1,50})/i,
    /\b(?:go|travel|trip|plan)(?:ing)?\s+(?:to|for)\s+([a-zA-Z][a-zA-Z\s.'-]{1,50})/i,
  ];
  const originPatterns = [
    /\b(?:departure|depature|origin|from|starting\s+from|start\s+from)\s+(?:city\s+)?(?:is|to|as)?\s+([a-zA-Z][a-zA-Z\s.'-]{1,50})/i,
  ];

  const destination = cleanCityName(destinationPatterns.map((pattern) => reason.match(pattern)?.[1]).find(Boolean));
  const origin = cleanCityName(originPatterns.map((pattern) => reason.match(pattern)?.[1]).find(Boolean));

  return { destination, origin };
};
