// Budget Agent — the number cruncher. Takes all cost estimates from the parallel
// agents and builds a breakdown. Adds 10% emergency fund. Checks if total is
// within the user's stated budget. If over by >20%, returns alternatives.

import { TripContext } from './plannerAgent';

export interface BudgetBreakdown {
  transport: number;
  accommodation: number;
  food: number;
  activities: number;
  local_transport: number;
  emergency_fund: number;
  total_cost_inr: number;
  remaining_budget_inr: number;
  is_feasible: boolean;
  alternatives?: string[];
  source_details?: {
    transport?: { mode?: string; operator?: string; cost_inr: number };
    accommodation?: { hotel?: string; price_per_night_inr?: number; nights: number; cost_inr: number };
    activities?: { attraction_count: number; fee_per_person_inr: number; cost_inr: number };
    local_transport?: { cost_inr: number };
    food?: { cost_inr: number; per_person_per_day_inr: number; days: number; source?: string };
  };
}

function parseFirstNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const match = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
    if (match) {
      return Number(match[0]);
    }
  }

  return 0;
}

function calculateTripDays(input: TripContext['input']): number {
  if (input.start_date && input.end_date) {
    const diffMs = new Date(input.end_date).getTime() - new Date(input.start_date).getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays);
  }

  if (input.duration_days && input.duration_days > 0) {
    return Math.max(1, Math.ceil(input.duration_days));
  }

  return 5;
}

function getCheapestTransportCost(transport: TripContext['transport']): { cost: number; mode?: string; operator?: string } {
  const options = Array.isArray(transport?.options) ? transport.options : [];

  if (options.length > 0) {
    const cheapest = options.reduce((lowest: any, current: any) => {
      const lowestCost = parseFirstNumber(lowest?.cost_inr);
      const currentCost = parseFirstNumber(current?.cost_inr);
      return currentCost < lowestCost ? current : lowest;
    });

    return {
      cost: parseFirstNumber(cheapest?.cost_inr),
      mode: cheapest?.mode,
      operator: cheapest?.operator,
    };
  }

  return { cost: parseFirstNumber(transport?.estimated_cost_inr) };
}

function getAccommodationCost(accommodation: TripContext['accommodation'], nights: number): { cost: number; hotel?: string; pricePerNight?: number } {
  const chosenHotel = accommodation?.selected_hotel || 
    (Array.isArray(accommodation?.hotels) && accommodation.hotels.find((h: any) => h.name === accommodation?.recommended)) ||
    (Array.isArray(accommodation?.hotels) && accommodation.hotels[0]);

  if (chosenHotel) {
    const pricePerNight = parseFirstNumber(chosenHotel?.price_per_night_inr || chosenHotel?.price_per_night);
    const totalCost = parseFirstNumber(chosenHotel?.total_cost_inr) || pricePerNight * nights;

    return {
      cost: totalCost,
      hotel: chosenHotel?.name,
      pricePerNight,
    };
  }

  if (accommodation?.price_per_night) {
    const pricePerNight = parseFirstNumber(accommodation.price_per_night);
    return {
      cost: pricePerNight * nights,
      hotel: accommodation.recommended,
      pricePerNight,
    };
  }

  return { cost: 0 };
}

function getFoodCost(activities: TripContext['activities'], travelers: number, days: number): { cost: number; perPersonPerDay: number; source: string } {
  const restaurantOptions = Array.isArray((activities as any)?.restaurant_options)
    ? (activities as any).restaurant_options
    : [];

  const priceLevels = restaurantOptions
    .map((restaurant: any) => parseFirstNumber(restaurant?.price_level))
    .filter((level: number) => level > 0);

  if (priceLevels.length > 0) {
    const averagePriceLevel = priceLevels.reduce((sum: number, level: number) => sum + level, 0) / priceLevels.length;
    const perPersonPerDay = Math.round(325 + (averagePriceLevel * 210));
    return {
      cost: perPersonPerDay * travelers * days,
      perPersonPerDay,
      source: 'google_places_restaurant_price_level',
    };
  }

  const restaurantCount = Array.isArray(activities?.restaurants) ? activities.restaurants.length : 0;
  const perPersonPerDay = restaurantCount > 0 ? 425 : 500;
  return {
    cost: perPersonPerDay * travelers * days,
    perPersonPerDay,
    source: restaurantCount > 0 ? 'google_places_restaurant_presence' : 'fallback_default',
  };
}

export async function runBudgetAgent(context: TripContext): Promise<BudgetBreakdown> {
  const { input, transport, accommodation, activities, local_transport } = context;
  const budget = input.budget_inr || 30000;
  const travelers = input.travelers || 1;

  // Calculate inclusive/exclusive travel periods timezone-safely
  let nights = 5;
  let days = 6;
  if (input.start_date && input.end_date) {
    const [startY, startM, startD] = input.start_date.split('-').map(Number);
    const [endY, endM, endD] = input.end_date.split('-').map(Number);
    const startMs = Date.UTC(startY, startM - 1, startD);
    const endMs = Date.UTC(endY, endM - 1, endD);
    nights = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
    days = nights + 1;
  } else if (input.duration_days && input.duration_days > 0) {
    days = Math.max(1, Math.ceil(input.duration_days));
    nights = Math.max(1, days - 1);
  }

  // Use real search outputs when available, and only fall back to zero if a provider failed.
  const transportSelection = getCheapestTransportCost(transport);
  const accommodationSelection = getAccommodationCost(accommodation, nights);

  const foodSelection = getFoodCost(activities, travelers, days);

  const attractionsCount = Array.isArray(activities?.attractions) ? activities.attractions.length : 0;
  const feePerPerson = parseFirstNumber(activities?.entry_fees);
  const activityVisits = Math.max(1, Math.min(attractionsCount || days, days));
  const activityCost = feePerPerson > 0 ? feePerPerson * travelers * activityVisits : 0;

  // Real cab calculation fallback of ₹300 per traveler per day (up to ₹1200 maximum per day per cab grouping)
  const calculatedLocalTransport = parseFirstNumber(local_transport?.cab_estimate_inr);
  const cabsNeeded = Math.ceil(travelers / 4);
  const localTransportCost = calculatedLocalTransport > 0 
    ? calculatedLocalTransport 
    : Math.round(Math.min(300 * travelers, 1200 * cabsNeeded) * days);

  const subtotal = transportSelection.cost + accommodationSelection.cost + foodSelection.cost + activityCost + localTransportCost;
  
  // Emergency fund = 10% of subtotal for unexpected expenses
  const emergencyFund = Math.round(subtotal * 0.1);
  const totalCost = subtotal + emergencyFund;

  const isFeasible = totalCost <= budget;
  const breakdown: BudgetBreakdown = {
    transport: transportSelection.cost,
    accommodation: accommodationSelection.cost,
    food: foodSelection.cost,
    activities: activityCost,
    local_transport: localTransportCost,
    emergency_fund: emergencyFund,
    total_cost_inr: totalCost,
    remaining_budget_inr: budget - totalCost,
    is_feasible: isFeasible,
    source_details: {
      transport: {
        mode: transportSelection.mode,
        operator: transportSelection.operator,
        cost_inr: transportSelection.cost,
      },
      accommodation: {
        hotel: accommodationSelection.hotel,
        price_per_night_inr: accommodationSelection.pricePerNight,
        nights,
        cost_inr: accommodationSelection.cost,
      },
      activities: {
        attraction_count: attractionsCount,
        fee_per_person_inr: feePerPerson,
        cost_inr: activityCost,
      },
      local_transport: {
        cost_inr: localTransportCost,
      },
      food: {
        cost_inr: foodSelection.cost,
        per_person_per_day_inr: foodSelection.perPersonPerDay,
        days,
        source: foodSelection.source,
      },
    },
  };

  // If way over budget, suggest realistic alternatives
  if (!isFeasible) {
    const alternatives: string[] = [];
    const currentCategory = accommodation?.selected_category || (accommodation?.selected_hotel?.name === 'Self Arranged' ? 'skipped' : undefined);

    if (accommodationSelection.cost > 0 && currentCategory !== 'budget' && currentCategory !== 'skipped') {
      alternatives.push(`Choose a cheaper hotel tier (saves approx. ₹${Math.round(accommodationSelection.cost * 0.4)})`);
    }

    alternatives.push(`Reduce duration of trip by 1 or 2 days (saves approx. ₹${Math.round(((foodSelection.cost + localTransportCost) / Math.max(1, days)) * 1.5)})`);
    alternatives.push(`Increase limit to ₹${totalCost} for comfortable traveling accommodations`);

    breakdown.alternatives = alternatives;
  }

  return breakdown;
}
