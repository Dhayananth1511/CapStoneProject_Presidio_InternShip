import { useQuery } from '@tanstack/react-query';
import { adminService } from '../services/adminService';

export function useAdminLogsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['adminLogs'],
    queryFn: adminService.getLogs,
    enabled,
    refetchInterval: 5000, // Poll logs every 5 seconds for a "live feed" feel
  });
}

export function useAdminAnalyticsQuery() {
  return useQuery({
    queryKey: ['adminAnalytics'],
    queryFn: adminService.getAnalytics,
    retry: 2,
    staleTime: 20000,
  });
}

export function useAdminTripsQuery(params: { status?: string; destination?: string; page: number; limit: number }) {
  return useQuery({
    queryKey: ['adminTrips', params.status, params.destination, params.page],
    queryFn: () => adminService.getAdminTrips(params),
    retry: 2,
    staleTime: 20000,
  });
}
