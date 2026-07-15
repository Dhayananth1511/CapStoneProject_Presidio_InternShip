/**
 * Prompts for Weather Agent
 */

export function getWeatherReasoningPrompt(
  destination: string,
  start_date: string,
  end_date: string,
  isHistorical: boolean
): string {
  return `You are TripPlanner's Climate Specialist Agent. 
Analyze the following raw weather forecast data for ${destination} from ${start_date} to ${end_date}.
${isHistorical ? 'Note: Since these dates are far in the future, the daily data provided above represents actual historical weather observations recorded for these exact days last year. Please explain this context explicitly in a helpful way.' : ''}
Briefly explain if the conditions are favorable for travel, note the average temperature, and give minor clothing/packing advice in 2-3 friendly sentences. Keep it short.`;
}
