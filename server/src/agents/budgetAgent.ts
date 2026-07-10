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
}

export async function runBudgetAgent(context: TripContext): Promise<BudgetBreakdown> {
  const { input, transport, accommodation, activities, local_transport } = context;
  const budget = input.budget_inr || 30000;

  // Extract cost numbers from each agent's output
  const transportCost = transport?.estimated_cost_inr || 1500;
  const hotelCost = accommodation?.hotels?.[0]?.total_cost_inr || 8000;
  
  // Food: Estimate ₹500 per person per day (standard traveler budget in India)
  const days = input.start_date && input.end_date
    ? (new Date(input.end_date).getTime() - new Date(input.start_date).getTime()) / (1000 * 60 * 60 * 24)
    : 5;
  const foodCost = 500 * (input.travelers || 1) * days;
  
  // Extract entry fee estimate (parse INR string from places MCP)
  let activityCost = 1500;
  if (activities?.entry_fees) {
    const numericMatch = activities.entry_fees.match(/\d+/);
    if (numericMatch) {
      activityCost = parseInt(numericMatch[0]) * (input.travelers || 1);
    }
  }

  const localTransportCost = local_transport?.cab_estimate_inr || 2000;

  const subtotal = transportCost + hotelCost + foodCost + activityCost + localTransportCost;
  
  // Emergency fund = 10% of subtotal for unexpected expenses
  const emergencyFund = Math.round(subtotal * 0.1);
  const totalCost = subtotal + emergencyFund;

  const isFeasible = totalCost <= budget;
  const breakdown: BudgetBreakdown = {
    transport: transportCost,
    accommodation: hotelCost,
    food: foodCost,
    activities: activityCost,
    local_transport: localTransportCost,
    emergency_fund: emergencyFund,
    total_cost_inr: totalCost,
    remaining_budget_inr: budget - totalCost,
    is_feasible: isFeasible,
  };

  // If way over budget, suggest realistic alternatives
  if (!isFeasible) {
    breakdown.alternatives = [
      `Choose a cheaper hotel tier (saves approx. ₹${Math.round(hotelCost * 0.4)})`,
      `Reduce duration of trip by 1 or 2 days (saves approx. ₹${Math.round(((foodCost + localTransportCost) / days) * 1.5)})`,
      `Increase limit to ₹${totalCost} for comfortable traveling accommodations`,
    ];
  }

  return breakdown;
}
