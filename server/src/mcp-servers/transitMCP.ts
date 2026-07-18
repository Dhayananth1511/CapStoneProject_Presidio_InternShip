// Transit MCP Server — REAL Flight search via AviationStack + REAL Distance-based Train/Bus computation
// Uses AviationStack API for real live flight schedules.
// Uses Google Maps Distance Matrix to estimate real driving distance, travel times, 
// and ticket costs for local trains and Volvo buses.

import { withRetry } from '../utils/retry';
import { getDistanceMatrix } from './mapsMCP';
import { searchHotelbedsTransfers } from './hotelbedsTransfersMCP';
import { isHotelbedsConfigured } from './hotelbedsClient';

export interface TransportOption {
  mode: 'Train' | 'Bus' | 'Flight' | 'Transfer';
  operator: string;
  duration_hrs: number;
  cost_inr: number;       // Total cost for ALL travelers
  cost_per_traveler: number; // Cost per single traveler
  departure: string;
  arrival: string;
  rating?: number;
  amenities?: string[];
  class?: string;
  data_source?: 'live_schedule_estimated_fare' | 'estimated_fallback' | 'hotelbeds_transfers';
  distance_km?: number;
}

const IATA_MAP: Record<string, string> = {
  'delhi': 'DEL',
  'new delhi': 'DEL',
  'mumbai': 'BOM',
  'bangalore': 'BLR',
  'bengaluru': 'BLR',
  'chennai': 'MAA',
  'kolkata': 'CCU',
  'hyderabad': 'HYD',
  'cochin': 'COK',
  'kochi': 'COK',
  'goa': 'GOI',
  'panaji': 'GOI',
  'ooty': 'CBE', // Coimbatore (nearest airport)
  'manali': 'IXC', // Chandigarh
  'kullu': 'KUU',
  'jaipur': 'JAI',
  'rishikesh': 'DED', // Dehradun (nearest airport)
  'dehradun': 'DED',
  'srinagar': 'SXR',
  'leh': 'IXL',
  'port blair': 'IXZ',
  'nicobar': 'IXZ',
  'nicobar islands': 'IXZ',
  'andaman and nicobar': 'IXZ',
  'agra': 'AGR',
  'shimla': 'SLV',
  'darjeeling': 'IXB', // Bagdogra
  'pondicherry': 'PNY',
  'munnar': 'COK',
  'alleppey': 'COK',
  'alappuzha': 'COK',
  'udaipur': 'UDR',
  'lonavala': 'PNQ',
  'pune': 'PNQ',
  'amritsar': 'ATQ',
  'varanasi': 'VNS',
  'lucknow': 'LKO',
  'indore': 'IDR',
  'bhopal': 'BHO',
  'nagpur': 'NAG',
  'raipur': 'RPR',
  'bhubaneswar': 'BBI',
  'patna': 'PAT',
  'ranchi': 'IXR',
  'jammu': 'IXJ',
  'chandigarh': 'IXC',
  'coimbatore': 'CBE',
  'tiruchirapalli': 'TRZ',
  'madurai': 'IXM',
  'vizag': 'VTZ',
  'visakhapatnam': 'VTZ',
  'vijayawada': 'VGA',
  'aurangabad': 'IXU',
  'surat': 'STV',
  'ahmedabad': 'AMD',
};

function getIataCode(cityName: string): string {
  const norm = cityName.trim().toLowerCase();
  if (IATA_MAP[norm]) return IATA_MAP[norm];
  for (const [key, val] of Object.entries(IATA_MAP)) {
    if (norm.includes(key) || key.includes(norm)) {
      return val;
    }
  }
  return norm.substring(0, 3).toUpperCase();
}

// Indian domestic airline average speed: ~700 km/h
// Include check-in + boarding overhead: 2 hrs
function estimateFlightDuration(distanceKm: number): number {
  const flightHours = distanceKm / 700;
  return Math.round((flightHours + 1.5) * 10) / 10; // +1.5h overhead
}

// Price based on distance (rough domestic fare model)
function estimateFlightPrice(distanceKm: number): number {
  if (distanceKm < 500) return Math.round(2500 + Math.random() * 1500);
  if (distanceKm < 1000) return Math.round(3500 + Math.random() * 2000);
  if (distanceKm < 2000) return Math.round(4500 + Math.random() * 3000);
  return Math.round(6000 + Math.random() * 4000);
}

export async function getTransportOptions(
  origin: string,
  destination: string,
  travel_date: string,
  travelers: number = 1
): Promise<{ options: TransportOption[]; estimated_cost_inr: number; selected_option?: TransportOption; distance_km: number }> {
  return withRetry(async () => {
    const options: TransportOption[] = [];
    const isNicobar = destination.toLowerCase().includes('nicobar');

    // 1. Get real travel distance & time from Google Maps
    let distanceKm = isNicobar ? 1500 : 300;
    let durationMin = isNicobar ? 180 : 360;
    if (!isNicobar) {
      try {
        const mapsData = await getDistanceMatrix(origin, destination);
        distanceKm = mapsData.distance_km;
        durationMin = mapsData.duration_min;
      } catch {
        // Keep fallbacks if Google lookup fails
      }
    }

    // 0. Fetch real transfer options via Hotelbeds if configured
    if (isHotelbedsConfigured('transfers') && !isNicobar) {
      try {
        const transfersResult = await searchHotelbedsTransfers(origin, destination, travel_date, travelers);
        if (transfersResult && transfersResult.options && transfersResult.options.length > 0) {
          transfersResult.options.forEach((opt: any) => {
            options.push({
              mode: 'Transfer',
              operator: opt.operator,
              duration_hrs: opt.duration_hrs,
              cost_per_traveler: Math.round((opt.cost_inr * 2) / travelers), // Double for round-trip return travel
              cost_inr: opt.cost_inr * 2, // Double for round-trip return travel
              departure: opt.departure,
              arrival: opt.arrival,
              rating: 4.5,
              amenities: ['Hotel Pickup', 'Air Conditioning', 'Luggage Space'],
              class: 'Private Transfer',
              data_source: 'hotelbeds_transfers',
              distance_km: distanceKm,
            });
          });
        }
      } catch (err: any) {
        console.warn(`Hotelbeds Transfer lookup warning: ${err.message}. Bypassing transfer search.`);
      }
    }

    // 2. Fetch real flight options via AviationStack
    try {
      const apiKey = process.env.AVIATIONSTACK_API_KEY;
      if (!apiKey || apiKey.includes('REPLACE_WITH')) {
        throw new Error('AviationStack API key is not configured.');
      }

      const originIata = getIataCode(origin);
      const destIata = getIataCode(destination);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const flightUrl = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&dep_iata=${originIata}&arr_iata=${destIata}&flight_date=${travel_date}`;
      const flightRes = await fetch(flightUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      const flightData: any = await flightRes.json();

      if (flightData.data && flightData.data.length > 0) {
        const airlines: { [key: string]: boolean } = {};
        flightData.data.slice(0, 5).forEach((offer: any) => {
          const airline = offer.airline?.name || 'Airline';
          const flightCode = offer.flight?.iata || offer.flight?.number || 'Flight';
          const key = `${airline}-${flightCode}`;
          if (airlines[key]) return; // skip duplicates
          airlines[key] = true;

          const estPricePerPerson = estimateFlightPrice(distanceKm);
          const depTime = offer.departure?.scheduled?.split('T')[1]?.substring(0, 5) || '09:00';
          const arrTime = offer.arrival?.scheduled?.split('T')[1]?.substring(0, 5) || '11:00';
          const dur = estimateFlightDuration(distanceKm);

          options.push({
            mode: 'Flight',
            operator: `${airline} (${flightCode})`,
            duration_hrs: dur,
            cost_per_traveler: estPricePerPerson * 2, // Double for round-trip return travel
            cost_inr: estPricePerPerson * travelers * 2, // Double for round-trip return travel
            departure: depTime,
            arrival: arrTime,
            rating: parseFloat((4.0 + Math.random() * 0.9).toFixed(1)),
            amenities: ['In-Flight Meals', 'Baggage Allowance', 'AC', 'Entertainment'],
            class: 'Economy',
            data_source: 'live_schedule_estimated_fare',
            distance_km: distanceKm,
          });
        });
      }
    } catch (flightError: any) {
      console.warn(`Flight lookup warning: ${flightError.message}. Bypassing flight search.`);
    }
    if (!options.some((option) => option.mode === 'Flight')) {
      const fallbackFlightPricePerPerson = estimateFlightPrice(distanceKm);
      const fallbackFlightDuration = estimateFlightDuration(distanceKm);

      options.push({
        mode: 'Flight',
        operator: `${getIataCode(origin)} -> ${getIataCode(destination)} Estimated Flight`,
        duration_hrs: fallbackFlightDuration,
        cost_per_traveler: fallbackFlightPricePerPerson * 2, // Double for round-trip return travel
        cost_inr: fallbackFlightPricePerPerson * travelers * 2, // Double for round-trip return travel
        departure: '09:00',
        arrival: new Date(new Date('2000-01-01T09:00:00').getTime() + fallbackFlightDuration * 3600000)
          .toTimeString().substring(0, 5),
        rating: 3.8,
        amenities: ['Estimated Schedule', 'Cabin Bag', 'AC'],
        class: 'Economy',
        data_source: 'estimated_fallback',
        distance_km: distanceKm,
      });
    }

    // 3. Add real-distance-based Train options (multiple classes)
    if (!isNicobar) {
      const trainDuration = Math.max(0.5, Math.round((distanceKm / 60) * 10) / 10); // ~60km/h avg Indian Express
      
      // 3AC (cheapest AC tier)
      const train3ACCostPerPerson = Math.round(150 + distanceKm * 1.4);
      options.push({
        mode: 'Train',
        operator: 'Indian Railways — Superfast Express',
        duration_hrs: trainDuration,
        cost_per_traveler: train3ACCostPerPerson * 2, // Double for round-trip return travel
        cost_inr: train3ACCostPerPerson * travelers * 2, // Double for round-trip return travel
        departure: '06:15',
        arrival: new Date(new Date('2000-01-01T06:15:00').getTime() + trainDuration * 3600000)
          .toTimeString().substring(0, 5),
        rating: 3.9,
        amenities: ['AC', 'Berths', 'Pantry Car', 'Charging Port'],
        class: '3AC Sleeper',
        distance_km: distanceKm,
      });

      // 2AC (premium tier)
      const train2ACCostPerPerson = Math.round(250 + distanceKm * 2.0);
      options.push({
        mode: 'Train',
        operator: 'Indian Railways — Rajdhani / Shatabdi',
        duration_hrs: Math.max(0.5, Math.round((distanceKm / 75) * 10) / 10), // slightly faster
        cost_per_traveler: train2ACCostPerPerson * 2, // Double for round-trip return travel
        cost_inr: train2ACCostPerPerson * travelers * 2, // Double for round-trip return travel
        departure: '16:30',
        arrival: new Date(new Date('2000-01-01T16:30:00').getTime() + Math.max(0.5, Math.round((distanceKm / 75) * 10) / 10) * 3600000)
          .toTimeString().substring(0, 5),
        rating: 4.2,
        amenities: ['AC', '2-Tier Berths', 'Meals Included', 'Charging Port'],
        class: '2AC Sleeper',
        distance_km: distanceKm,
      });
    }

    // 4. Add Bus options (Volvo Sleeper & Regular AC)
    if (!isNicobar) {
      const busDuration = Math.max(0.5, Math.round((durationMin / 60 + 1.0) * 10) / 10);

      const busVolvoPerPerson = Math.round(80 + distanceKm * 2.5);
      options.push({
        mode: 'Bus',
        operator: 'Intercity Volvo — Multi-Axle Sleeper',
        duration_hrs: busDuration,
        cost_per_traveler: busVolvoPerPerson * 2, // Double for round-trip return travel
        cost_inr: busVolvoPerPerson * travelers * 2, // Double for round-trip return travel
        departure: '21:30',
        arrival: new Date(new Date('2000-01-01T21:30:00').getTime() + busDuration * 3600000)
          .toTimeString().substring(0, 5),
        rating: 4.0,
        amenities: ['AC', 'Blanket', 'Push-Back Seats', 'Charging Port'],
        class: 'Volvo Sleeper',
        distance_km: distanceKm,
      });

      const busRegularPerPerson = Math.round(50 + distanceKm * 1.6);
      options.push({
        mode: 'Bus',
        operator: 'KSRTC / State RTC — Semi-Sleeper',
        duration_hrs: Math.round((durationMin / 60 + 1.5) * 10) / 10,
        cost_per_traveler: busRegularPerPerson * 2, // Double for round-trip return travel
        cost_inr: busRegularPerPerson * travelers * 2, // Double for round-trip return travel
        departure: '22:00',
        arrival: new Date(new Date('2000-01-01T22:00:00').getTime() + Math.round((durationMin / 60 + 1.5) * 10) / 10 * 3600000)
          .toTimeString().substring(0, 5),
        rating: 3.5,
        amenities: ['AC', 'Reclining Seats', 'Water Bottle'],
        class: 'Semi-Sleeper AC',
        distance_km: distanceKm,
      });
    }

    const filteredOptions = isNicobar ? options.filter(option => option.mode === 'Flight') : options;

    const cheapestOption = filteredOptions.reduce((lowest, curr) =>
      curr.cost_inr < lowest.cost_inr ? curr : lowest, filteredOptions[0]);

    return {
      options: filteredOptions,
      estimated_cost_inr: cheapestOption?.cost_inr || 0,
      selected_option: filteredOptions[0] || null, // default select first option
      distance_km: distanceKm,
    };
  });
}

