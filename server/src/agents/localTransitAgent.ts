// Local Transit Agent — Calculates hotel-to-attraction distances and commute costs.
// This is a dedicated agent in the swarm, not a utility function.
// It calls the calculateLocalTransit MCP tool in mapsMCP.ts.
// It always re-runs when the hotel or itinerary changes.


import { TripContext } from '../types';
import { getTransitDirections } from '../mcp-servers/mapsMCP';
import logger from '../utils/logger';

// ─── Smart deterministic fallback ──────────────────────────────────────────
// Returns a stable, varied distance based on names (not random) so re-runs
// of the same hotel+attraction pair always give the same estimate.
function getSmartFallback(hotelName: string, placeName: string): { distance_km: number; duration_min: number } {
  let hash = 0;
  const combined = `${hotelName}_to_${placeName}`;
  for (let i = 0; i < combined.length; i++) {
    hash = combined.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  const distance_km = parseFloat((1.5 + (hash % 106) / 10).toFixed(1));
  const duration_min = Math.round(distance_km * 2.2 + 3);
  return { distance_km, duration_min };
}

// ─── Core enrichment logic (moved from localTransitEnricher.ts) ─────────────
export interface LocalTransitResult {
  itinerary: any;
  budget: any;
  local_transport: any;
}

export async function runLocalTransitAgent(
  itinerary: { days: any[]; notes: string },
  context: TripContext
): Promise<LocalTransitResult> {
  if (!itinerary || !Array.isArray(itinerary.days) || itinerary.days.length === 0) {
    return { itinerary, budget: context.budget, local_transport: {} };
  }

  const { accommodation, input } = context;
  const destination = input.destination || 'City Center';

  // Prefer confirmed hotel selection, fall back to recommended
  const hotelName =
    accommodation?.selected_hotel?.name ||
    accommodation?.recommended ||
    'Hotel';

  logger.info(`[LocalTransitAgent] Calculating transit from hotel: "${hotelName}" in ${destination}`);

  // Transit hub of the destination city (departure/arrival place)
  const transportMode = context.transport?.selected_option?.mode || 'Flight';
  let hubName = 'Airport';
  if (transportMode === 'Train') {
    hubName = 'Junction Railway Station';
  } else if (transportMode === 'Bus') {
    hubName = 'Central Bus Station';
  }
  const hubFullName = `${destination} ${hubName}`;

  // ── Collect unique non-hotel locations from the itinerary ──────────────
  const locationsToResolve = new Set<string>();
  locationsToResolve.add(hubFullName);

  itinerary.days.forEach((day: any) => {
    if (Array.isArray(day.schedule)) {
      day.schedule.forEach((item: any) => {
        const loc = (item.location || '').trim();
        if (!loc) return;
        const isHotelLocation =
          loc.toLowerCase().includes('hotel') ||
          loc.toLowerCase().includes('resort') ||
          loc.toLowerCase().includes('check-in') ||
          loc.toLowerCase().includes('stay') ||
          loc.toLowerCase() === hotelName.toLowerCase();
        if (!isHotelLocation) {
          locationsToResolve.add(loc);
        }
      });
    }
  });

  // ── Resolve distances in parallel via Geoapify → fallback ─────────────
  const distanceCache: Record<string, any> = {};

  // Maximum realistic local transit distance (hotel → tourist spot within a city)
  // Anything > 50km indicates a geocoding failure (hotel resolved to wrong city/country)
  const MAX_LOCAL_TRANSIT_KM = 50;

  await Promise.all(
    Array.from(locationsToResolve).map(async (locName) => {
      try {
        // Always include destination city context so Geoapify geocodes correctly
        const hotelWithCity = `${hotelName}, ${destination}`;
        const transit = await getTransitDirections(hotelWithCity, `${locName}, ${destination}`);

        const isUnrealistic = !transit.distance_km || transit.distance_km <= 0 || transit.distance_km > MAX_LOCAL_TRANSIT_KM;
        if (isUnrealistic) {
          if (transit.distance_km > MAX_LOCAL_TRANSIT_KM) {
            logger.warn(`[LocalTransitAgent] Unrealistic distance ${transit.distance_km}km for ${hotelName}→${locName}. Falling back to smart estimate.`);
          }
          const fb = getSmartFallback(hotelName, locName);
          distanceCache[locName] = {
            distance_km: fb.distance_km,
            duration_min: fb.duration_min,
            mode: 'driving',
            steps: [`Commute from ${hotelName} to ${locName}`],
          };
        } else {
          distanceCache[locName] = transit;
        }
      } catch {
        const fb = getSmartFallback(hotelName, locName);
        distanceCache[locName] = {
          distance_km: fb.distance_km,
          duration_min: fb.duration_min,
          mode: 'driving',
          steps: [`Commute from ${hotelName} to ${locName}`],
        };
      }
    })
  );

  // ── Annotate schedule items with transport notes ───────────────────────
  let totalLocalTransportCost = 0;
  const distancesFromHotelList: Array<{
    attraction: string;
    distance_km: number;
    distance_text: string;
    duration_text?: string;
  }> = [];

  let hubCommute: any = null;
  const hubData = distanceCache[hubFullName];
  if (hubData) {
    const dist = hubData.distance_km as number;
    let travelExpense = 0;
    let icon = '🚗';
    let transitNote = '';
    const travelMode = dist < 2 ? 'Walking' : dist < 6 ? 'Auto' : 'Cab';
    icon = travelMode === 'Walking' ? '🚶' : travelMode === 'Auto' ? '🛺' : '🚗';
    if (travelMode === 'Walking') {
      travelExpense = 0;
      transitNote = `${icon} Walk: ${dist} km, ~${hubData.duration_min} mins (free)`;
    } else {
      const baseFare = travelMode === 'Auto' ? 45 : 90;
      const ratePerKm = travelMode === 'Auto' ? 12 : 16;
      travelExpense = Math.round((baseFare + dist * ratePerKm) * 2); // round-trip (arrival + departure)
      transitNote = `${icon} ${travelMode}: ${dist} km, ~${hubData.duration_min} mins (round-trip: ₹${travelExpense})`;
    }

    totalLocalTransportCost += travelExpense;

    hubCommute = {
      name: hubFullName,
      type: transportMode === 'Flight' ? 'Airport' : transportMode === 'Train' ? 'Railway Station' : 'Bus Stand',
      distance_km: dist,
      duration_min: hubData.duration_min,
      travel_cost_inr: travelExpense,
      transport_note: transitNote,
    };

    distancesFromHotelList.push({
      attraction: `➔ Entry/Exit Hub: ${hubFullName}`,
      distance_km: dist,
      distance_text: `${dist} km`,
      duration_text: `${hubData.duration_min} min via ${travelMode.toLowerCase()}`,
    });
  }

  let totalActivitiesCost = 0;

  const updatedDays = itinerary.days.map((day: any) => {
    let dayTotalInr = 0;

    const updatedSchedule = (day.schedule || []).map((item: any) => {
      const loc = (item.location || '').trim();
      const isHotelLoc =
        loc.toLowerCase().includes('hotel') ||
        loc.toLowerCase().includes('resort') ||
        loc.toLowerCase().includes('check-in') ||
        loc.toLowerCase().includes('stay') ||
        loc.toLowerCase() === hotelName.toLowerCase();

      const data = loc && !isHotelLoc ? distanceCache[loc] : null;

      const itemCost = Number(item.cost_inr) || 0;
      dayTotalInr += itemCost;

      const activityText = (item.activity || '').toLowerCase();
      const isMealOrStay =
        isHotelLoc ||
        activityText.includes('lunch') ||
        activityText.includes('dinner') ||
        activityText.includes('breakfast') ||
        activityText.includes('meal') ||
        activityText.includes('rest ') ||
        activityText.includes('hotel') ||
        activityText.includes('check-in') ||
        activityText.includes('checkout') ||
        activityText.includes('check-out') ||
        activityText.includes('check out') ||
        activityText.includes('stay');

      if (!isMealOrStay) {
        totalActivitiesCost += itemCost;
      }

      if (data) {
        const dist = data.distance_km as number;
        let travelExpense = 0;
        let icon = '🚗';
        let transitNote = '';

        if (data.mode === 'transit') {
          icon = '🚌';
          const ticket = 25 * (input.travelers || 1);
          travelExpense = ticket * 2;
          transitNote = `${icon} Transit: ${data.transit_summary || ''} (round-trip: ₹${travelExpense})`;
        } else {
          const travelMode =
            data.mode === 'walking' ? 'Walking' : dist < 2 ? 'Walking' : dist < 6 ? 'Auto' : 'Cab';
          icon = travelMode === 'Walking' ? '🚶' : travelMode === 'Auto' ? '🛺' : '🚗';

          if (travelMode === 'Walking') {
            travelExpense = 0;
            transitNote = `${icon} Walk: ${dist} km, ~${data.duration_min} mins (free)`;
          } else {
            const baseFare = travelMode === 'Auto' ? 40 : 80;
            const ratePerKm = travelMode === 'Auto' ? 10 : 15;
            travelExpense = Math.round((baseFare + dist * ratePerKm) * 2);
            transitNote = `${icon} ${travelMode}: ${dist} km, ~${data.duration_min} mins (round-trip: ₹${travelExpense})`;
          }
        }

        totalLocalTransportCost += travelExpense;
        dayTotalInr += travelExpense;

        if (!distancesFromHotelList.some((d) => d.attraction === loc)) {
          const modeForDuration =
            data.mode === 'walking' ? 'walking' : dist < 2 ? 'walking' : dist < 6 ? 'auto' : 'cab';
          distancesFromHotelList.push({
            attraction: loc,
            distance_km: dist,
            distance_text: `${dist} km`,
            duration_text: `${data.duration_min} min via ${modeForDuration}`,
          });
        }

        return {
          ...item,
          transport_note: transitNote,
          travel_cost_inr: travelExpense,
          transit_steps: data.steps || [],
        };
      }

      return { ...item, travel_cost_inr: 0 };
    });

    return { ...day, schedule: updatedSchedule, daily_total_inr: dayTotalInr };
  });

  const updatedItinerary = { ...itinerary, days: updatedDays };

  // ── Recalculate budget including local transport ───────────────────────
  // IMPORTANT: Always use the BASE budget fields (transport, accommodation, food, activities)
  // WITHOUT any pre-existing local_transport value. This prevents the stale local_transport
  // from being re-added every time the agent re-runs (e.g. on replan), which caused the
  // ₹854,408 explosion seen in the screenshot.
  const currentBudget = context.budget || {};

  // Hard cap local transport cost at a sensible maximum (₹500/person/day * travelers * days)
  // to protect against Geoapify returning unrealistic distances (e.g. 500 km routes).
  const travelers = context.input?.travelers || 1;
  const tripDays = updatedDays.length || 1;
  const maxReasonableLocalCost = 500 * travelers * tripDays;
  const cappedLocalTransportCost = Math.min(totalLocalTransportCost, maxReasonableLocalCost);

  if (totalLocalTransportCost > maxReasonableLocalCost) {
    logger.warn(
      `[LocalTransitAgent] Capping local transport cost from ₹${totalLocalTransportCost} to ₹${cappedLocalTransportCost} (max ₹500/person/day)`
    );
  }

  // Use ONLY the four base cost categories — never add local_transport from currentBudget
  const baseTransport = Number(currentBudget.transport) || 0;
  const baseAccom = Number(currentBudget.accommodation) || 0;
  const baseFood = Number(currentBudget.food) || 0;
  const baseActivities = totalActivitiesCost;

  const newSubtotal = baseTransport + baseAccom + baseFood + baseActivities + cappedLocalTransportCost;

  const newEmergencyFund = Math.round(newSubtotal * 0.1);
  const newTotalCost = newSubtotal + newEmergencyFund;
  const userBudgetLimit = context.input.budget_inr || 30000;
  const isFeasible = newTotalCost <= userBudgetLimit;

  const updatedBudget: any = {
    ...currentBudget,
    activities: totalActivitiesCost,
    local_transport: cappedLocalTransportCost,
    emergency_fund: newEmergencyFund,
    total_cost_inr: newTotalCost,
    remaining_budget_inr: userBudgetLimit - newTotalCost,
    is_feasible: isFeasible,
  };

  if (updatedBudget.source_details?.activities) {
    updatedBudget.source_details.activities.cost_inr = totalActivitiesCost;
  }

  if (!isFeasible) {
    const safeIncrease = Math.ceil(newTotalCost * 1.15);
    const alternatives: string[] = [];
    const selectedTier = accommodation?.selected_category || 'mid_range';

    // 1. Choose a cheaper hotel tier (only if not already budget and not skipped)
    if (selectedTier !== 'budget' && selectedTier !== 'skipped' && baseAccom > 0) {
      alternatives.push(`Choose a cheaper hotel tier (saves approx. ₹${Math.round(baseAccom * 0.4)})`);
    }

    // 2. Skip lodgings (only if not already skipped and has cost)
    if (selectedTier !== 'skipped' && baseAccom > 0) {
      alternatives.push(`Skip lodgings: arrange accommodation yourself (saves ₹${Math.round(baseAccom)})`);
    }

    // 3. Shorten duration (only if updatedDays.length > 2)
    if (updatedDays.length > 2) {
      alternatives.push(`Reduce duration of trip by 1 or 2 days (saves approx. ₹${Math.round((baseFood / Math.max(1, updatedDays.length)) * 1.5)})`);
    }

    // 4. Reduce travelers count (only if travelers > 1)
    if (travelers > 1) {
      alternatives.push(`Reduce travelers count from ${travelers} to ${travelers - 1} (saves approx. ₹${Math.round(newTotalCost / travelers)})`);
    }

    // 5. Limit sightseeing (only if baseActivities > 0)
    if (baseActivities > 0) {
      alternatives.push(`Focus on free tourist attractions (saves up to ₹${Math.round(baseActivities)})`);
    }

    // 6. Increase budget limit (always include)
    alternatives.push(`Increase limit to ₹${safeIncrease} for comfortable traveling accommodations`);

    updatedBudget.alternatives = alternatives;
  }

  const local_transport = {
    distances_from_hotel: distancesFromHotelList,
    hotel_name: hotelName,
    daily_budget_estimate: Math.round(cappedLocalTransportCost / Math.max(1, updatedDays.length)),
    cab_estimates: [
      { mode: 'Cab / Taxi', rate_per_km: 15, base_fare: 80 },
      { mode: 'Auto Rickshaw', rate_per_km: 10, base_fare: 40 },
      { mode: 'Rent a Bike', rate_per_km: 5, base_fare: 200 },
    ],
    hub_commute: hubCommute,
  };

  logger.info(
    `[LocalTransitAgent] Done. Hotel: "${hotelName}", ` +
    `${distancesFromHotelList.length} spots, raw commute cost: ₹${totalLocalTransportCost}, capped at: ₹${cappedLocalTransportCost}`
  );

  return { itinerary: updatedItinerary, budget: updatedBudget, local_transport };
}
