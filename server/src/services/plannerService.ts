// Planner Service is the brain of the backend. It's the single function
// that the Trip Controller calls. It runs all 11 agents in the right sequence:
// Stage 0 (sequential) → Stage 1 (parallel) → Stage 2 (sequential) → HITL

import { v4 as uuidv4 } from 'uuid';
import { TripContext, runPlannerAgent } from '../agents/plannerAgent';
import Trip from '../models/Trip';
import User from '../models/User';
import logger from '../utils/logger';

export interface PlannerServiceResult {
  status: 'NEEDS_INFO' | 'PLANNED' | 'ERROR';
  clarifyingQuestion?: string;
  tripId?: string;
  plan?: string;
  context?: TripContext;
  budgetFeasible?: boolean;
  budgetAlternatives?: string[];
}

export async function planTrip(
  userMessage: string,
  userId: string,
  existingTripId?: string,
  requestId?: string
): Promise<PlannerServiceResult> {
  logger.info('Planner Service: Starting trip planning', { userId, requestId });

  // --- Load Memory ---
  const user = await User.findById(userId);
  const longTermMemory = user?.longTermMemory || '';

  // --- Load or create TripContext ---
  let context: TripContext;
  
  if (existingTripId) {
    // Guard: always scope the lookup to the calling user to prevent cross-user session injection
    const existingTrip = await Trip.findOne({ sessionId: existingTripId, userId });
    if (existingTrip) {
      context = {
        sessionId: existingTrip.sessionId,
        userId: userId.toString(),
        status: existingTrip.status,
        input: existingTrip.input as any,
        conversationHistory: existingTrip.conversationHistory || [],
        weather: existingTrip.weather,
        transport: existingTrip.transport,
        accommodation: existingTrip.accommodation,
        activities: existingTrip.activities,
        budget: existingTrip.budget,
        itinerary: existingTrip.itinerary,
        booking: existingTrip.booking,
      };
    } else {
      context = { sessionId: uuidv4(), userId, status: 'DRAFT', input: {}, conversationHistory: [] };
    }
  } else {
    context = { sessionId: uuidv4(), userId, status: 'DRAFT', input: {}, conversationHistory: [] };
  }

  // Add user message to conversation history
  context.conversationHistory.push({ role: 'user', content: userMessage });

  // --- Delegate to Planner Swarm Supervisor ---
  const result = await runPlannerAgent(userMessage, context, longTermMemory);

  // Trim conversation history to the most recent 50 turns to prevent MongoDB document bloat.
  // The LLM already uses only the last 4 messages for context (in plannerAgent), so full
  // history beyond 50 turns provides no inference benefit but wastes storage.
  const MAX_HISTORY_TURNS = 50;
  const trimmedHistory = result.context.conversationHistory.slice(-MAX_HISTORY_TURNS);

  // HITL COMPLIANCE NOTE: The trip is persisted here in DRAFT or PLANNED status for
  // session continuity (so the user can close the tab and resume). This is NOT a
  // confirmation. The trip status only becomes CONFIRMED via the explicit
  // POST /api/trips/:tripId/approve endpoint — which requires a deliberate user action.
  // Booking references are never created until that explicit approval step.
  await Trip.findOneAndUpdate(
    { sessionId: result.context.sessionId },
    { 
      userId,
      sessionId: result.context.sessionId,
      status: result.context.status,
      input: result.context.input,
      conversationHistory: trimmedHistory,
      weather: result.context.weather,
      transport: result.context.transport,
      accommodation: result.context.accommodation,
      activities: result.context.activities,
      budget: result.context.budget,
      itinerary: result.context.itinerary,
      formattedPlan: result.context.formattedPlan,
    },
    { upsert: true, new: true }
  );

  logger.info('Planner Service: Supervisor execution complete and context persisted', { sessionId: result.context.sessionId, requestId });

  // --- Long-Term Memory Write-Back ---
  // After each PLANNED trip, update the user's memory with their latest preferences.
  // This makes the destination recommendation agent progressively smarter.
  if (result.status === 'PLANNED' && result.context.input.destination) {
    try {
      const { destination, origin, interests, travelers, budget_inr } = result.context.input;
      const tripSummary = [
        `Planned a trip to ${destination} from ${origin || 'unknown origin'}`,
        travelers ? `for ${travelers} traveler(s)` : '',
        budget_inr ? `with a budget of ₹${budget_inr.toLocaleString()}` : '',
        interests?.length ? `with interests in ${interests.join(', ')}` : '',
      ].filter(Boolean).join(', ');

      await User.findByIdAndUpdate(userId, {
        longTermMemory: `${tripSummary}. Last trip planned on ${new Date().toDateString()}.`,
      });
      logger.info('Long-term memory updated for user', { userId });
    } catch (memErr: any) {
      // Non-fatal: memory write failure must NOT break the main planning flow
      logger.warn('Failed to update long-term memory', { userId, error: memErr.message });
    }
  }

  return {
    status: result.status,
    clarifyingQuestion: result.clarifyingQuestion,
    tripId: result.context.sessionId,
    plan: result.plan,
    context: result.context,
    budgetFeasible: result.budgetFeasible,
    budgetAlternatives: result.budgetAlternatives,
  };
}
