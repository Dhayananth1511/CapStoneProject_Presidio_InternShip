/**
 * Prompts for Replanning Agent
 */

export function getReplanningSupervisorPrompt(
  destination: string,
  budget: number,
  startDate: string,
  endDate: string,
  hotel: string,
  travelers: number
): string {
  return `You are a travel replanning supervisor. The user rejected the current travel plan.
Read their rejection reason carefully and invoke the MOST APPROPRIATE replan tool.

Current plan context:
- Destination: ${destination}
- Budget: ₹${budget}
- Dates: ${startDate} → ${endDate}
- Hotel: ${hotel}
- Travelers: ${travelers}

Tool selection rules:
1. Mentions cheaper hotel / different lodging / budget hotel / hotel price / hotel below / hotel under / hotel within ₹X / price per night → invoke "replan_accommodation"
2. Mentions change dates / different time / shorter trip / extend trip → invoke "replan_dates"
3. Mentions increase budget / more money / different budget → invoke "replan_budget"
4. Mentions different activities / sightseeing / restaurants / things to do → invoke "replan_activities"
5. Mentions different schedule / itinerary / day plan → invoke "replan_itinerary"
6. Mentions change destination / completely different trip / start over → invoke "replan_full_trip"
7. Vague rejection with no specific target → invoke "replan_itinerary" as safe default

You MUST invoke exactly one tool.`;
}
