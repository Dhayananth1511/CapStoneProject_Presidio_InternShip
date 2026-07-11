import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, Doughnut } from 'react-chartjs-2';
import ReactMarkdown from 'react-markdown';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import {
  BarChart3,
  Users,
  Compass,
  IndianRupee,
  Filter,
  TrendingUp,
} from 'lucide-react';
import api from '../lib/axios';

// Register ChartJS modules
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

interface TripItem {
  sessionId: string;
  status: string;
  createdAt: string;
  userId?: {
    name: string;
    email: string;
  };
  input: {
    destination?: string;
    origin?: string;
    start_date?: string;
    end_date?: string;
    travelers?: number;
    budget_inr?: number;
    interests?: string[];
  };
  budget?: {
    total_cost_inr?: number;
    total_estimated_cost?: number;
    breakdown?: {
      transport?: number;
      accommodation?: number;
      food?: number;
      activities?: number;
      local_transport?: number;
      emergency_fund?: number;
    };
  };
  formattedPlan?: string;
}

export default function AdminDashboard() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchDestination, setSearchDestination] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const limit = 6;
  const [selectedTrip, setSelectedTrip] = useState<TripItem | null>(null);

  // React Query to fetch analytics dashboard summary data
  const { data: analytics, refetch: refetchAnalytics } = useQuery({
    queryKey: ['adminAnalytics'],
    queryFn: async () => {
      try {
        const res = await api.get('/admin/analytics');
        return res.data;
      } catch (err) {
        // Fallback mock diagnostics if server offline / setup phase
        return {
          statusCounts: [
            { _id: 'DRAFT', count: 18 },
            { _id: 'PLANNED', count: 32 },
            { _id: 'CONFIRMED', count: 48 },
            { _id: 'CANCELLED', count: 6 },
          ],
          topDestinations: [
            { _id: 'Ooty', count: 15 },
            { _id: 'Munnar', count: 12 },
            { _id: 'Goa', count: 10 },
            { _id: 'Manali', count: 8 },
            { _id: 'Kochi', count: 5 },
          ],
          avgBudget: 24500,
          totalUsers: 84,
          totalTrips: 104,
        };
      }
    },
  });

  // React Query to fetch the list of trips
  const { data: tripsData, refetch: refetchTrips } = useQuery({
    queryKey: ['adminTrips', statusFilter, searchDestination, currentPage],
    queryFn: async () => {
      try {
        const res = await api.get('/admin/trips', {
          params: {
            status: statusFilter || undefined,
            destination: searchDestination || undefined,
            page: currentPage,
            limit,
          },
        });
        return res.data;
      } catch (err) {
        // Fallback mockup list
        const rawTrips: TripItem[] = [
          {
            sessionId: 'aa11bb22cc33',
            status: 'CONFIRMED',
            createdAt: '2026-07-10T11:45:00Z',
            userId: { name: 'Dhayananth P', email: 'dhaya@presidio.com' },
            input: { destination: 'Ooty', budget_inr: 30000 },
          },
          {
            sessionId: 'dd44ee55ff66',
            status: 'PLANNED',
            createdAt: '2026-07-09T08:30:00Z',
            userId: { name: 'Ananya Sharma', email: 'ananya@traveler.org' },
            input: { destination: 'Munnar', budget_inr: 22000 },
          },
          {
            sessionId: 'gg77hh88ii99',
            status: 'DRAFT',
            createdAt: '2026-07-08T15:20:00Z',
            userId: { name: 'Rohan Mehta', email: 'rohan.mehta@gmail.com' },
            input: { destination: 'Goa', budget_inr: 15000 },
          },
          {
            sessionId: 'jj00kk11ll22',
            status: 'CONFIRMED',
            createdAt: '2026-07-07T10:15:00Z',
            userId: { name: 'Simran Kaur', email: 'simran@live.com' },
            input: { destination: 'Manali', budget_inr: 45000 },
          },
          {
            sessionId: 'mm33nn44oo55',
            status: 'CANCELLED',
            createdAt: '2026-07-06T18:00:00Z',
            userId: { name: 'Vikram Singh', email: 'vikram@company.in' },
            input: { destination: 'Kochi', budget_inr: 12000 },
          },
          {
            sessionId: 'pp66qq77rr88',
            status: 'CONFIRMED',
            createdAt: '2026-07-05T09:00:00Z',
            userId: { name: 'Siddharth Roy', email: 'sid.roy@yahoo.com' },
            input: { destination: 'Ooty', budget_inr: 35000 },
          },
          {
            sessionId: 'ss99tt00uu11',
            status: 'PLANNED',
            createdAt: '2026-07-04T14:30:00Z',
            userId: { name: 'Pooja Hegde', email: 'pooja.hegde@outlook.com' },
            input: { destination: 'Munnar', budget_inr: 18000 },
          },
        ];

        // Apply filters locally in mockup flow
        let filtered = rawTrips;
        if (statusFilter) {
          filtered = filtered.filter((t) => t.status === statusFilter);
        }
        if (searchDestination) {
          filtered = filtered.filter((t) =>
            t.input.destination?.toLowerCase().includes(searchDestination.toLowerCase())
          );
        }

        const totalItems = filtered.length;
        const startIndex = (currentPage - 1) * limit;
        const paginatedItems = filtered.slice(startIndex, startIndex + limit);

        return {
          trips: paginatedItems,
          total: totalItems,
          page: currentPage,
        };
      }
    },
  });

  // Hot polling database records every 20 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      refetchAnalytics();
      refetchTrips();
    }, 20000);
    return () => clearInterval(timer);
  }, []);

  // Format status count lists into Chart labels
  const statusData = {
    labels: analytics?.statusCounts?.map((s: any) => s._id) || [],
    datasets: [
      {
        data: analytics?.statusCounts?.map((s: any) => s.count) || [],
        backgroundColor: [
          'rgba(251, 191, 36, 0.75)', // Amber -> Draft
          'rgba(129, 140, 248, 0.75)', // Indigo -> Planned
          'rgba(16, 185, 129, 0.75)', // Emerald -> Confirmed
          'rgba(239, 68, 68, 0.75)', // Red -> Cancelled
        ],
        borderColor: '#121824',
        borderWidth: 2,
      },
    ],
  };

  const topDestNames = analytics?.topDestinations?.map((d: any) => d._id) || [];
  const topDestCounts = analytics?.topDestinations?.map((d: any) => d.count) || [];

  const destinationData = {
    labels: topDestNames,
    datasets: [
      {
        label: 'Trip count',
        data: topDestCounts,
        backgroundColor: 'rgba(99, 102, 241, 0.8)',
        borderRadius: 6,
        hoverBackgroundColor: 'rgba(79, 70, 229, 0.95)',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#94a3b8',
          font: { family: 'Inter', size: 11 },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#94a3b8' },
        grid: { color: 'rgba(255,255,255,0.03)' },
      },
      y: {
        ticks: { color: '#94a3b8', precision: 0 },
        grid: { color: 'rgba(255,255,255,0.03)' },
      },
    },
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: '#94a3b8',
          font: { family: 'Inter', size: 11 },
        },
      },
    },
  };

  // Stats calculation
  const totalTripsCount = analytics?.totalTrips || 0;
  const confirmedTripsCount = analytics?.statusCounts?.find((s: any) => s._id === 'CONFIRMED')?.count || 0;
  const conversionRate = totalTripsCount > 0 ? ((confirmedTripsCount / totalTripsCount) * 100).toFixed(1) : '0';

  const totalPages = Math.ceil((tripsData?.total || 0) / limit);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white glow-text mb-1">
            System Operations Dashboard
          </h1>
          <p className="text-slate-400 text-sm">
            Swarm lifecycle orchestrator diagnostics & payment metrics in real-time
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs bg-slate-900 border border-slate-800 rounded-lg px-3.5 py-2 text-indigo-400 font-medium">
          <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
          Live Metrics Polling Enabled (20s)
        </div>
      </div>

      {/* METRICS STATS GRID */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* STAT 1 */}
        <div className="premium-card rounded-xl p-5 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
            <Compass className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Total Trip Plans</span>
            <span className="text-2xl font-extrabold text-white">{totalTripsCount}</span>
          </div>
        </div>

        {/* STAT 2 */}
        <div className="premium-card rounded-xl p-5 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent-teal/10 border border-accent-teal/20 text-accent-teal">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Active Users</span>
            <span className="text-2xl font-extrabold text-white">{analytics?.totalUsers || 0}</span>
          </div>
        </div>

        {/* STAT 3 */}
        <div className="premium-card rounded-xl p-5 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-pink-500/10 border border-pink-500/20 text-pink-400">
            <IndianRupee className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Budget Cap</span>
            <span className="text-2xl font-extrabold text-white">
              ₹{analytics?.avgBudget ? Math.round(analytics.avgBudget).toLocaleString() : 0}
            </span>
          </div>
        </div>

        {/* STAT 4 */}
        <div className="premium-card rounded-xl p-5 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Conversion rate</span>
            <span className="text-2xl font-extrabold text-white">{conversionRate}%</span>
          </div>
        </div>
      </div>

      {/* CHARTS CONTAINER CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CHART 1: STATUS COUNTS */}
        <div className="premium-card rounded-xl p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Trip Status Distributions
            </h3>
            <span className="text-[10px] text-slate-500 font-bold px-2 py-0.5 bg-slate-900 border border-slate-800 rounded">
              Doughnut Ratio
            </span>
          </div>
          <div className="h-64 relative flex items-center justify-center">
            {analytics?.statusCounts && analytics.statusCounts.length > 0 ? (
              <Doughnut data={statusData} options={donutOptions} />
            ) : (
              <span className="text-xs text-slate-550">No statistics available</span>
            )}
          </div>
        </div>

        {/* CHART 2: POPULAR DESTINATIONS */}
        <div className="premium-card rounded-xl p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Top Destination Swarm Queries
            </h3>
            <span className="text-[10px] text-slate-500 font-bold px-2 py-0.5 bg-slate-900 border border-slate-800 rounded">
              Bar Frequency
            </span>
          </div>
          <div className="h-64 relative">
            {analytics?.topDestinations && analytics.topDestinations.length > 0 ? (
              <Bar data={destinationData} options={chartOptions} />
            ) : (
              <span className="text-xs text-slate-550">No statistics available</span>
            )}
          </div>
        </div>
      </div>

      {/* FILTER & DATA TABLE CONTROLS */}
      <div className="premium-card rounded-xl overflow-hidden shadow-xl border border-card-border">
        {/* Table header with filters */}
        <div className="p-5 border-b border-card-border bg-slate-900/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <BarChart3 className="h-4.5 w-4.5 text-primary" />
            Global Trip Operations Log
          </h3>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search filter destination */}
            <div className="relative">
              <input
                type="text"
                value={searchDestination}
                onChange={(e) => {
                  setSearchDestination(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-slate-850 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary w-40"
                placeholder="Search Destination..."
              />
            </div>

            {/* Selection status */}
            <div className="flex items-center gap-1">
              <Filter className="h-3.5 w-3.5 text-slate-500" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-slate-850 border border-slate-700 rounded-lg px-2 w-32 py-1.5 text-xs text-slate-305 focus:outline-none focus:border-primary"
              >
                <option value="">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="PLANNED">Planned</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        {/* Global Trip Records Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-left text-xs text-slate-300">
            <thead className="bg-slate-900/50 font-bold uppercase text-[10px] text-slate-400 tracking-wider">
              <tr>
                <th className="px-6 py-4">Trip Session ID</th>
                <th className="px-6 py-4">Traveler Profile</th>
                <th className="px-6 py-4">Destination</th>
                <th className="px-6 py-4">Budget Cap</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Created At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850 bg-slate-950/10">
              {tripsData?.trips && tripsData.trips.length > 0 ? (
                tripsData.trips.map((trip: TripItem) => (
                  <tr 
                    key={trip.sessionId} 
                    onClick={() => setSelectedTrip(trip)}
                    className="hover:bg-slate-800/20 transition cursor-pointer"
                  >
                    <td className="px-6 py-4.5 font-mono text-slate-400 font-medium">
                      #{trip.sessionId.substring(0, 10)}
                    </td>
                    <td className="px-6 py-4.5">
                      <div className="font-semibold text-slate-200">
                        {trip.userId?.name || 'Anonymous Agent'}
                      </div>
                      <div className="text-[10px] text-slate-500">{trip.userId?.email || 'no-email'}</div>
                    </td>
                    <td className="px-6 py-4.5 font-semibold text-slate-300">
                      {trip.input.destination || 'Not determined'}
                    </td>
                    <td className="px-6 py-4.5 font-bold text-slate-200">
                      ₹{trip.input.budget_inr ? trip.input.budget_inr.toLocaleString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4.5 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          trip.status === 'CONFIRMED'
                            ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/25'
                            : trip.status === 'PLANNED'
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/25'
                            : trip.status === 'CANCELLED'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/25'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/25'
                        }`}
                      >
                        {trip.status}
                      </span>
                    </td>
                    <td className="px-6 py-4.5 text-right font-mono text-slate-500">
                      {new Date(trip.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    No matching trip plans found for target query parameters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar controls */}
        {totalPages > 1 && (
          <div className="p-4 bg-slate-900/30 border-t border-card-border flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Showing Page {currentPage} of {totalPages} ({tripsData?.total || 0} items)
            </span>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((c) => Math.max(1, c - 1))}
                className="bg-slate-800 border border-slate-700 disabled:opacity-40 rounded px-3 py-1.5 text-xs text-slate-300 font-semibold hover:bg-slate-700 transition"
              >
                Previous
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((c) => Math.min(totalPages, c + 1))}
                className="bg-slate-800 border border-slate-700 disabled:opacity-40 rounded px-3 py-1.5 text-xs text-slate-300 font-semibold hover:bg-slate-700 transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* DETAILED TRIP PLAN DIALOG/MODAL (READONLY) */}
      {selectedTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl max-h-[85vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
            
            {/* Modal Close Button */}
            <button
              onClick={() => setSelectedTrip(null)}
              className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition focus:outline-none"
            >
              <span className="text-xl font-bold">&times;</span>
            </button>

            {/* Header */}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-extrabold text-white">
                  Trip Plan Detailed View
                </h2>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    selectedTrip.status === 'CONFIRMED'
                      ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/25'
                      : selectedTrip.status === 'PLANNED'
                      ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/25'
                      : selectedTrip.status === 'CANCELLED'
                      ? 'bg-red-500/10 text-red-400 border border-red-500/25'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/25'
                  }`}
                >
                  {selectedTrip.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Session ID: <strong>{selectedTrip.sessionId}</strong> | Created by: <strong>{selectedTrip.userId?.name || 'Anonymous'}</strong> ({selectedTrip.userId?.email || 'no email'})
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Left Side: Parameters & Budget Details */}
              <div className="md:col-span-1 space-y-4">
                <div className="bg-slate-950/40 p-4 border border-slate-800 rounded-xl space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                    Trip Details
                  </h3>
                  <div className="space-y-2 text-xs text-slate-350">
                    <div>
                      <span className="text-slate-550 block text-[10px] uppercase font-bold">Destination</span>
                      <span className="font-semibold text-slate-205">{selectedTrip.input.destination || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-550 block text-[10px] uppercase font-bold">Origin</span>
                      <span className="font-semibold text-slate-205">{selectedTrip.input.origin || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-550 block text-[10px] uppercase font-bold">Dates</span>
                      <span className="font-semibold text-slate-205">
                        {selectedTrip.input.start_date || 'YYYY-MM-DD'} – {selectedTrip.input.end_date || 'YYYY-MM-DD'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-550 block text-[10px] uppercase font-bold">Travelers</span>
                      <span className="font-semibold text-slate-205">{selectedTrip.input.travelers || 0}</span>
                    </div>
                    <div>
                      <span className="text-slate-550 block text-[10px] uppercase font-bold">Interests</span>
                      <span className="font-semibold text-slate-205">
                        {selectedTrip.input.interests?.join(', ') || 'General'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Budget assessment */}
                {selectedTrip.budget && (
                  <div className="bg-slate-950/40 p-4 border border-slate-800 rounded-xl space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Cost Breakdown (INR)
                    </h3>
                    
                    <div className="divide-y divide-slate-850 text-xs text-slate-350">
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-550">Transit</span>
                        <span className="font-mono text-slate-250">₹{(selectedTrip.budget.breakdown?.transport ?? 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-550">Lodging</span>
                        <span className="font-mono text-slate-250">₹{(selectedTrip.budget.breakdown?.accommodation ?? 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-550">Food & Meals</span>
                        <span className="font-mono text-slate-250">₹{(selectedTrip.budget.breakdown?.food ?? 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-550">Activities</span>
                        <span className="font-mono text-slate-250">₹{(selectedTrip.budget.breakdown?.activities ?? 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-550">Local Transport</span>
                        <span className="font-mono text-slate-250">₹{(selectedTrip.budget.breakdown?.local_transport ?? 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-550">Emergency Fund</span>
                        <span className="font-mono text-slate-250">₹{(selectedTrip.budget.breakdown?.emergency_fund ?? 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between py-2.5 font-bold text-slate-200">
                        <span>Total Cost</span>
                        <span className="font-mono text-emerald-400">
                          ₹{(selectedTrip.budget.total_cost_inr ?? selectedTrip.budget.total_estimated_cost ?? 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Side: Full generated markdown plan */}
              <div className="md:col-span-2 space-y-4">
                <div className="bg-slate-950/45 p-5 border border-slate-800 rounded-xl space-y-4 max-h-[55vh] overflow-y-auto">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                    Formatted Travel Itinerary
                  </h3>
                  {selectedTrip.formattedPlan ? (
                    <div className="prose prose-invert max-w-none text-xs text-slate-350 space-y-3 leading-relaxed">
                      <ReactMarkdown>{selectedTrip.formattedPlan}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-505 italic">No formatted plan or itinerary has been generated for this session yet.</p>
                  )}
                </div>
              </div>

            </div>

          </div>
        </div>
      )}
    </div>
  );
}
