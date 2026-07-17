export type HotelbedsSuite = 'hotels' | 'activities' | 'transfers';

export interface HotelOption {
  name: string;
  price_per_night_inr: number;
  rating: number;
  amenities: string[];
  total_cost_inr: number;
  stars?: number;
  address?: string;
  description?: string;
  source_type?: 'hotelbeds_api' | 'llm_recommendation' | 'geoapify_places';
}
