// Booking MCP Server — REAL hotel search via Google Places + MOCK final booking
// We call the Google Places API using the Maps key to search for real lodging businesses 
// in the destination city. Pricing is dynamically estimated based on their rating and class.
// The booking itself is mocked, awaiting user/human confirmation.

import { withRetry } from '../utils/retry';

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

interface HotelOption {
  name: string;
  price_per_night_inr: number;
  rating: number;
  amenities: string[];
  total_cost_inr: number;
}

export async function searchHotels(
  destination: string,
  check_in: string,
  check_out: string,
  travelers: number
): Promise<{ hotels: HotelOption[]; recommended: string; price_per_night: number }> {
  return withRetry(async () => {
    // 1. Geocode the destination name to lat/lng using Google Maps
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${GOOGLE_API_KEY}`
    );
    const geoData: any = await geoRes.json();
    const location = geoData.results[0]?.geometry?.location;

    if (!location) {
      throw new Error(`Could not geocode destination '${destination}' for hotels search`);
    }

    // 2. Fetch lodging/hotel places from Google Places API
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location.lat},${location.lng}&radius=15000&type=lodging&key=${GOOGLE_API_KEY}`;
    const res = await fetch(url);
    const data: any = await res.json();

    const results = data.results || [];
    const nights = Math.max(
      1,
      (new Date(check_out).getTime() - new Date(check_in).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Map Google Places results to HotelOption
    const hotels: HotelOption[] = results.slice(0, 5).map((h: any) => {
      // Estimate realistic pricing (Google Places doesn't return prices directly)
      const priceLevelFactor = h.price_level ? h.price_level * 1500 : 1000;
      const basePrice = Math.round(1500 + (h.rating || 4.0) * 800 + priceLevelFactor);
      
      // Select related tags as amenities
      const rawTypes = h.types || [];
      const amenities = ['WiFi', 'AC'];
      if (rawTypes.includes('restaurant')) amenities.push('Restaurant');
      if (rawTypes.includes('spa')) amenities.push('Spa');
      if (rawTypes.includes('bar')) amenities.push('Bar');

      return {
        name: h.name,
        price_per_night_inr: basePrice,
        rating: h.rating || 4.0,
        amenities,
        total_cost_inr: basePrice * nights,
      };
    });

    // Fallback in case Google returns no properties for the coordinates
    if (hotels.length === 0) {
      const fallbackPrice = 2500;
      hotels.push({
        name: `${destination} Grand Resort`,
        price_per_night_inr: fallbackPrice,
        rating: 4.2,
        amenities: ['WiFi', 'Breakfast', 'AC', 'Pool'],
        total_cost_inr: fallbackPrice * nights,
      });
    }

    return {
      hotels,
      recommended: hotels[0].name,
      price_per_night: hotels[0].price_per_night_inr,
    };
  });
}

export async function mockBooking(
  hotel: string,
  travelers: number
): Promise<{ booking_ref: string; status: string; confirmation_message: string }> {
  // Simulate payment processing latency
  await new Promise((r) => setTimeout(r, 600)); 
  
  return {
    booking_ref: `BK${Date.now().toString(36).toUpperCase()}`,
    status: 'CONFIRMED',
    confirmation_message: `Booking confirmed at ${hotel} for ${travelers} traveler(s).`,
  };
}
