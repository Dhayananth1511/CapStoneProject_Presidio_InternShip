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

      // Search for tourist attractions nearby (general)
      const placesRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location.lat},${location.lng}&radius=15000&type=tourist_attraction&key=${GOOGLE_API_KEY}`
      );
      const placesData: any = await placesRes.json();
      let attractionResults = placesData.results || [];

      // Customize Place Search query based on interest category if provided
      if (Array.isArray(interests) && interests.length > 0) {
        let specType = '';
        const primary = interests[0].toLowerCase();
        if (primary.includes('shop') || primary.includes('market')) specType = 'shopping_mall';
        else if (primary.includes('museum') || primary.includes('history') || primary.includes('culture')) specType = 'museum';
        else if (primary.includes('park') || primary.includes('nature') || primary.includes('forest') || primary.includes('garden')) specType = 'park';
        else if (primary.includes('religious') || primary.includes('temple') || primary.includes('church') || primary.includes('mosque')) specType = 'place_of_worship';
        else if (primary.includes('night') || primary.includes('bar') || primary.includes('club') || primary.includes('pub')) specType = 'bar';
        else if (primary.includes('amuse') || primary.includes('theme') || primary.includes('adventure')) specType = 'amusement_park';

        if (specType) {
          try {
            const specRes = await fetch(
              `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location.lat},${location.lng}&radius=15000&type=${specType}&key=${GOOGLE_API_KEY}`
            );
            const specData: any = await specRes.json();
            const specResults = specData.results || [];

            // Merge unique entries to prevent duplicates, inserting interest matches at top
            const existingNames = new Set(attractionResults.map((p: any) => (p.name || '').toLowerCase()));
            const uniqueSpec = specResults.filter((p: any) => p.name && !existingNames.has(p.name.toLowerCase()));
            attractionResults = [...uniqueSpec, ...attractionResults];
          } catch (specErr: any) {
            console.warn(`[getPlacesNearby] Interest-specific place search failed: ${specErr.message}`);
          }
        }
      }

      // Slice results based on the number of trip days.
      // For longer trips, we need more sightseeing options to distribute across different days.
      const attractionsCount = Math.max(12, Math.min(30, days * 4));
      const slicedAttractions = attractionResults.slice(0, attractionsCount);
      const attractions = slicedAttractions.map((p: any) => p.name);
      const attractionOptions = slicedAttractions.map((p: any) => ({
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
      const restaurantsCount = Math.max(6, Math.min(20, days * 3));
      const restaurantOptions = restData.results?.slice(0, restaurantsCount).map((p: any) => ({
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

/**
 * Fetches restaurants that are physically near the selected hotel.
 * This ensures that dining options are convenient and realistic for the traveler.
 */
export async function getRestaurantsNearHotel(
  hotelName: string,
  destination: string
): Promise<{
  restaurants: string[];
  restaurant_options: Array<{ name: string; rating: number; price_level?: number; user_ratings_total?: number; source_type?: string }>;
}> {
  const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY.includes('REPLACE_WITH')) {
    console.warn('[mapsMCP] Google Maps API Key is missing. Skipping fetching restaurants near hotel.');
    return { restaurants: [], restaurant_options: [] };
  }

  return withRetry(async () => {
    try {
      // Geocode the hotel and destination together to get the hotel's exact coordinates
      const query = `${hotelName}, ${destination}`;
      const geoRes = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}`
      );
      const geoData: any = await geoRes.json();
      let location = geoData.results[0]?.geometry?.location;

      // Fallback: If hotel geocoding failed, try geocoding just the destination center
      if (!location) {
        const destGeoRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${GOOGLE_API_KEY}`
        );
        const destGeoData: any = await destGeoRes.json();
        location = destGeoData.results[0]?.geometry?.location;
      }

      if (!location) {
        throw new Error(`Could not geocode location: ${query}`);
      }

      // Search for restaurants within a 3km radius (walking or very short auto/cab ride)
      const restRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location.lat},${location.lng}&radius=3000&type=restaurant&key=${GOOGLE_API_KEY}`
      );
      const restData: any = await restRes.json();

      const restaurantOptions = restData.results?.slice(0, 6).map((p: any) => ({
        name: p.name,
        rating: p.rating || 0,
        price_level: p.price_level,
        user_ratings_total: p.user_ratings_total,
        source_type: 'google_places',
      })) || [];

      const restaurants = restaurantOptions.map((r: any) => r.name);

      return {
        restaurants,
        restaurant_options: restaurantOptions
      };
    } catch (err: any) {
      console.warn(`[mapsMCP] Failed to fetch restaurants near hotel: ${err.message}. Returning empty results.`);
      return {
        restaurants: [],
        restaurant_options: []
      };
    }
  });
}

export interface GoogleHotelOption {
  name: string;
  price_per_night_inr: number;
  rating: number;
  amenities: string[];
  total_cost_inr: number;
  stars?: number;
  address?: string;
  description?: string;
}

/**
 * Searches for real accommodation (hotels) around a destination city using Google Places API
 */
export async function getHotelsNearby(
  destination: string,
  nights: number
): Promise<GoogleHotelOption[]> {
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY.includes('REPLACE_WITH')) {
    console.warn('[mapsMCP] Google Maps API Key is missing. Skipping hotels lookup via Google Places.');
    return [];
  }

  return withRetry(async () => {
    try {
      const geoRes = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${GOOGLE_API_KEY}`
      );
      const geoData: any = await geoRes.json();
      const location = geoData.results[0]?.geometry?.location;

      if (!location) throw new Error(`Could not geocode destination: ${destination}`);

      // Search for lodging type places within 10km radius
      const placesRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location.lat},${location.lng}&radius=10000&type=lodging&key=${GOOGLE_API_KEY}`
      );
      const placesData: any = await placesRes.json();
      const results = placesData.results || [];

      // Filter out restaurant/eatery places that don't offer room staying (Indian context)
      const filteredResults = results.filter((p: any) => {
        const nameLower = (p.name || '').toLowerCase();
        const EATERY_KEYWORDS = [
          'restaurant', 'eatery', 'dhaba', 'mess', 'caterer', 'bakery', 'sweet',
          'cafe', 'bhojanalaya', 'dining', 'caffe', 'coffee', 'veg', 'tiffin',
          'bhavan', 'bhawan', 'meals', 'kitchen', 'caterers', 'sweets', 'bazaar',
          'canteen', 'tea house', 'bistro', 'food court', 'juice', 'ice cream', 'parlour'
        ];
        const LODGING_KEYWORDS = [
          'lodge', 'lodging', 'stay', 'residency', 'resort', 'inn', 'guest house',
          'guesthouse', 'homestay', 'villa', 'palace', 'apartment', 'suites', 'dorm',
          'hostel', 'cottage', 'houseboat', 'heritage', 'retreat', 'castle', 'manor'
        ];
        const hasEateryKeyword = EATERY_KEYWORDS.some(k => nameLower.includes(k));
        const hasLodgingKeyword = LODGING_KEYWORDS.some(k => nameLower.includes(k));
        if (hasEateryKeyword && !hasLodgingKeyword) {
          return false;
        }
        return true;
      });

      return filteredResults.slice(0, 15).map((p: any) => {
        const rating = p.rating || 4.0;
        const totalReviews = p.user_ratings_total || 25;
        const nameLower = (p.name || '').toLowerCase();

        // Subdivide hotels into star-categories using a heuristic based on rating, density, and keywords
        let stars = 3;
        if (rating >= 4.5 && totalReviews > 400) {
          stars = 5;
        } else if (rating >= 4.1) {
          stars = 4;
        } else if (rating < 3.8) {
          stars = 2;
        }

        if (
          nameLower.includes('resort') ||
          nameLower.includes('spa') ||
          nameLower.includes('palace') ||
          nameLower.includes('leela') ||
          nameLower.includes('taj') ||
          nameLower.includes('marriott') ||
          nameLower.includes('hyatt') ||
          nameLower.includes('oberoi') ||
          nameLower.includes('grand') ||
          nameLower.includes('radisson')
        ) {
          stars = Math.max(stars, 4);
          if (rating >= 4.2) stars = 5;
        } else if (
          nameLower.includes('hostel') ||
          nameLower.includes('dorm') ||
          nameLower.includes('guesthouse') ||
          nameLower.includes('homestay') ||
          nameLower.includes('inn') ||
          nameLower.includes('backpackers')
        ) {
          stars = Math.min(stars, 2);
        }

        // Map star rating to realistic India market room charge rates (INR)
        let pricePerNight = 4500;
        if (stars === 5) pricePerNight = Math.round(17500 + Math.random() * 8500); // 17.5k - 26k
        else if (stars === 4) pricePerNight = Math.round(7500 + Math.random() * 5000);  // 7.5k - 12.5k
        else if (stars === 3) pricePerNight = Math.round(3500 + Math.random() * 2500);  // 3.5k - 6k
        else pricePerNight = Math.round(1200 + Math.random() * 1200);                   // 1.2k - 2.4k

        // Establish amenities list based on Google place types and keywords
        const amenities = new Set<string>(['WiFi', 'AC']);
        const types = p.types || [];
        if (types.includes('spa')) amenities.add('Spa');
        if (types.includes('restaurant') || nameLower.includes('restaurant')) amenities.add('Restaurant');
        if (types.includes('bar') || nameLower.includes('bar') || nameLower.includes('pub')) amenities.add('Bar');

        if (nameLower.includes('resort') || nameLower.includes('pool') || nameLower.includes('beach')) {
          amenities.add('Pool');
        }
        if (stars >= 4) {
          amenities.add('Room Service');
          amenities.add('Parking');
        }
        if (stars === 5) {
          amenities.add('Pool');
          amenities.add('Gym');
          amenities.add('Breakfast');
        }

        return {
          name: p.name,
          price_per_night_inr: pricePerNight,
          rating: rating,
          amenities: Array.from(amenities),
          total_cost_inr: pricePerNight * nights,
          stars: stars,
          address: p.vicinity || destination,
          description: `A lovely ${stars}-star hospitality venue offering dynamic local comfort in ${p.vicinity || destination}.`,
        } satisfies GoogleHotelOption;
      });
    } catch (err: any) {
      console.warn(`[getHotelsNearby] Failed. Returning empty hotels list: ${err.message}`);
      return [];
    }
  });
}

export interface TransitDirectionsInfo {
  transit_summary: string;
  steps: string[];
  duration_min: number;
  distance_km: number;
  cab_estimate_inr: number;
  mode: 'transit' | 'driving' | 'walking';
}

/**
 * Calculates step-by-step transit or driving routes using Google Maps Directions API
 */
export async function getTransitDirections(
  origin: string,
  destination: string
): Promise<TransitDirectionsInfo> {
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY.includes('REPLACE_WITH')) {
    // If key is missing, fall back directly
    return {
      transit_summary: 'Commute via Local Transit / Cab',
      steps: ['Travel between locations via local auto/cab. Route information unavailable.'],
      duration_min: 30,
      distance_km: 12.0,
      cab_estimate_inr: 288,
      mode: 'driving',
    };
  }

  return withRetry(async () => {
    try {
      // 1. Try public transit routing first
      const transitUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=transit&key=${GOOGLE_API_KEY}`;
      const res = await fetch(transitUrl);
      const data: any = await res.json();

      if (data.status === 'OK' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const leg = route.legs[0];
        const distance_km = (leg?.distance?.value || 0) / 1000;
        const duration_min = Math.round((leg?.duration?.value || 0) / 60);

        const stepsList: string[] = [];
        const transLines: string[] = [];

        if (leg && Array.isArray(leg.steps)) {
          leg.steps.forEach((step: any) => {
            if (step.travel_mode === 'TRANSIT' && step.transit_details) {
              const details = step.transit_details;
              const lineName = details.line?.short_name || details.line?.name || 'Transit';
              const vehicleType = details.line?.vehicle?.name || 'Bus/Metro';
              const numStops = details.num_stops || 1;
              const depStop = details.departure_stop?.name || 'Station';
              const arrStop = details.arrival_stop?.name || 'Station';

              transLines.push(`${vehicleType} ${lineName}`);
              stepsList.push(`🚍 Take ${vehicleType} (${lineName}) from ${depStop} to ${arrStop} (${numStops} stops)`);
            } else if (step.travel_mode === 'WALKING') {
              const instruction = (step.html_instructions || `Walk`).replace(/<[^>]*>/g, '');
              const durText = step.duration?.text || '';
              stepsList.push(`🚶 ${instruction} (${durText})`);
            } else {
              const instruction = (step.html_instructions || `Commute`).replace(/<[^>]*>/g, '');
              stepsList.push(`➡️ ${instruction}`);
            }
          });
        }

        let transit_summary = '';
        if (transLines.length > 0) {
          transit_summary = `Public Transit via ${transLines.join(' ➔ ')}`;
        } else {
          transit_summary = `Transit commute (~${duration_min} mins)`;
        }

        const cab_estimate_inr = Math.round(distance_km * 12 * 2);

        return {
          transit_summary,
          steps: stepsList,
          duration_min,
          distance_km,
          cab_estimate_inr,
          mode: 'transit',
        };
      }

      // 2. Fall back to driving routing
      const driveUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving&key=${GOOGLE_API_KEY}`;
      const driveRes = await fetch(driveUrl);
      const driveData: any = await driveRes.json();

      if (driveData.status === 'OK' && driveData.routes && driveData.routes.length > 0) {
        const route = driveData.routes[0];
        const leg = route.legs[0];
        const distance_km = (leg?.distance?.value || 0) / 1000;
        const duration_min = Math.round((leg?.duration?.value || 0) / 60);
        const cab_estimate_inr = Math.round(distance_km * 12 * 2);

        const headingRoute = route.summary ? ` via ${route.summary}` : '';
        const transit_summary = `Drive${headingRoute} (~${duration_min} mins)`;

        const stepsList = (leg?.steps || []).map((step: any) =>
          `🚗 ${(step.html_instructions || '').replace(/<[^>]*>/g, '')}`
        ).filter(Boolean);

        return {
          transit_summary,
          steps: stepsList,
          duration_min,
          distance_km,
          cab_estimate_inr,
          mode: distance_km < 1.0 ? 'walking' : 'driving',
        };
      }

      throw new Error(`Directions status: ${data.status}`);
    } catch (err: any) {
      console.warn(`[getTransitDirections] Failed: ${err.message}. Using default coordinates.`);
      // Heuristic fallback
      return {
        transit_summary: 'Cab/Auto commute',
        steps: [`Commute from ${origin} to ${destination} via local auto/cab.`],
        duration_min: 30,
        distance_km: 10,
        cab_estimate_inr: 250,
        mode: 'driving',
      };
    }
  });
}


