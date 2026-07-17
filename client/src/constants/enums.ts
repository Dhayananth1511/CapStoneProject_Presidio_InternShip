// Shared Enums and Constants for client-side travel-planner application

export const TripStatus = {
  DRAFT: 'DRAFT',
  PLANNED: 'PLANNED',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED'
} as const;
export type TripStatus = typeof TripStatus[keyof typeof TripStatus];

export const UserRole = {
  TRAVELER: 'traveler',
  ADMIN: 'admin'
} as const;
export type UserRole = typeof UserRole[keyof typeof UserRole];

export const MessageRole = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system'
} as const;
export type MessageRole = typeof MessageRole[keyof typeof MessageRole];

export const HotelCategory = {
  BUDGET: 'budget',
  MID_RANGE: 'mid_range',
  LUXURY: 'luxury',
  SKIPPED: 'skipped'
} as const;
export type HotelCategory = typeof HotelCategory[keyof typeof HotelCategory];
 