import { hotelbedsRequest, isHotelbedsConfigured } from './hotelbedsClient';
import { parseFirstNumber } from '../utils/numberHelpers';

export interface HotelbedsTransferOption {
  mode: 'Transfer';
  operator: string;
  duration_hrs: number;
  cost_inr: number;
  departure: string;
  arrival: string;
}


function flattenItems(payload: any): any[] {
  const candidates = [payload?.transfers, payload?.data, payload?.items, payload?.result];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

export async function searchHotelbedsTransfers(
  origin: string,
  destination: string,
  travel_date: string,
  travelers: number
): Promise<{ options: HotelbedsTransferOption[]; estimated_cost_inr: number }> {
  if (!isHotelbedsConfigured('transfers')) {
    throw new Error('Hotelbeds transfers credentials are not configured');
  }

  const path = process.env.HOTELBEDS_TRANSFERS_PATH || '/transfer-api/1.0/availability';

  const payload = {
    language: 'en',
    transferDetail: {
      from: origin,
      to: destination,
      date: travel_date,
      travelers: Math.max(1, travelers),
    },
    paxes: [{ adults: Math.max(1, travelers), children: 0 }],
  };

  const response = await hotelbedsRequest<any>('transfers', path, payload);
  const rawItems = flattenItems(response);

  const options = rawItems.slice(0, 5).map((item: any) => {
    const price = parseFirstNumber(item?.price?.amount || item?.amount || item?.net || item?.total || item?.rate);
    const duration = parseFirstNumber(item?.duration || item?.durationHours || item?.transferTime) || 1.5;

    return {
      mode: 'Transfer' as const,
      operator: item?.name || item?.companyName || item?.serviceName || 'Hotelbeds Transfer',
      duration_hrs: duration,
      cost_inr: price > 0 ? price : 0,
      departure: item?.departure || '09:00',
      arrival: item?.arrival || '10:30',
    } satisfies HotelbedsTransferOption;
  }).filter((option) => option.cost_inr > 0);

  const estimated_cost_inr = options.length > 0
    ? Math.min(...options.map((option) => option.cost_inr))
    : 0;

  return { options, estimated_cost_inr };
}