export interface TripSummary {
  sessionId: string;
  status: 'DRAFT' | 'PLANNED' | 'CONFIRMED' | 'CANCELLED';
  createdAt: string;
  input: {
    destination?: string;
    origin?: string;
    start_date?: string;
    end_date?: string;
    budget_inr?: number;
    travelers?: number;
    interests?: string[];
  };
}

export interface TripItem {
  sessionId: string;
  status: string;
  createdAt: string;
  userId?: {
    name: string;
    email: string;
  };
  input: {
    destination?: string;
    origin?: string;
    start_date?: string;
    end_date?: string;
    travelers?: number;
    budget_inr?: number;
    interests?: string[];
  };
  budget?: {
    total_cost_inr?: number;
    total_estimated_cost?: number;
    transport?: number;
    accommodation?: number;
    food?: number;
    activities?: number;
    local_transport?: number;
    emergency_fund?: number;
  };
  formattedPlan?: string;
}

export interface Attraction {
  name: string;
  vicinity?: string;
  rating?: number;
  description?: string;
  user_ratings_total?: number;
  photo_reference?: string;
  place_id?: string;
  is_llm_recommended?: boolean;
  source_type?: 'geoapify_places' | 'llm_recommendation' | 'hotelbeds_api';
  price_per_person_inr?: number;
}

export interface Hotel {
  name: string;
  rating?: number;
  price_per_night_inr?: number;
  total_cost_inr?: number;
  address?: string;
  vicinity?: string;
  description?: string;
  amenities?: string[];
  is_llm_recommended?: boolean;
  source_type?: 'hotelbeds_api' | 'geoapify_places' | 'llm_recommendation';
}

export interface ActivityItem {
  activity: string;
  time: string;
  location?: string;
  duration_min?: number;
  travel_cost_inr?: number;
  cost_inr?: number;
  transport_note?: string;
}

export interface DayItem {
  day: number;
  date?: string;
  title?: string;
  daily_total_inr: number;
  description?: string;
  weather_note?: string;
  schedule?: ActivityItem[];
}

export interface ItineraryData {
  days?: DayItem[];
}

export interface TransportOption {
  mode: string;
  operator: string;
  cost_inr: number;
  cost_per_traveler: number;
  duration_hrs: number;
  departure?: string;
  arrival?: string;
  data_source?: string;
  amenities?: string[];
  distance_km?: number;
}

export interface TransportData {
  options?: TransportOption[];
  best_option?: string;
  estimated_cost_inr?: number;
  selected_option?: {
    operator: string;
    mode: string;
  } | null;
  reasoning?: string;
  distance_km?: number;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

