import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, Plane, Calendar, Users, IndianRupee, Eye, ArrowRight, Sparkles, Trash2, CalendarRange } from 'lucide-react';
import api from '../lib/axios';

interface TripSummary {
  sessionId: string;
  status: 'DRAFT' | 'PLANNED' | 'CONFIRMED' | 'CANCELLED';
  createdAt: string;
  input: {
    destination?: string;
    start_date?: string;
    end_date?: string;
    budget_inr?: number;
    travelers?: number;
  };
}

export default function MyTripsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'ALL' | 'ACTIVE' | 'DRAFTS' | 'CANCELLED'>('ALL');

  // Fetch traveler's trips list
  const { data, isLoading } = useQuery<{ trips: TripSummary[] }>({
    queryKey: ['userTrips'],
    queryFn: async () => {
      try {
        const res = await api.get('/trips');
        return res.data;
      } catch (err) {
        // Mock fallback if offline / bootstrap phase
        return {
          trips: [
            {
              sessionId: 'oop-oty-1122',
              status: 'CONFIRMED',
              createdAt: new Date(Date.now() - 86400000).toISOString(),
              input: {
                destination: 'Ooty',
                start_date: '2026-10-15',
                end_date: '2026-10-18',
                budget_inr: 25000,
                travelers: 2,
              },
            },
            {
              sessionId: 'mun-mnr-3344',
              status: 'PLANNED',
              createdAt: new Date(Date.now() - 172800000).toISOString(),
              input: {
                destination: 'Munnar',
                start_date: '2026-11-20',
                end_date: '2026-11-23',
                budget_inr: 18000,
                travelers: 1,
              },
            },
            {
              sessionId: 'goa-goa-5566',
              status: 'DRAFT',
              createdAt: new Date(Date.now() - 259200000).toISOString(),
              input: {
                destination: 'Goa',
                budget_inr: 50000,
                travelers: 4,
              },
            },
          ],
        };
      }
    },
  });

  // Mutation to cancel a trip (soft delete - updates status to CANCELLED)
  const cancelMutation = useMutation({
    mutationFn: async (tripId: string) => {
      const res = await api.delete(`/trips/${tripId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userTrips'] });
    },
    onError: (err: any) => {
      alert(`Failed to cancel trip: ${err.message}`);
    },
  });

  const handleCancelTrip = (tripId: string, destination: string) => {
    if (window.confirm(`Are you sure you want to cancel your trip plan to ${destination || 'this destination'}?`)) {
      cancelMutation.mutate(tripId);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20';
      case 'PLANNED':
        return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
      case 'CANCELLED':
        return 'bg-red-500/10 text-red-400 border border-red-500/20';
      default:
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
    }
  };

  // Filter trips based on active UI tabs
  const filteredTrips = data?.trips?.filter((trip) => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'ACTIVE') return trip.status === 'CONFIRMED' || trip.status === 'PLANNED';
    if (activeTab === 'DRAFTS') return trip.status === 'DRAFT';
    if (activeTab === 'CANCELLED') return trip.status === 'CANCELLED';
    return true;
  }) || [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* HEADER ROW */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white glow-text mb-1 flex items-center gap-2.5">
            My Travel Itineraries
          </h1>
          <p className="text-slate-400 text-sm">
            Access or cancel your trip inquiries structured by the AI swarm
          </p>
        </div>

        <button
          onClick={() => navigate('/dashboard/plan')}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-opacity-90 px-5 py-3 text-sm font-semibold text-white transition active:scale-95 hover:shadow-lg hover:shadow-primary/20 shrink-0"
        >
          <Plus className="h-5 w-5" />
          Plan New Trip
        </button>
      </div>

      {/* FILTER TABS */}
      <div className="flex border-b border-card-border bg-slate-950/20 rounded-lg p-1 max-w-lg">
        <button
          onClick={() => setActiveTab('ALL')}
          className={`flex-1 py-2 text-xs font-bold rounded-md transition ${
            activeTab === 'ALL'
              ? 'bg-primary text-white shadow'
              : 'text-slate-450 hover:text-slate-205'
          }`}
        >
          All ({data?.trips?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('ACTIVE')}
          className={`flex-1 py-2 text-xs font-bold rounded-md transition ${
            activeTab === 'ACTIVE'
              ? 'bg-primary text-white shadow'
              : 'text-slate-450 hover:text-slate-205'
          }`}
        >
          Active ({data?.trips?.filter((t) => t.status === 'CONFIRMED' || t.status === 'PLANNED').length || 0})
        </button>
        <button
          onClick={() => setActiveTab('DRAFTS')}
          className={`flex-1 py-2 text-xs font-bold rounded-md transition ${
            activeTab === 'DRAFTS'
              ? 'bg-primary text-white shadow'
              : 'text-slate-450 hover:text-slate-205'
          }`}
        >
          Drafts ({data?.trips?.filter((t) => t.status === 'DRAFT').length || 0})
        </button>
        <button
          onClick={() => setActiveTab('CANCELLED')}
          className={`flex-1 py-2 text-xs font-bold rounded-md transition ${
            activeTab === 'CANCELLED'
              ? 'bg-primary text-white shadow'
              : 'text-slate-450 hover:text-slate-205'
          }`}
        >
          Cancelled ({data?.trips?.filter((t) => t.status === 'CANCELLED').length || 0})
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <Plane className="h-10 w-10 text-primary rotate-45 animate-spin" />
        </div>
      ) : filteredTrips.length === 0 ? (
        <div className="premium-card rounded-2xl p-12 text-center max-w-xl mx-auto flex flex-col items-center">
          <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 border border-primary/20 text-primary animate-pulse">
            <CalendarRange className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No itineraries in this section</h3>
          <p className="text-slate-400 text-sm mb-6">
            Filter selection does not contain any related travel records.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredTrips.map((trip) => (
            <div key={trip.sessionId} className="premium-card rounded-xl overflow-hidden flex flex-col justify-between">
              {/* Card top */}
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-slate-500 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                    #{trip.sessionId.substring(0, 8)}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${getStatusBadgeClass(trip.status)}`}>
                    {trip.status}
                  </span>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-100 flex items-center gap-1.5">
                    ✈️ {trip.input.destination || <span className="text-slate-500 italic">Exploring Options</span>}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Created: {new Date(trip.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3.5 pt-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Calendar className="h-4 w-4 text-primary shrink-0" />
                    <span>
                      {trip.input.start_date
                        ? `${new Date(trip.input.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                        : 'Dates pending'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Users className="h-4 w-4 text-primary shrink-0" />
                    <span>{trip.input.travelers ? `${trip.input.travelers} Travelers` : 'No traveler info'}</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-400 col-span-2">
                    <IndianRupee className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span className="font-semibold">
                      Budget Cap: {trip.input.budget_inr ? `₹${trip.input.budget_inr.toLocaleString()}` : 'Budget pending'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action footer */}
              <div className="bg-slate-900/40 p-4 border-t border-card-border flex items-center justify-between">
                <div>
                  {trip.status !== 'CANCELLED' && (
                    <button
                      onClick={() => handleCancelTrip(trip.sessionId, trip.input.destination || '')}
                      disabled={cancelMutation.isPending}
                      className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-red-400 transition"
                      title="Cancel Booking"
                    >
                      <Trash2 className="h-4 w-4" />
                      Cancel Plan
                    </button>
                  )}
                </div>

                <Link
                  to={`/dashboard/plan?tripId=${trip.sessionId}`}
                  className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-indigo-400 transition"
                >
                  {trip.status === 'CONFIRMED' ? (
                    <>
                      <Eye className="h-4 w-4" />
                      View Confirmation
                    </>
                  ) : trip.status === 'PLANNED' ? (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Review & Approve
                    </>
                  ) : (
                    <>
                      <ArrowRight className="h-4 w-4" />
                      Resume Planning
                    </>
                  )}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
