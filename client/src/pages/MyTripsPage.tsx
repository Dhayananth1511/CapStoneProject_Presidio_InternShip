import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, Compass, Calendar, Users, IndianRupee, Eye, ArrowRight, Sparkles, Trash2, CalendarRange, AlertTriangle } from 'lucide-react';
import api from '../lib/axios';
import { useThemeStore } from '../store/themeStore';

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
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<'ALL' | 'PLANNED' | 'CONFIRMED' | 'DRAFTS' | 'CANCELLED'>('ALL');
  const [tripToCancel, setTripToCancel] = useState<{ id: string; name: string } | null>(null);

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
    setTripToCancel({ id: tripId, name: destination || 'this destination' });
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
    if (activeTab === 'PLANNED') return trip.status === 'PLANNED';
    if (activeTab === 'CONFIRMED') return trip.status === 'CONFIRMED';
    if (activeTab === 'DRAFTS') return trip.status === 'DRAFT';
    if (activeTab === 'CANCELLED') return trip.status === 'CANCELLED';
    return true;
  }) || [];

  return (
    <div className={`mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8 min-h-[calc(100vh-4rem)] transition-colors duration-300 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
      {/* HEADER ROW */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight glow-text mb-1 flex items-center gap-2.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
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
      <div className={`flex border rounded-lg p-1 max-w-2xl transition-colors ${isDark ? 'border-card-border bg-slate-950/20' : 'border-slate-205 bg-slate-100'}`}>
        <button
          onClick={() => setActiveTab('ALL')}
          className={`flex-1 py-2 text-xs font-bold rounded-md transition cursor-pointer ${
            activeTab === 'ALL'
              ? 'bg-primary text-white shadow'
              : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          All ({data?.trips?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('PLANNED')}
          className={`flex-1 py-2 text-xs font-bold rounded-md transition cursor-pointer ${
            activeTab === 'PLANNED'
              ? 'bg-indigo-500 text-white shadow'
              : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          Planned ({data?.trips?.filter((t) => t.status === 'PLANNED').length || 0})
        </button>
        <button
          onClick={() => setActiveTab('CONFIRMED')}
          className={`flex-1 py-2 text-xs font-bold rounded-md transition cursor-pointer ${
            activeTab === 'CONFIRMED'
              ? 'bg-emerald-500 text-white shadow'
              : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          Confirmed ({data?.trips?.filter((t) => t.status === 'CONFIRMED').length || 0})
        </button>
        <button
          onClick={() => setActiveTab('DRAFTS')}
          className={`flex-1 py-2 text-xs font-bold rounded-md transition cursor-pointer ${
            activeTab === 'DRAFTS'
              ? 'bg-amber-500 text-white shadow'
              : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          Drafts ({data?.trips?.filter((t) => t.status === 'DRAFT').length || 0})
        </button>
        <button
          onClick={() => setActiveTab('CANCELLED')}
          className={`flex-1 py-2 text-xs font-bold rounded-md transition cursor-pointer ${
            activeTab === 'CANCELLED'
              ? 'bg-red-500 text-white shadow'
              : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          Cancelled ({data?.trips?.filter((t) => t.status === 'CANCELLED').length || 0})
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <Compass className="h-10 w-10 text-primary animate-spin" />
        </div>
      ) : filteredTrips.length === 0 ? (
        <div className={`premium-card rounded-2xl p-12 text-center max-w-xl mx-auto flex flex-col items-center border ${isDark ? 'border-indigo-500/10' : 'border-slate-200'}`}>
          <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 border border-primary/20 text-primary animate-pulse">
            <CalendarRange className="h-8 w-8" />
          </div>
          <h3 className={`text-lg font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>No itineraries in this section</h3>
          <p className={`text-sm mb-6 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Filter selection does not contain any related travel records.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredTrips.map((trip) => (
            <div key={trip.sessionId} className={`premium-card rounded-xl overflow-hidden flex flex-col justify-between border ${isDark ? 'border-card-border/60' : 'border-slate-200'}`}>
              {/* Card top */}
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${isDark ? 'text-slate-500 bg-slate-900 border-slate-800' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>
                    #{trip.sessionId.substring(0, 8)}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${getStatusBadgeClass(trip.status)}`}>
                    {trip.status}
                  </span>
                </div>

                <div>
                  <h3 className={`text-xl font-bold flex items-center gap-1.5 ${isDark ? 'text-slate-100' : 'text-slate-850'}`}>
                    ✈️ {trip.input.destination || <span className="text-slate-500 italic">Exploring Options</span>}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Created: {new Date(trip.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3.5 pt-2">
                  <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    <Calendar className="h-4 w-4 text-primary shrink-0" />
                    <span>
                      {trip.input.start_date
                        ? `${new Date(trip.input.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${trip.input.end_date ? ` - ${new Date(trip.input.end_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}`
                        : 'Dates pending'}
                    </span>
                  </div>

                  <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    <Users className="h-4 w-4 text-primary shrink-0" />
                    <span>{trip.input.travelers ? `${trip.input.travelers} Travelers` : 'No traveler info'}</span>
                  </div>

                  <div className={`flex items-center gap-1.5 text-xs col-span-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    <IndianRupee className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span className="font-semibold">
                      Budget Cap: {trip.input.budget_inr ? `₹${trip.input.budget_inr.toLocaleString()}` : 'Budget pending'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action footer */}
              <div className={`p-4 border-t flex items-center justify-between ${isDark ? 'bg-slate-900/40 border-card-border' : 'bg-slate-100 border-slate-200'}`}>
                <div>
                  {trip.status !== 'CANCELLED' && (
                    <button
                      onClick={() => handleCancelTrip(trip.sessionId, trip.input.destination || '')}
                      disabled={cancelMutation.isPending}
                      className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-red-400 transition cursor-pointer"
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

      {tripToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className={`rounded-2xl max-w-sm w-full p-6 mx-4 border shadow-2xl space-y-4 ${isDark ? 'bg-[#121824]/95 border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-3 text-amber-500">
              <div className="h-10 w-10 bg-amber-500/10 rounded-xl flex items-center justify-center border border-amber-500/20">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Cancel Trip Plan</h3>
                <p className="text-[10px] text-slate-400">This action cannot be undone.</p>
              </div>
            </div>
            <p className={`text-xs leading-normal ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Are you sure you want to cancel your trip plan to <span className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{tripToCancel.name}</span>?
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setTripToCancel(null)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition active:scale-95 cursor-pointer border ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-transparent' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'}`}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  cancelMutation.mutate(tripToCancel.id);
                  setTripToCancel(null);
                }}
                disabled={cancelMutation.isPending}
                className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold text-white transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
