// Shared Enums for travel-planner application

export enum TripStatus {
  DRAFT = 'DRAFT',
  PLANNED = 'PLANNED',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED'
}

export enum UserRole {
  TRAVELER = 'traveler',
  ADMIN = 'admin'
}

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system'
}

export enum HotelCategory {
  BUDGET = 'budget',
  MID_RANGE = 'mid_range',
  LUXURY = 'luxury',
  SKIPPED = 'skipped'
}
