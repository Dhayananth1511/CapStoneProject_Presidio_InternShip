// Budget Agent — the number cruncher. Takes all cost estimates from the parallel
// agents and builds a breakdown. Adds 10% emergency fund. Checks if total is
// within the user's stated budget. If over by >20%, returns alternatives.

import { TripContext } from './plannerAgent';

export interface BudgetBreakdown {
  transport: number;
  accommodation: number;
  food: number;
  activities: number;
  local_transport?: number;
  emergency_fund: number;
  total_cost_inr: number;
  remaining_budget_inr: number;
  is_feasible: boolean;
  alternatives?: string[];
  source_details?: {
    transport?: { mode?: string; operator?: string; cost_inr: number };
    accommodation?: { hotel?: string; price_per_night_inr?: number; nights: number; cost_inr: number };
    activities?: { attraction_count: number; fee_per_person_inr: number; cost_inr: number };
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
  if (transport?.selected_option) {
    return {
      cost: parseFirstNumber(transport.selected_option.cost_inr),
      mode: transport.selected_option.mode,
      operator: transport.selected_option.operator,
    };
  }

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
  const { input, transport, accommodation, activities } = context;
  const budget = input.budget_inr || 30000;
  const days = calculateTripDays(input);
  const nights = Math.max(1, days);

  // Use real search outputs when available, and only fall back to zero if a provider failed.
  const transportSelection = getCheapestTransportCost(transport);
  const accommodationSelection = getAccommodationCost(accommodation, nights);
  const travelers = input.travelers || 1;

  const foodSelection = getFoodCost(activities, travelers, days);

  const attractionsCount = Array.isArray(activities?.attractions) ? activities.attractions.length : 0;
  const feePerPerson = parseFirstNumber(activities?.entry_fees);
  const activityVisits = Math.max(1, Math.min(attractionsCount || days, days));
  const activityCost = feePerPerson > 0 ? feePerPerson * travelers * activityVisits : 0;

  // Calculate local transport cost: either use existing calculated value or estimate as ₹350 per traveler per day.
  let localTransportCost = 0;
  if (context.local_transport?.daily_budget_estimate) {
    localTransportCost = Number(context.budget?.local_transport) || (context.local_transport.daily_budget_estimate * days);
  } else if (context.budget?.local_transport) {
    localTransportCost = Number(context.budget.local_transport);
  } else {
    localTransportCost = 350 * travelers * days;
  }

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
    const suggestedBudgetWithBuffer = Math.ceil(totalCost * 1.15);
    const alternatives: string[] = [];
    const selectedTier = accommodation?.selected_category || 'mid_range';

    // 1. Choose a cheaper hotel tier (only if not already budget and not skipped)
    if (selectedTier !== 'budget' && selectedTier !== 'skipped' && accommodationSelection.cost > 0) {
      alternatives.push(`Choose a cheaper hotel tier (saves approx. ₹${Math.round(accommodationSelection.cost * 0.4)})`);
    }

    // 2. Skip lodgings (only if not already skipped and has cost)
    if (selectedTier !== 'skipped' && accommodationSelection.cost > 0) {
      alternatives.push(`Skip lodgings: arrange accommodation yourself (saves ₹${Math.round(accommodationSelection.cost)})`);
    }

    // 3. Shorten duration (only if days > 2)
    if (days > 2) {
      alternatives.push(`Reduce duration of trip by 1 or 2 days (saves approx. ₹${Math.round((foodSelection.cost / Math.max(1, days)) * 1.5)})`);
    }

    // 4. Reduce travelers count (only if travelers > 1)
    if (travelers > 1) {
      alternatives.push(`Reduce travelers count from ${travelers} to ${travelers - 1} (saves approx. ₹${Math.round(totalCost / travelers)})`);
    }

    // 5. Limit sightseeing (only if activityCost > 0)
    if (activityCost > 0) {
      alternatives.push(`Focus on free tourist attractions (saves up to ₹${Math.round(activityCost)})`);
    }

    // 6. Increase budget limit (always include)
    alternatives.push(`Increase limit to ₹${suggestedBudgetWithBuffer} for comfortable traveling accommodations`);

    breakdown.alternatives = alternatives;
  }

  return breakdown;
}
