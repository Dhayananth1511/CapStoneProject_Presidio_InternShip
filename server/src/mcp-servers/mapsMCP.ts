// Maps MCP Server — wraps Google Maps APIs (Geocoding, Places, Distance Matrix)
// Google gives $200 free credit/month which is more than enough for a capstone.
// We wrap all three sub-APIs in one MCP server because they all come from Google.

import { withRetry } from '../utils/retry';

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Get nearby attractions and restaurants using Google Places API
export async function getPlacesNearby(
  destination: string,
  interests: string[],
  days: number
): Promise<{ 
  attractions: string[]; 
  restaurants: string[]; 
  restaurant_options: Array<{ name: string; rating: number; price_level?: number; user_ratings_total?: number; source_type?: string }>; 
  attraction_options: Array<{ name: string; rating: number; user_ratings_total?: number; photo_reference?: string | null; place_id?: string | null; vicinity?: string | null; types?: string[]; source_type?: string }>;
  timings: string; 
  entry_fees: string; 
  source_status?: 'google_places_live' | 'live_fetch_failed';
}> {
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY.includes('REPLACE_WITH')) {
    throw new Error('Google Maps API Key is missing or not configured. Please set GOOGLE_MAPS_API_KEY in your environment variables.');
  }

  return withRetry(async () => {
    try {
      // First geocode destination to coordinates
      const geoRes = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${GOOGLE_API_KEY}`
      );
      const geoData: any = await geoRes.json();
      const location = geoData.results[0]?.geometry?.location;

      if (!location) throw new Error('Could not geocode destination');

      // Search for tourist attractions nearby
      const placesRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location.lat},${location.lng}&radius=10000&type=tourist_attraction&key=${GOOGLE_API_KEY}`
      );
      const placesData: any = await placesRes.json();

      const attractionResults = placesData.results?.slice(0, 10) || [];
      const attractions = attractionResults.map((p: any) => p.name);
      const attractionOptions = attractionResults.map((p: any) => ({
        name: p.name,
        rating: p.rating || 0,
        user_ratings_total: p.user_ratings_total || 0,
        photo_reference: p.photos?.[0]?.photo_reference || null,
        place_id: p.place_id || null,
        vicinity: p.vicinity || null,
        types: p.types || [],
        source_type: 'google_places',
      }));

      // Search for restaurants
      const restRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location.lat},${location.lng}&radius=5000&type=restaurant&key=${GOOGLE_API_KEY}`
      );
      const restData: any = await restRes.json();
      const restaurantOptions = restData.results?.slice(0, 4).map((p: any) => ({
        name: p.name,
        rating: p.rating || 0,
        price_level: p.price_level,
        user_ratings_total: p.user_ratings_total,
        source_type: 'google_places',
      })) || [];
      const restaurants = restaurantOptions.map((restaurant: any) => restaurant.name);

      return {
        attractions,
        restaurants,
        restaurant_options: restaurantOptions,
        attraction_options: attractionOptions,
        timings: '09:00 AM - 06:00 PM (general)',
        entry_fees: `₹${100 + Math.floor(Math.random() * 300)} per person (estimated)`,
      };
    } catch (err: any) {
      console.warn(`Places/Geocoding API failed: ${err.message}. Returning no live activity listings for ${destination}.`);

      return {
        attractions: [],
        restaurants: [],
        restaurant_options: [],
        attraction_options: [],
        timings: 'Unavailable from live provider',
        entry_fees: 'Unavailable from live provider',
        source_status: 'live_fetch_failed',
      };
    }
  });
}

// Calculate distance/travel time between hotel and attraction for local transport estimates
export async function getDistanceMatrix(
  origin: string,
  destination: string
): Promise<{ distance_km: number; duration_min: number; cab_estimate_inr: number }> {
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY.includes('REPLACE_WITH')) {
    throw new Error('Google Maps API Key is missing or not configured. Please set GOOGLE_MAPS_API_KEY in your environment variables.');
  }

  return withRetry(async () => {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${GOOGLE_API_KEY}`
      );
      const data: any = await res.json();
      const element = data.rows[0]?.elements[0];

      if (!element || element.status === 'ZERO_RESULTS') {
        throw new Error('No travel route found');
      }

      const distance_km = (element?.distance?.value || 10000) / 1000;
      const duration_min = (element?.duration?.value || 1200) / 60;
      // ₹12/km estimate for city cab
      const cab_estimate_inr = Math.round(distance_km * 12 * 2); // x2 for round trip

      return { distance_km, duration_min, cab_estimate_inr };
    } catch (err: any) {
      console.warn(`Distance Matrix failed: ${err.message}. Using estimated default values.`);
      // Heuristic default: 15 km, 30 mins, and Rs. 360 cab cost
      return {
        distance_km: 15.0,
        duration_min: 30.0,
        cab_estimate_inr: 360
      };
    }
  });
}

