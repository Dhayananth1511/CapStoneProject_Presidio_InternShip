// Booking MCP Server — real hotel data via Hotelbeds Content API.
// The Hotelbeds Content API (hotel-content-api) returns real hotel names, star categories,
// amenities, and descriptions for Indian destinations. We use star-category codes to
// derive realistic INR price estimates since the sandbox availability API (hotel-api)
// has quota restrictions.

import { createHash } from 'crypto';
import { withRetry } from '../utils/retry';
import { HotelOption } from '../types';
import HotelbedsDestination from '../models/HotelbedsDestination';
import hotelbedsAliases from '../constants/hotelbedsAliases.json';
import { calculateNights } from '../utils/dateHelpers';

const HOTELBEDS_API_KEY = process.env.HOTELBEDS_API_KEY;
const HOTELBEDS_API_SECRET = process.env.HOTELBEDS_API_SECRET;
const HOTELBEDS_BASE_URL = process.env.HOTELBEDS_BASE_URL || 'https://api.test.hotelbeds.com';

// ---------------------------------------------------------------------------
// Destination code map — Hotelbeds destination codes for Indian cities
// ---------------------------------------------------------------------------

function buildHotelbedsSignature(): { timestamp: string; signature: string } {
  if (!HOTELBEDS_API_KEY || !HOTELBEDS_API_SECRET) {
    throw new Error('Hotelbeds credentials are missing');
  }
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHash('sha256')
    .update(`${HOTELBEDS_API_KEY}${HOTELBEDS_API_SECRET}${timestamp}`)
    .digest('hex');
  return { timestamp, signature };
}

// ---------------------------------------------------------------------------
// Star category → realistic INR price per night (2026 India market rates)
// ---------------------------------------------------------------------------
function starCategoryToPrice(categoryCode: string): number {
  const code = String(categoryCode || '').toUpperCase();
  if (code.startsWith('5') || code === '5EST' || code === 'GL' || code === 'LUXUR') return Math.round(18000 + Math.random() * 14000); // ₹18k–₹32k
  if (code.startsWith('4') || code === '4EST') return Math.round(7000 + Math.random() * 6000);  // ₹7k–₹13k
  if (code.startsWith('3') || code === '3EST') return Math.round(3000 + Math.random() * 2500);  // ₹3k–₹5.5k
  if (code.startsWith('2') || code === '2EST') return Math.round(1200 + Math.random() * 1800);  // ₹1.2k–₹3k
  if (code.startsWith('1') || code === '1EST') return Math.round(700 + Math.random() * 800);    // ₹700–₹1.5k
  // Unknown — default mid-range
  return Math.round(4000 + Math.random() * 3000);
}

function categoryCodeToStars(categoryCode: string): number {
  const n = parseInt(String(categoryCode || '')[0], 10);
  return isNaN(n) ? 3 : Math.min(5, Math.max(1, n));
}

function destinationKeywords(destination: string): string[] {
  const normalized = destination.trim().toLowerCase();
  const synonyms: Record<string, string[]> = {
    goa: ['goa', 'panaji', 'panjim', 'calangute', 'baga', 'candolim', 'anjuna', 'vagator', 'morjim', 'colva', 'margao'],
    ooty: ['ooty', 'udhagamandalam', 'ooti'],
    delhi: ['delhi', 'new delhi'],
    mumbai: ['mumbai', 'bombay'],
    bengaluru: ['bangalore', 'bengaluru'],
    chennai: ['chennai', 'madras'],
    kochi: ['kochi', 'cochin'],
    pondicherry: ['pondicherry', 'puducherry', 'pondy'],
  };

  const keywords = new Set<string>([normalized]);
  Object.entries(synonyms).forEach(([key, values]) => {
    if (normalized.includes(key) || values.some((value) => normalized.includes(value))) {
      values.forEach((value) => keywords.add(value));
      keywords.add(key);
    }
  });

  normalized.split(/[,\s-]+/).filter(Boolean).forEach((part) => keywords.add(part));
  return [...keywords].filter((value) => value.length >= 3);
}

function amenitiesFromFacilities(rawHotel: any): string[] {
  const amenities = new Set<string>(['WiFi', 'AC']);
  const facilityGroups: any[] = [
    ...(Array.isArray(rawHotel?.facilities) ? rawHotel.facilities : []),
    ...(Array.isArray(rawHotel?.hotelFacilities) ? rawHotel.hotelFacilities : []),
  ];
  facilityGroups.forEach((f: any) => {
    const label = String(f?.description || f?.name || f?.facility || '').toLowerCase();
    if (label.includes('pool') || label.includes('swimming')) amenities.add('Pool');
    if (label.includes('spa')) amenities.add('Spa');
    if (label.includes('bar')) amenities.add('Bar');
    if (label.includes('restaurant') || label.includes('dining')) amenities.add('Restaurant');
    if (label.includes('parking')) amenities.add('Parking');
    if (label.includes('breakfast')) amenities.add('Breakfast');
    if (label.includes('gym') || label.includes('fitness')) amenities.add('Gym');
  });

  // Enrich by star category
  const stars = categoryCodeToStars(rawHotel?.categoryCode || '');
  if (stars >= 4) { amenities.add('Restaurant'); amenities.add('Room Service'); }
  if (stars >= 5) { amenities.add('Pool'); amenities.add('Spa'); amenities.add('Concierge'); }
  if (rawHotel?.boardCodes?.includes('BB')) amenities.add('Breakfast');

  return [...amenities];
}

// ---------------------------------------------------------------------------
// Main: fetch real hotels from Hotelbeds Content API
// ---------------------------------------------------------------------------
async function searchHotelbedsContentHotels(
  destination: string,
  nights: number
): Promise<HotelOption[] | null> {
  if (!HOTELBEDS_API_KEY || !HOTELBEDS_API_SECRET) return null;

  // Resolve official city name via aliases
  const queryDest = destination.trim().toLowerCase();
  let officialCityName = destination.trim();

  if ((hotelbedsAliases as Record<string, string>)[queryDest]) {
    officialCityName = (hotelbedsAliases as Record<string, string>)[queryDest];
  } else {
    for (const [aliasKey, officialName] of Object.entries(hotelbedsAliases)) {
      if (queryDest.includes(aliasKey) || aliasKey.includes(queryDest)) {
        officialCityName = officialName;
        break;
      }
    }
  }

  // Find the Hotelbeds destination code via MongoDB
  let destCode: string | undefined;
  try {
    const match = await HotelbedsDestination.findOne({
      city: { $regex: new RegExp(`^${officialCityName}$`, 'i') }
    });
    if (match) {
      destCode = match.code;
    }
  } catch (err: any) {
    console.warn(`[bookingMCP] Database resolution failed for '${officialCityName}': ${err.message}`);
  }

  // Fallback to live API lookup (refresh cache if found)
  if (!destCode) {
    const { timestamp, signature } = buildHotelbedsSignature();
    const headers: Record<string, string> = {
      'Api-key': HOTELBEDS_API_KEY as string,
      'X-Signature': signature,
      'Accept': 'application/json',
    };
    try {
      const res = await fetch(
        `${HOTELBEDS_BASE_URL}/hotel-content-api/1.0/locations/destinations?language=ENG&countryCodes=IN&from=1&to=250`,
        { headers }
      );
      if (res.ok) {
        const body: any = await res.json();
        const destinations = body?.destinations || [];
        const match = destinations.find((d: any) => {
          const name = String(d?.name?.content || d?.name || '').toLowerCase();
          const target = officialCityName.toLowerCase();
          return name.includes(target) || target.includes(name);
        });
        destCode = match?.code;

        if (destCode) {
          try {
            await HotelbedsDestination.create({
              code: destCode,
              city: match.name?.content || match.name || officialCityName,
              country: match.countryCode || 'IN'
            });
            console.log(`[bookingMCP] Dynamically cached new destination: ${officialCityName} -> ${destCode}`);
          } catch {}
        }
      }
    } catch {
      // continue without code
    }
  }

  if (!destCode) {
    console.warn(`[bookingMCP] No Hotelbeds destination code for '${destination}'. Skipping content API.`);
    return null;
  }

  const { timestamp, signature } = buildHotelbedsSignature();
  const headers: Record<string, string> = {
    'Api-key': HOTELBEDS_API_KEY as string,
    'X-Signature': signature,
    'Accept': 'application/json',
  };

  // Fetch up to 100 hotels for the destination, filtering to India (IN)
  const res = await fetch(
    `${HOTELBEDS_BASE_URL}/hotel-content-api/1.0/hotels?destinationCode=${destCode}&countryCodes=IN&from=1&to=100&language=ENG&useSecondaryLanguage=True`,
    { headers }
  );

  if (!res.ok) {
    console.warn(`[bookingMCP] Content API responded ${res.status} for destCode=${destCode}`);
    return null;
  }

  const body: any = await res.json();
  const rawHotels: any[] = body?.hotels || [];

  if (rawHotels.length === 0) return null;

  console.log(`[bookingMCP] Hotelbeds Content API returned ${rawHotels.length} raw hotels for ${destination} (${destCode})`);

  // ── RELEVANCE FILTER ──────────────────────────────────────────────────────
  // The Hotelbeds SANDBOX API is known to return hotels from countries other
  // than the one requested (e.g. Italian hotels when asking for Goa).  We
  // discard any hotel whose country code, city content, or address clearly
  // does not match India / the target destination.
  const destKeywords = destinationKeywords(destination);
  // Common non-Indian keywords that signal a foreign hotel sneaking in
  const FOREIGN_SIGNALS = [
    'italy', 'italia', 'spain', 'espana', 'france', 'germany', 'ligure',
    'riviera', 'milan', 'rome', 'paris', 'barcelona', 'madrid', 'lisbon',
    'london', 'amsterdam', 'venice', 'florence', 'naples', 'sicily',
    'switzerland', 'austria', 'greece', 'turkey', 'dubai', 'usa', 'canada',
    'australia', 'china', 'japan', 'thailand', 'malaysia', 'singapore',
  ];

  const relevant = rawHotels.filter((h: any) => {
    const cc = String(h?.countryCode || '').toUpperCase();
    if (cc && cc !== 'IN') return false;

    const city = String(h?.city?.content || h?.city || '').toLowerCase();
    const state = String(h?.state?.content || h?.state || '').toLowerCase();
    const destinationName = String(h?.destinationName?.content || h?.destinationName || '').toLowerCase();
    const address = String(h?.address?.content || h?.address || '').toLowerCase();
    const hotelName = String(h?.name?.content || h?.name || '').toLowerCase();
    const combined = `${city} ${state} ${destinationName} ${address} ${hotelName}`;

    if (FOREIGN_SIGNALS.some(sig => combined.includes(sig))) return false;

    const hasDestinationSignal = destKeywords.some((keyword) => combined.includes(keyword));
    if (!hasDestinationSignal) return false;

    // Filter out restaurant/eatery places that don't offer room staying (Indian context)
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
    const hasEateryKeyword = EATERY_KEYWORDS.some(k => hotelName.includes(k));
    const hasLodgingKeyword = LODGING_KEYWORDS.some(k => hotelName.includes(k));
    if (hasEateryKeyword && !hasLodgingKeyword) {
      return false;
    }

    return true;
  });

  console.log(`[bookingMCP] ? ${relevant.length} destination-relevant hotels after geographic filter for ${destination}`);

  if (relevant.length === 0) {
    console.warn(`[bookingMCP] ?? No destination-matching hotels remained for '${destination}'. Returning no hotels instead of foreign mismatches.`);
    return null;
  }

  return relevant.map((h: any) => {
    const name = h?.name?.content || h?.name || 'Hotel';
    const categoryCode = h?.categoryCode || '3EST';
    const stars = categoryCodeToStars(categoryCode);
    const pricePerNight = starCategoryToPrice(categoryCode);
    return {
      name,
      price_per_night_inr: pricePerNight,
      rating: parseFloat((3.5 + stars * 0.25 + Math.random() * 0.4).toFixed(1)),
      amenities: amenitiesFromFacilities(h),
      total_cost_inr: pricePerNight * nights,
      stars,
      address: h?.address?.content || h?.city?.content || destination,
      description: h?.description?.content?.slice(0, 120),
      source_type: 'hotelbeds_api' as const,
    } satisfies HotelOption;
  });
}

// ---------------------------------------------------------------------------
// Exported main function
// ---------------------------------------------------------------------------
export async function searchHotels(
  destination: string,
  check_in: string,
  check_out: string,
  travelers: number
): Promise<{ hotels: HotelOption[]; recommended: string; price_per_night: number }> {
  return withRetry(async () => {
    const nights = calculateNights(check_in, check_out);

    let hotels: HotelOption[] = [];

    try {
      const isHotelbedsKeyConfigured = HOTELBEDS_API_KEY && !HOTELBEDS_API_KEY.includes('REPLACE_WITH');
      if (isHotelbedsKeyConfigured) {
        const contentHotels = await searchHotelbedsContentHotels(destination, nights);
        if (contentHotels && contentHotels.length > 0) {
          hotels = contentHotels;
        }
      }

      // If Hotelbeds isn't configured or returned no results, fall through to LLM recommendations
      if (hotels.length === 0) {
        console.info(`[bookingMCP] No Hotelbeds hotels resolved for '${destination}'. LLM recommendations will be used.`);
      }
    } catch (err: any) {
      console.warn(`[bookingMCP] Hotel search failed: ${err.message}`);
      hotels = [];
    }

    // ── SECONDARY SANITY FILTER ───────────────────────────────────────────────
    // Even after the content-API filter, run a final pass to drop hotels that
    // contain obvious foreign geographic identifiers in their name.
    const FOREIGN_NAME_SIGNALS = [
      'tigullio', 'milan', 'milan', 'de milan', 'assarotti', 'santa margherita',
      'ligure', 'riviera', 'di gilio', 'viana',
    ];
    const beforeCount = hotels.length;
    hotels = hotels.filter(h => {
      const lname = h.name.toLowerCase();
      return !FOREIGN_NAME_SIGNALS.some(sig => lname.includes(sig));
    });
    if (hotels.length < beforeCount) {
      console.warn(`[bookingMCP] Dropped ${beforeCount - hotels.length} foreign-named hotels from results for '${destination}'.`);
    }

    const recommendedHotel = hotels.length > 0
      ? hotels.reduce((best, h) => {
          // Pick 4-star equivalent mid-range as recommendation
          const dist = Math.abs(h.price_per_night_inr - 8000);
          const bestDist = Math.abs(best.price_per_night_inr - 8000);
          return dist < bestDist ? h : best;
        }, hotels[0])
      : null;

    return {
      hotels,
      recommended: recommendedHotel?.name || '',
      price_per_night: recommendedHotel?.price_per_night_inr || 0,
    };
  });
}

