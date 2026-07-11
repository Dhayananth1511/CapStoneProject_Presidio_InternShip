// Replanning Agent — handles HITL rejection ("I want cheaper hotel" / "change dates")
// Key insight: we PRESERVE everything that was expensive to compute (weather, transport,
// activities) and ONLY re-run what the user wants changed. This saves API calls and time.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { TripContext } from './plannerAgent';
import { withRetry } from '../utils/retry';
import logger from '../utils/logger';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama-3.1-8b-instant',
  temperature: 0.2,
});

export async function runReplanningAgent(
  context: TripContext,
  rejectionReason: string
): Promise<{ updatedContext: TripContext; whatChanged: string[] }> {
  const response = await withRetry(() => llm.invoke([
    new SystemMessage(
      `A user rejected a travel plan. Identify ONLY what needs to change.
       Return ONLY valid JSON: { "changes": ["accommodation", "budget", "itinerary"], "instruction": "brief explanation" }
       Valid change types: destination, dates, budget, accommodation, itinerary`
    ),
    new HumanMessage(
      `Rejection reason: "${rejectionReason}"
       Current plan: destination=${context.input.destination}, budget=₹${context.input.budget_inr}, hotel=${context.accommodation?.recommended}`
    ),
  ]));

  try {
    const jsonMatch = response.content.toString().match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Allowlist: only accept known, pre-defined change types. Any other value from the LLM is ignored.
    const ALLOWED_CHANGES = new Set(['destination', 'dates', 'budget', 'accommodation', 'itinerary', 'transport', 'activities']);
    const rawChanges: string[] = Array.isArray(parsed.changes) ? parsed.changes : ['itinerary'];
    const changes: string[] = rawChanges.filter((c) => ALLOWED_CHANGES.has(c));

    // If LLM returned all garbage values, fall back to safest default (regenerate itinerary)
    if (changes.length === 0) {
      logger.warn('ReplanningAgent: LLM returned no valid change types. Defaulting to itinerary regeneration.', { rawChanges });
      changes.push('itinerary');
    }

    // Build updated context: clear ONLY the agent outputs that need to be re-run
    const updatedContext = { ...context };
    
    if (changes.includes('accommodation')) updatedContext.accommodation = undefined;
    if (changes.includes('budget')) updatedContext.budget = undefined;
    if (changes.includes('itinerary')) {
      updatedContext.itinerary = undefined;
      updatedContext.formattedPlan = undefined;
    }
    // If dates changed, invalidate weather/transport/accommodation too
    if (changes.includes('dates')) {
      updatedContext.weather = undefined;
      updatedContext.transport = undefined;
      updatedContext.accommodation = undefined;
      updatedContext.itinerary = undefined;
      updatedContext.formattedPlan = undefined;
    }
    // Weather and transport are preserved unless dates/destination change
    
    return { updatedContext, whatChanged: changes };
  } catch {
    return { updatedContext: context, whatChanged: [] };
  }
}
