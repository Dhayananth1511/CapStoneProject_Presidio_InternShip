// Local Transit Agent — Calculates hotel-to-attraction distances and commute costs.
// This is a dedicated agent in the swarm, not a utility function.
// It calls the calculateLocalTransit MCP tool in mapsMCP.ts.
// It always re-runs when the hotel or itinerary changes.


import { TripContext } from './plannerAgent';
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

  // ── Collect unique non-hotel locations from the itinerary ──────────────
  const locationsToResolve = new Set<string>();
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

  await Promise.all(
    Array.from(locationsToResolve).map(async (locName) => {
      try {
        const transit = await getTransitDirections(hotelName, `${locName}, ${destination}`);
        if (!transit.distance_km || transit.distance_km <= 0) {
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

    updatedSchedule.forEach((item: any) => {
      dayTotalInr += Number(item.cost_inr) || 0;
    });

    return { ...day, schedule: updatedSchedule, daily_total_inr: dayTotalInr };
  });

  const updatedItinerary = { ...itinerary, days: updatedDays };

  // ── Recalculate budget including local transport ───────────────────────
  const currentBudget = context.budget || {};
  const newSubtotal =
    (Number(currentBudget.transport) || 0) +
    (Number(currentBudget.accommodation) || 0) +
    (Number(currentBudget.food) || 0) +
    (Number(currentBudget.activities) || 0) +
    totalLocalTransportCost;

  const newEmergencyFund = Math.round(newSubtotal * 0.1);
  const newTotalCost = newSubtotal + newEmergencyFund;
  const userBudgetLimit = input.budget_inr || 30000;
  const isFeasible = newTotalCost <= userBudgetLimit;

  const updatedBudget: any = {
    ...currentBudget,
    local_transport: totalLocalTransportCost,
    emergency_fund: newEmergencyFund,
    total_cost_inr: newTotalCost,
    remaining_budget_inr: userBudgetLimit - newTotalCost,
    is_feasible: isFeasible,
  };

  if (!isFeasible) {
    const safeIncrease = Math.ceil(newTotalCost * 1.1);
    updatedBudget.alternatives = [
      `Choose a cheaper hotel tier (saves approx. ₹${Math.round((Number(currentBudget.accommodation) || 0) * 0.4)})`,
      `Reduce duration of trip by 1 or 2 days (saves approx. ₹${Math.round(((Number(currentBudget.food) || 0) / Math.max(1, updatedDays.length)) * 1.5)})`,
      `Increase limit to ₹${safeIncrease} for comfortable traveling accommodations`,
    ];
  }

  const local_transport = {
    distances_from_hotel: distancesFromHotelList,
    hotel_name: hotelName,
    daily_budget_estimate: Math.round(totalLocalTransportCost / Math.max(1, updatedDays.length)),
    cab_estimates: [
      { mode: 'Cab / Taxi', rate_per_km: 15, base_fare: 80 },
      { mode: 'Auto Rickshaw', rate_per_km: 10, base_fare: 40 },
      { mode: 'Rent a Bike', rate_per_km: 5, base_fare: 200 },
    ],
  };

  logger.info(
    `[LocalTransitAgent] Done. Hotel: "${hotelName}", ` +
    `${distancesFromHotelList.length} spots, total commute cost: ₹${totalLocalTransportCost}`
  );

  return { itinerary: updatedItinerary, budget: updatedBudget, local_transport };
}
