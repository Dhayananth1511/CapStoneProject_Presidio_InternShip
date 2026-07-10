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
    const existingTrip = await Trip.findOne({ sessionId: existingTripId });
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
        local_transport: existingTrip.local_transport,
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

  // Save the result to MongoDB
  await Trip.findOneAndUpdate(
    { sessionId: result.context.sessionId },
    { 
      userId,
      sessionId: result.context.sessionId,
      status: result.context.status,
      input: result.context.input,
      conversationHistory: result.context.conversationHistory,
      weather: result.context.weather,
      transport: result.context.transport,
      accommodation: result.context.accommodation,
      activities: result.context.activities,
      local_transport: result.context.local_transport,
      budget: result.context.budget,
      itinerary: result.context.itinerary,
      formattedPlan: result.context.formattedPlan,
    },
    { upsert: true, new: true }
  );

  logger.info('Planner Service: Supervisor execution complete and context persisted', { sessionId: result.context.sessionId, requestId });

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
