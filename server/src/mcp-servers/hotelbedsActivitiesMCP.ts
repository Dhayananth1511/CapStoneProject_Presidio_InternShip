import { hotelbedsRequest, isHotelbedsConfigured } from './hotelbedsClient';
import { parseFirstNumber } from '../utils/numberHelpers';

export interface HotelbedsActivityOption {
  name: string;
  price_per_person_inr: number;
  rating?: number;
  duration_hours?: number;
  categories?: string[];
}


function flattenItems(payload: any): any[] {
  const candidates = [
    payload?.activities,
    payload?.data,
    payload?.activities?.activities,
    payload?.result,
    payload?.items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

export async function searchHotelbedsActivities(
  destination: string,
  interests: string[],
  days: number,
  travelers: number
): Promise<{ attractions: string[]; restaurants: string[]; restaurant_options: Array<{ name: string; price_level?: number }>; entry_fees: string; hotelbeds_activities: HotelbedsActivityOption[] }> {
  if (!isHotelbedsConfigured('activities')) {
    throw new Error('Hotelbeds activities credentials are not configured');
  }

  const path = process.env.HOTELBEDS_ACTIVITIES_PATH || '/activity-api/3.0/activities';

  const payload = {
    destination,
    search: {
      destinationName: destination,
      interests,
      days,
      travelers,
    },
    language: 'en',
    paxes: [{ adults: Math.max(1, travelers), children: 0 }],
  };

  const response = await hotelbedsRequest<any>('activities', path, payload);
  const rawItems = flattenItems(response);

  const hotelbedsActivities = rawItems.slice(0, Math.min(days * 3, 10)).map((item: any) => {
    const price = parseFirstNumber(item?.price?.amount || item?.priceFrom || item?.fromPrice || item?.rates?.[0]?.price?.amount || item?.rates?.[0]?.amount);
    return {
      name: item?.name || item?.title || item?.activityName || 'Activity',
      price_per_person_inr: price,
      rating: parseFirstNumber(item?.rating || item?.score),
      duration_hours: parseFirstNumber(item?.duration || item?.durationHours),
      categories: Array.isArray(item?.categories) ? item.categories : [],
    } satisfies HotelbedsActivityOption;
  });

  const attractions = hotelbedsActivities.map((activity) => activity.name);
  const priceCandidates = hotelbedsActivities
    .map((activity) => activity.price_per_person_inr)
    .filter((value) => value > 0);
  const entryFeesPerPerson = priceCandidates.length > 0
    ? Math.round(priceCandidates.reduce((sum, value) => sum + value, 0) / priceCandidates.length)
    : 0;

  return {
    attractions,
    restaurants: [],
    restaurant_options: [],
    entry_fees: entryFeesPerPerson > 0 ? `₹${entryFeesPerPerson} per person (Hotelbeds activity rate)` : '₹0',
    hotelbeds_activities: hotelbedsActivities,
  };
}