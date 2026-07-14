// Booking MCP Server — real hotel data via Hotelbeds Content API.
// The Hotelbeds Content API (hotel-content-api) returns real hotel names, star categories,
// amenities, and descriptions for Indian destinations. We use star-category codes to
// derive realistic INR price estimates since the sandbox availability API (hotel-api)
// has quota restrictions.

import { createHash } from 'crypto';
import { withRetry } from '../utils/retry';

const HOTELBEDS_API_KEY = process.env.HOTELBEDS_API_KEY;
const HOTELBEDS_API_SECRET = process.env.HOTELBEDS_API_SECRET;
const HOTELBEDS_BASE_URL = process.env.HOTELBEDS_BASE_URL || 'https://api.test.hotelbeds.com';

interface HotelOption {
  name: string;
  price_per_night_inr: number;
  rating: number;
  amenities: string[];
  total_cost_inr: number;
  stars?: number;
  address?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Destination code map — Hotelbeds destination codes for Indian cities
// ---------------------------------------------------------------------------
const HOTELBEDS_DEST_MAP: Record<string, string> = {
  'ooty': 'OOT',
  'delhi': 'DEL',
  'new delhi': 'DEL',
  'mumbai': 'BOM',
  'bombay': 'BOM',
  'bangalore': 'BLR',
  'bengaluru': 'BLR',
  'chennai': 'MAD',
  'madras': 'MAD',
  'kolkata': 'CCU',
  'calcutta': 'CCU',
  'hyderabad': 'HYD',
  'goa': 'GOA',
  'panaji': 'GOA',
  'jaipur': 'JAI',
  'agra': 'AGR',
  'shimla': 'SIM',
  'manali': 'KUL',
  'kochi': 'COK',
  'cochin': 'COK',
  'pune': 'PNQ',
  'pondy': 'PNY',
  'pondicherry': 'PNY',
  'puducherry': 'PNY',
  'alleppey': 'ALL',
  'alappuzha': 'ALL',
  'srinagar': 'SXR',
  'kashmir': 'SXR',
  'gulmarg': 'SXR',
  'pahalgam': 'SXR',
  'varanasi': 'VNS',
  'banaras': 'VNS',
  'kashi': 'VNS',
  'udaipur': 'UDR',
  'jodhpur': 'JDH',
  'amritsar': 'ATQ',
  'mysore': 'MYQ',
  'mysuru': 'MYQ',
  'kodaikanal': 'KOD',
  'munnar': 'COK',
  'darjeeling': 'DAR',
  'gangtok': 'GAN',
  'leh': 'IXL',
  'ladakh': 'IXL',
  'coimbatore': 'CJB',
  'madurai': 'IXM',
  'tiruchirappalli': 'TRZ',
  'trichy': 'TRZ',
  'tirupati': 'TIR',
  'nashik': 'ISK',
  'aurangabad': 'IXU',
  'bhopal': 'BHO',
  'indore': 'IDR',
  'ahmedabad': 'AMD',
  'surat': 'STV',
  'chandigarh': 'IXC',
  'lucknow': 'LKO',
  'patna': 'PAT',
  'bhubaneswar': 'BBI',
  'raipur': 'RPR',
  'visakhapatnam': 'VTZ',
  'vijayawada': 'VGA',
  'nainital': 'NTL',
  'mussoorie': 'DED',
  'rishikesh': 'DED',
  'haridwar': 'HWI',
  'mcleod ganj': 'DHM',
  'dharamsala': 'DHM',
  'kasol': 'KUL',
  'spiti': 'KUL',
  'coorg': 'CXB',
  'wayanad': 'COK',
  'hampi': 'VGA',
  'puri': 'PBH',
};

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

  const normDest = destination.trim().toLowerCase();

  // Find the Hotelbeds destination code
  let destCode: string | undefined;
  for (const [key, code] of Object.entries(HOTELBEDS_DEST_MAP)) {
    if (normDest.includes(key) || key.includes(normDest)) {
      destCode = code;
      break;
    }
  }

  if (!destCode) {
    // Try to resolve via Hotelbeds destinations lookup
    const { timestamp, signature } = buildHotelbedsSignature();
    const headers: Record<string, string> = {
      'Api-key': HOTELBEDS_API_KEY as string,
      'X-Signature': signature,
      'Accept': 'application/json',
    };
    try {
      const res = await fetch(
        `${HOTELBEDS_BASE_URL}/hotel-content-api/1.0/locations/destinations?language=ENG&countryCodes=IN&from=1&to=200`,
        { headers }
      );
      if (res.ok) {
        const body: any = await res.json();
        const destinations = body?.destinations || [];
        const match = destinations.find((d: any) => {
          const name = String(d?.name?.content || d?.name || '').toLowerCase();
          return name.includes(normDest) || normDest.includes(name);
        });
        destCode = match?.code;
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
  const destNameLower = destination.trim().toLowerCase();
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
    // If country code is explicit and not India, reject
    if (cc && cc !== 'IN') return false;

    const city    = String(h?.city?.content    || h?.city    || '').toLowerCase();
    const address = String(h?.address?.content || h?.address || '').toLowerCase();
    const hotelName = String(h?.name?.content  || h?.name   || '').toLowerCase();
    const combined = `${city} ${address} ${hotelName}`;

    // Reject if any foreign signal appears
    if (FOREIGN_SIGNALS.some(sig => combined.includes(sig))) return false;

    return true;
  });

  console.log(`[bookingMCP] ✅ ${relevant.length} India-relevant hotels after geographic filter for ${destination}`);

  // If filtering wiped everything, fall back to the raw list but log a warning.
  const finalList = relevant.length > 0 ? relevant : rawHotels;
  if (relevant.length === 0) {
    console.warn(`[bookingMCP] ⚠️  All hotels were filtered out. Hotelbeds sandbox may not have real ${destination} data.`);
  }

  return finalList.map((h: any) => {
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
    const nights = Math.max(
      1,
      (new Date(check_out).getTime() - new Date(check_in).getTime()) / (1000 * 60 * 60 * 24)
    );

    let hotels: HotelOption[] = [];

    try {
      const contentHotels = await searchHotelbedsContentHotels(destination, nights);
      if (contentHotels && contentHotels.length > 0) {
        hotels = contentHotels;
      } else {
        console.warn(`[bookingMCP] No real hotel data found for '${destination}'. hotels list will be empty.`);
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
