// Planner Service is the brain of the backend. It's the single function
// that the Trip Controller calls. It runs all 11 agents in the right sequence:
// Stage 0 (sequential) → Stage 1 (parallel) → Stage 2 (sequential) → HITL

import { v4 as uuidv4 } from 'uuid';
import { TripContext, runPlannerAgent } from '../agents/plannerAgent';
import { runMissingInfoAgent } from '../agents/missingInfoAgent';
import { runDestinationRecAgent } from '../agents/destinationRecAgent';
import { runParallelAgents, synthesizeTripPlan } from '../agents/coordinatorAgent';
import { runBudgetAgent } from '../agents/budgetAgent';
import { runItineraryAgent } from '../agents/itineraryAgent';
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

  // --- STAGE 0A: Planner Agent — extract intent ---
  context = await runPlannerAgent(userMessage, context, longTermMemory);

  // --- STAGE 0B: Missing Info Agent — check completeness ---
  const missingInfo = await runMissingInfoAgent(context);
  if (!missingInfo.complete) {
    // Save partial context as DRAFT so user can continue the conversation
    await Trip.findOneAndUpdate(
      { sessionId: context.sessionId },
      { 
        userId,
        sessionId: context.sessionId,
        status: 'DRAFT',
        input: context.input,
        conversationHistory: context.conversationHistory,
        weather: context.weather,
        transport: context.transport,
        accommodation: context.accommodation,
        activities: context.activities,
        local_transport: context.local_transport,
        budget: context.budget,
        itinerary: context.itinerary,
      },
      { upsert: true, new: true }
    );
    // Return the clarifying question to the frontend
    return {
      status: 'NEEDS_INFO',
      clarifyingQuestion: missingInfo.clarifyingQuestion,
      tripId: context.sessionId,
      context,
    };
  }

  // --- STAGE 0C: Destination Rec Agent (if no destination) ---
  if (!context.input.destination) {
    const destRec = await runDestinationRecAgent(context, longTermMemory);
    context.input.destination = destRec.selectedDestination;
  }

  // --- STAGE 1: Parallel Data Retrieval ---
  logger.info('Planner Service: Running parallel agents', { requestId });
  context = await runParallelAgents(context, userMessage);

  // --- STAGE 2A: Budget Agent ---
  const budgetBreakdown = await runBudgetAgent(context);
  context.budget = budgetBreakdown;

  if (!budgetBreakdown.is_feasible) {
    // Save as PLANNED but flag as unfeasible so they get alternative choices
    await Trip.findOneAndUpdate(
      { sessionId: context.sessionId },
      { 
        userId,
        sessionId: context.sessionId,
        status: 'PLANNED',
        input: context.input,
        conversationHistory: context.conversationHistory,
        weather: context.weather,
        transport: context.transport,
        accommodation: context.accommodation,
        activities: context.activities,
        local_transport: context.local_transport,
        budget: context.budget,
      },
      { upsert: true }
    );

    return {
      status: 'PLANNED',
      tripId: context.sessionId,
      budgetFeasible: false,
      budgetAlternatives: budgetBreakdown.alternatives,
      context,
    };
  }

  // --- STAGE 2B: Itinerary Agent ---
  const itinerary = await runItineraryAgent(context);
  context.itinerary = itinerary;

  // --- Coordinator: Synthesize Final Markdown Plan ---
  const formattedPlan = await synthesizeTripPlan(context);
  context.formattedPlan = formattedPlan;
  context.status = 'PLANNED';

  // --- Save to MongoDB (status: PLANNED, awaiting user approval) ---
  await Trip.findOneAndUpdate(
    { sessionId: context.sessionId },
    { 
      userId,
      sessionId: context.sessionId,
      status: 'PLANNED',
      input: context.input,
      conversationHistory: context.conversationHistory,
      weather: context.weather,
      transport: context.transport,
      accommodation: context.accommodation,
      activities: context.activities,
      local_transport: context.local_transport,
      budget: context.budget,
      itinerary: context.itinerary,
      formattedPlan: context.formattedPlan,
    },
    { upsert: true, new: true }
  );

  logger.info('Planner Service: Trip planned and saved', { sessionId: context.sessionId, requestId });

  return {
    status: 'PLANNED',
    tripId: context.sessionId,
    plan: formattedPlan,
    context,
    budgetFeasible: true,
  };
}
