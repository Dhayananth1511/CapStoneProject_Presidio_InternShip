import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tripService } from '../services/tripService';
import type { TripSummary } from '../types';

export function useUserTripsQuery() {
  return useQuery<{ trips: TripSummary[] }>({
    queryKey: ['userTrips'],
    queryFn: tripService.getTrips,
  });
}

export function useCancelTripMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: tripService.deleteTrip,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userTrips'] });
    },
  });
}

export function useActiveTripQuery(tripId: string | null | undefined) {
  return useQuery({
    queryKey: ['activeTrip', tripId],
    queryFn: async () => {
      if (!tripId) return null;
      const res = await tripService.getTripById(tripId);
      return res.trip;
    },
    enabled: !!tripId,
  });
}

export function usePlanTripMutation() {
  const [activeStep, setActiveStep] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (payload: { message: string; tripId?: string }) => {
      const steps = [
        'Supervisor Routing & Slot Extraction...',
        'Running Programmatic Context Validations...',
        'Coordinating MCP Parallel Retrieval (Weather, Hotels, Transport)...',
        'Performing Budget Calibration & Conflict Checks...',
        'Generating Day-by-Day Itinerary Layout...'
      ];

      let currentStepIndex = 0;
      setActiveStep(steps[currentStepIndex]);

      const interval = setInterval(() => {
        if (currentStepIndex < steps.length - 1) {
          currentStepIndex++;
          setActiveStep(steps[currentStepIndex]);
        }
      }, 1200);

      try {
        const data = await tripService.planTrip(payload);
        return data;
      } catch (firstErr: any) {
        const isTimeout = firstErr.code === 'ECONNABORTED' || firstErr.message?.includes('timeout') || firstErr.response?.status === 504;
        if (isTimeout) {
          setActiveStep('Agent swarm warming up — auto-retrying now...');
          await new Promise(resolve => setTimeout(resolve, 2500));
          try {
            const retryData = await tripService.planTrip(payload);
            return retryData;
          } catch (retryErr) {
            throw retryErr;
          }
        }
        throw firstErr;
      } finally {
        clearInterval(interval);
      }
    },
    onSettled: () => {
      setActiveStep(null);
    },
  });

  return {
    ...mutation,
    activeStep,
    setActiveStep,
  };
}

export function useSelectHotelMutation(tripId: string) {
  return useMutation({
    mutationFn: (payload: { hotelName: string; category: string }) =>
      tripService.selectHotel(tripId, payload),
  });
}

export function useSelectTransportMutation(tripId: string) {
  return useMutation({
    mutationFn: (payload: { operator: string; mode: string }) =>
      tripService.selectTransport(tripId, payload),
  });
}

export function useApproveTripMutation(tripId: string) {
  return useMutation({
    mutationFn: () => tripService.approveTrip(tripId),
  });
}

export function useRejectTripMutation(tripId: string) {
  const [activeStep, setActiveStep] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (reason: string) => {
      setActiveStep('Replanning Agent: Clearing Selective Stale Contexts...');
      
      const interval = setInterval(() => {
        setActiveStep('Recycling Swarm Pipelines & Re-calculating...');
      }, 1000);

      try {
        const data = await tripService.rejectTrip(tripId, reason);
        return data;
      } finally {
        clearInterval(interval);
      }
    },
    onSettled: () => {
      setActiveStep(null);
    },
  });

  return {
    ...mutation,
    activeStep,
  };
}
