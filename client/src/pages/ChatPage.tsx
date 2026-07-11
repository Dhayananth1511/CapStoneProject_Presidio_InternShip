import { useState, useRef, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import {
  Send,
  Bot,
  User,
  Loader2,
  Sun,
  MapPin,
  Users,
  IndianRupee,
  Check,
  X,
  AlertTriangle,
  Sparkles,
  Building2,
  Car,
  CalendarDays,
  CalendarCheck,
  ArrowLeft,
  Clock,
  Navigation,
  ChevronDown,
  ChevronUp,
  Trash2,
} from 'lucide-react';
import api from '../lib/axios';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tripIdParam = searchParams.get('tripId');

  const [message, setMessage] = useState('');
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({});
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hi! I'm VoyageFlow, your Lead Travel Supervisor Agent. 🗺️\n\nWhere would you like to travel next? Let me know the destination, dates, budget, or number of travelers to begin!",
    },
  ]);
  const [tripId, setTripId] = useState<string | undefined>(tripIdParam || undefined);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [context, setContext] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'inspector' | 'itinerary'>('inspector');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch existing trip on mount if tripId query param is present
  const { isLoading: isLoadingTrip } = useQuery({
    queryKey: ['activeTrip', tripIdParam],
    queryFn: async () => {
      if (!tripIdParam) return null;
      try {
        const res = await api.get(`/trips/${tripIdParam}`);
        const trip = res.data.trip;
        if (trip) {
          setTripId(trip.sessionId);
          setContext(trip);
          if (trip.conversationHistory && trip.conversationHistory.length > 0) {
            setMessages(trip.conversationHistory);
          }
          if (trip.status === 'PLANNED' || trip.status === 'CONFIRMED') {
            setActiveTab('itinerary');
          }
        }
        return trip;
      } catch (err) {
        console.error('Failed to load trip', err);
        return null;
      }
    },
    enabled: !!tripIdParam,
  });

  // Scroll to bottom whenever messages update
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeStep]);

  // Mutation for sending chat messages to the Planner Agent Swarm
  const chatMutation = useMutation({
    mutationFn: async (payload: { message: string; tripId?: string }) => {
      setActiveStep('Supervisor Routing & Slot Extraction...');
      await new Promise((r) => setTimeout(r, 600));

      setActiveStep('Running Programmatic Context Validations...');
      await new Promise((r) => setTimeout(r, 550));

      setActiveStep('Coordinating MCP Parallel Retrieval (Weather, Hotels, Transport)...');
      await new Promise((r) => setTimeout(r, 900));

      setActiveStep('Performing Budget Calibration & Conflict Checks...');
      await new Promise((r) => setTimeout(r, 600));

      setActiveStep('Generating Day-by-Day Itinerary Layout...');
      await new Promise((r) => setTimeout(r, 600));

      const res = await api.post('/trips/plan', payload);
      return res.data;
    },
    onSuccess: (data) => {
      setActiveStep(null);
      if (data.tripId) setTripId(data.tripId);
      if (data.context) {
        setContext(data.context);
        if (data.context.status === 'PLANNED') {
          setActiveTab('itinerary');
        }
      }

      if (data.status === 'NEEDS_INFO' && data.clarifyingQuestion) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.clarifyingQuestion },
        ]);
      } else if (data.status === 'PLANNED' && data.plan) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Here is the curated trip plan for your approval:\n\n${data.plan}`,
          },
        ]);
      }
    },
    onError: (err: any) => {
      setActiveStep(null);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ Planning Agent Error: ${
            err.response?.data?.message || 'Connection to the agent swarm timed out. Please try again.'
          }`,
        },
      ]);
    },
  });

  // Mutation for approving / confirming the trip (HITL Gate)
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!tripId) return;
      const res = await api.post(`/trips/${tripId}/approve`);
      return res.data;
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `🎉 Awesome! The trip has been successfully approved & confirmed.\n\n🔑 **Booking References:**\n* 🏨 **Hotel:** \`${data.bookingRefs?.hotel}\`\n* ✈️ **Transport:** \`${data.bookingRefs?.transport}\`\n* 📅 **Calendar integration:** Created Google Calendar event (\`${data.bookingRefs?.calendar}\`)`,
        },
      ]);
      if (context) setContext({ ...context, status: 'CONFIRMED', booking: { refs: data.bookingRefs } });
    },
    onError: (err: any) => {
      alert(`Approval error: ${err.message}`);
    },
  });

  // Mutation for rejecting / replanning the trip (HITL rejection)
  const rejectMutation = useMutation({
    mutationFn: async (reason: string) => {
      setActiveStep('Replanning Agent: Clearing Selective Stale Contexts...');
      await new Promise((r) => setTimeout(r, 650));
      setActiveStep('Recycling Swarm Pipelines & Re-calculating...');
      const res = await api.post(`/trips/${tripId}/reject`, { reason });
      return res.data;
    },
    onSuccess: (data) => {
      setActiveStep(null);
      if (data.context) {
        setContext(data.context);
        if (data.context.status === 'PLANNED') {
          setActiveTab('itinerary');
        }
      }
      if (data.plan) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `🔄 I modified your plan based on your feedback:\n\n${data.plan}`,
          },
        ]);
      }
    },
    onError: (err: any) => {
      setActiveStep(null);
      alert(`Replanning error: ${err.message}`);
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || chatMutation.isPending || approveMutation.isPending || rejectMutation.isPending) return;

    const userMsg = message;
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setMessage('');

    chatMutation.mutate({ message: userMsg, tripId });
  };

  const handleAlternativeSelect = (suggestion: string) => {
    setMessages((prev) => [...prev, { role: 'user', content: `Adjust my plan: ${suggestion}` }]);
    chatMutation.mutate({ message: `Adjust plan: ${suggestion}`, tripId });
  };

  const handleDeleteTrip = async () => {
    if (!context?.sessionId) return;
    if (window.confirm('Are you sure you want to discard and cancel this current trip plan?')) {
      try {
        await api.delete(`/trips/${context.sessionId}`);
        navigate('/dashboard');
      } catch (err: any) {
        alert('Failed to cancel trip: ' + (err.response?.data?.message || err.message));
      }
    }
  };

  const toggleDay = (dayNum: number) => {
    setExpandedDays((prev) => ({
      ...prev,
      [dayNum]: prev[dayNum] === undefined ? false : !prev[dayNum],
    }));
  };

  // Re-plan with rejection field
  const [replanReason, setReplanReason] = useState('');
  const [showReplanInput, setShowReplanInput] = useState(false);

  const handleReplanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replanReason.trim()) return;
    setMessages((prev) => [...prev, { role: 'user', content: `Re-plan requested: ${replanReason}` }]);
    rejectMutation.mutate(replanReason);
    setReplanReason('');
    setShowReplanInput(false);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-dark-bg md:flex-row">
      
      {/* LEFT CANVAS: Shared Swarm Trip Context Inspector & Visual Itinerary Timeline (Large Panel) */}
      <div className="flex flex-1 flex-col overflow-hidden bg-slate-950/10">
        {/* Toggle Inspector vs. Interactive Timeline Tabs */}
        <div className="grid grid-cols-2 border-b border-card-border bg-slate-900/30 shrink-0">
          <button
            onClick={() => setActiveTab('inspector')}
            className={`py-3.5 text-xs font-bold uppercase tracking-wider transition ${
              activeTab === 'inspector'
                ? 'border-b-2 border-primary text-white bg-slate-900/50'
                : 'text-slate-400 hover:text-slate-205'
            }`}
          >
            Swarm Inspector
          </button>
          <button
            onClick={() => setActiveTab('itinerary')}
            className={`py-3.5 text-xs font-bold uppercase tracking-wider transition relative ${
              activeTab === 'itinerary'
                ? 'border-b-2 border-primary text-white bg-slate-900/50'
                : 'text-slate-400 hover:text-slate-205'
            } ${
              context?.itinerary?.days && context.status !== 'DRAFT'
                ? 'after:absolute after:top-2 after:right-12 after:h-2 after:w-2 after:rounded-full after:bg-primary'
                : ''
            }`}
          >
            Interactive Timeline
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {!context ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-slate-500">
              <Sparkles className="h-10 w-10 mb-3 text-slate-700 animate-pulse" />
              <p className="text-sm font-medium">No Active Context</p>
              <p className="text-xs px-6 mt-1 text-slate-650">
                Introduce travel requirements in the chat to spin up the agent swarm.
              </p>
            </div>
          ) : activeTab === 'inspector' ? (
            /* TAB 1: SWARM INSPECTOR DETAILS */
            <div className="space-y-4">
              {/* STAGE & STATUS CARD */}
              <div className="premium-card rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-semibold mb-0.5">TRIP STATUS</p>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        context.status === 'CONFIRMED'
                          ? 'bg-emerald-500 animate-pulse'
                          : context.status === 'PLANNED'
                          ? 'bg-indigo-400'
                          : 'bg-amber-400'
                      }`}
                    />
                    <span className="font-bold text-sm tracking-wide text-white uppercase">{context.status}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-right text-slate-500 mb-0.5 font-semibold">SESSION ID</p>
                  <span className="font-mono text-xs text-slate-400 bg-slate-900 border border-slate-800 px-2 py-1 rounded">
                    {context.sessionId.substring(0, 8)}
                  </span>
                </div>
              </div>

              {/* EXTRACTED SLOTS */}
              <div className="premium-card rounded-xl p-5 space-y-3.5">
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                  <MapPin className="h-4.5 w-4.5 text-primary" /> Checked Parameters
                </h4>
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 block font-bold uppercase mb-0.5">Destination</span>
                    <span className="text-xs font-semibold text-slate-200">
                      {context.input.destination || <em className="text-slate-600">Pending...</em>}
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 block font-bold uppercase mb-0.5">Origin</span>
                    <span className="text-xs font-semibold text-slate-205">
                      {context.input.origin || <em className="text-slate-600">Not selected</em>}
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 block font-bold uppercase mb-0.5">Travelers</span>
                    <span className="text-xs font-semibold text-slate-205 flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-primary" />
                      {context.input.travelers || 0}
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 block font-bold uppercase mb-0.5">Cap Limit</span>
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-0.5">
                      <IndianRupee className="h-3.5 w-3.5 text-emerald-500" />
                      {context.input.budget_inr ? context.input.budget_inr.toLocaleString() : 0}
                    </span>
                  </div>
                  <div className="bg-slate-900/60 col-span-2 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 block font-bold uppercase mb-0.5 font-sans">Dates</span>
                    <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <CalendarDays className="h-4.5 w-4.5 text-primary" />
                      {context.input.start_date || 'YYYY-MM-DD'} – {context.input.end_date || 'YYYY-MM-DD'}
                    </span>
                  </div>
                </div>
              </div>

              {/* DYNAMIC RETRIEVED DATA */}
              {context.weather && (
                <div className="premium-card rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                    <Sun className="h-4.5 w-4.5 text-amber-500" /> Climate Specialist Agent
                  </h4>
                  <div className="bg-indigo-950/20 p-3 rounded-lg border border-slate-800 text-xs space-y-1.5">
                    <p className="text-slate-300 font-medium">
                      ⛅ **Conditions**: {context.weather.forecast || 'Sunny Skies'} {context.weather.average_temp_c ? `(Avg Temp: ${context.weather.average_temp_c}°C)` : ''}
                    </p>
                    {context.weather.reasoning && (
                      <p className="text-indigo-300 mt-2 bg-indigo-950/45 p-2 rounded border border-indigo-900/40 text-[11px] leading-relaxed">
                        🧠 **Weather Analysis**: {context.weather.reasoning}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {context.accommodation && (
                <div className="premium-card rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                    <Building2 className="h-4.5 w-4.5 text-primary" /> Lodging Specialist Agent
                  </h4>
                  <div className="bg-indigo-950/20 p-3 rounded-lg border border-slate-800 text-xs space-y-1.5">
                    <p className="font-semibold text-slate-200">{context.accommodation.recommended || 'Hotel Options matched'}</p>
                    {context.accommodation.cost_per_night && <p className="text-slate-400">Estimated Cost: ₹{context.accommodation.cost_per_night.toLocaleString()} / night</p>}
                    {context.accommodation.reasoning && (
                      <p className="text-indigo-300 mt-2 bg-indigo-950/45 p-2 rounded border border-indigo-900/40 text-[11px] leading-relaxed">
                        🧠 **Lodging Analysis**: {context.accommodation.reasoning}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {context.transport && (
                <div className="premium-card rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                    <Car className="h-4.5 w-4.5 text-emerald-450" /> Transit Specialist Agent
                  </h4>
                  <div className="bg-indigo-950/20 p-3 rounded-lg border border-slate-800 text-xs space-y-1.5">
                    {context.transport.best_option && <p className="text-slate-300">🛫 **Best Option**: {context.transport.best_option}</p>}
                    {context.transport.price && <p className="text-emerald-400 font-semibold">Total Price: ₹{context.transport.price.toLocaleString()}</p>}
                    {context.transport.reasoning && (
                      <p className="text-indigo-300 mt-2 bg-indigo-950/45 p-2 rounded border border-indigo-900/40 text-[11px] leading-relaxed">
                        🧠 **Transit Analysis**: {context.transport.reasoning}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {context.activities && (
                <div className="premium-card rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                    <MapPin className="h-4.5 w-4.5 text-primary" /> Sightseeing Specialist Agent
                  </h4>
                  <div className="bg-indigo-950/20 p-3 rounded-lg border border-slate-800 text-xs space-y-1.5">
                    <p className="text-slate-300 font-medium">🗺️ **Matched Interests**: {(context.input.interests || []).join(', ') || 'General Sightseeing'}</p>
                    {context.activities.reasoning && (
                      <p className="text-indigo-300 mt-2 bg-indigo-950/45 p-2 rounded border border-indigo-900/40 text-[11px] leading-relaxed">
                        🧠 **Activity Analysis**: {context.activities.reasoning}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* BUDGET ASSESSMENT */}
              {context.budget && (
                <div className="premium-card rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                    <IndianRupee className="h-4.5 w-4.5 text-emerald-450" /> Swarm Budget Assessment
                  </h4>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
                      <span className="text-[10px] text-slate-500 block font-bold">Estimated Total</span>
                      <span className="text-xs font-bold text-slate-200">
                        ₹{context.budget.total_estimated_cost?.toLocaleString()}
                      </span>
                    </div>
                    <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
                      <span className="text-[10px] text-slate-500 block font-bold">Status</span>
                      <span
                        className={`text-xs font-bold ${
                          context.budget.is_feasible ? 'text-emerald-450' : 'text-red-400'
                        }`}
                      >
                        {context.budget.is_feasible ? 'Feasible' : 'Infeasible'}
                      </span>
                    </div>
                  </div>

                  {!context.budget.is_feasible && context.budget.alternatives && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-2.5">
                      <div className="flex gap-1.5 text-red-400 text-xs font-semibold">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>Plan exceeds your budget constraint!</span>
                      </div>
                      <p className="text-[11px] text-slate-450">
                        Select one of the alternatives computed by the Budget Agent:
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {context.budget.alternatives.map((altOption: string, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => handleAlternativeSelect(altOption)}
                            className="w-full text-left bg-slate-900 hover:bg-indigo-950 text-indigo-305 hover:text-indigo-400 border border-indigo-900/30 rounded px-2.5 py-1.5 text-xs transition animate-fadeIn"
                          >
                            💸 {altOption}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* TAB 2: INTERACTIVE TIME LINE ITINERARY */
            <div className="space-y-6">
              {!context.itinerary?.days || context.status === 'DRAFT' ? (
                <div className="text-center py-16 text-slate-500 space-y-3">
                  <CalendarCheck className="h-10 w-10 mx-auto text-slate-700 animate-pulse" />
                  <p className="text-sm font-semibold">Itinerary Not Generated Yet</p>
                  <p className="text-xs px-6 text-slate-650">
                    Complete all parameter slot details in the chat and run full plan generation.
                  </p>
                </div>
              ) : (
                <div className="space-y-6 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-indigo-950">
                  {context.itinerary.days.map((dayItem: any, idx: number) => {
                    const isDayExpanded = expandedDays[dayItem.day] === undefined ? dayItem.day === 1 : expandedDays[dayItem.day];
                    return (
                      <div key={idx} className="relative pl-8 space-y-3">
                        {/* Node point */}
                        <span className="absolute left-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary border-4 border-slate-900" />

                        <div className="premium-card rounded-xl p-4 space-y-2.5">
                          <div
                            onClick={() => toggleDay(dayItem.day)}
                            className="flex justify-between items-start cursor-pointer group select-none"
                          >
                            <div>
                              <span className="text-[10px] font-bold text-primary uppercase tracking-widest block mb-0.5">
                                Day {dayItem.day} – {dayItem.date || ''}
                              </span>
                              <h4 className="text-sm font-bold text-slate-105 group-hover:text-primary transition flex items-center gap-1.5">
                                {dayItem.title || 'Sightseeing'}
                                {isDayExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-slate-450 shrink-0" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-slate-455 shrink-0" />
                                )}
                              </h4>
                            </div>
                            {dayItem.daily_total_inr > 0 && (
                              <span className="text-[10px] font-bold bg-slate-900 border border-slate-800 text-emerald-450 px-2 py-0.5 rounded leading-none">
                                ₹{dayItem.daily_total_inr.toLocaleString()}
                              </span>
                            )}
                          </div>

                          {isDayExpanded && (
                            <div className="space-y-3 pt-2.5 border-t border-card-border/40 animate-fadeIn">
                              {dayItem.weather_note && (
                                <div className="text-[11px] text-slate-450 bg-indigo-950/20 px-2.5 py-1.5 rounded border border-indigo-900/10 italic">
                                  ⛅ {dayItem.weather_note}
                                </div>
                              )}

                              {/* Activities list */}
                              {dayItem.schedule && dayItem.schedule.length > 0 ? (
                                <div className="space-y-2.5">
                                  {dayItem.schedule.map((action: any, aIdx: number) => (
                                    <div
                                      key={aIdx}
                                      className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-850 space-y-1.5 hover:border-slate-800 transition"
                                    >
                                      <div className="flex justify-between items-center text-[10px]">
                                        <span className="font-semibold text-slate-400 flex items-center gap-1">
                                          <Clock className="h-3 w-3 text-primary" />
                                          {action.time} ({action.duration_min} min)
                                        </span>
                                        {action.cost_inr > 0 && (
                                          <span className="font-bold text-slate-350">
                                            ₹{action.cost_inr.toLocaleString()}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs font-medium text-slate-200">{action.activity}</p>
                                      {action.location && (
                                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block flex items-center gap-0.5">
                                          <Navigation className="h-2.5 w-2.5 text-primary shrink-0" />
                                          {action.location}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500 italic">Relax / leisure schedules</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {context.itinerary.notes && (
                    <div className="pl-8 relative">
                      <span className="absolute left-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-800 border-4 border-slate-900" />
                      <div className="bg-slate-950/50 border border-slate-850 p-4 rounded-xl space-y-2 text-xs">
                        <h4 className="font-bold text-slate-300 uppercase tracking-widest text-[10px]">
                          Supervisor Tips & Tricks
                        </h4>
                        <p className="text-slate-405 leading-relaxed italic">{context.itinerary.notes}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT CANVAS: Chat & Conversation (Narrow sidebar layout on the right) */}
      <div className="w-full md:w-[440px] bg-slate-950/20 flex flex-col border-l border-card-border overflow-hidden shrink-0">
        
        {/* Sub Header back button with Discard option */}
        <div className="p-3 bg-slate-950/25 border-b border-card-border flex items-center justify-between shrink-0">
          <Link
            to="/dashboard"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-205 transition"
          >
            <ArrowLeft className="h-4 w-4 text-slate-400" />
            Back to Trips
          </Link>
          {context && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 bg-slate-900/80 px-2 py-0.5 border border-slate-800 rounded">
                ✈️ {context.input?.destination || 'Options'}
              </span>
              <button
                onClick={handleDeleteTrip}
                className="flex items-center gap-1 text-[11px] font-semibold text-red-450 hover:text-red-400 transition px-2 py-1 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/20 rounded"
                title="Discard Trip Design"
              >
                <Trash2 className="h-3 w-3 shrink-0" />
                Discard
              </button>
            </div>
          )}
        </div>

        {/* Chat Window */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoadingTrip ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
          ) : (
            messages.map((msg, index) => (
              <div
                key={index}
                className={`flex items-start gap-2.5 ${
                  msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                    msg.role === 'user'
                      ? 'bg-primary/10 border-primary/25 text-primary'
                      : 'bg-indigo-950 border-indigo-800/80 text-indigo-400'
                  }`}
                >
                  {msg.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>

                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-md leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-white font-medium'
                      : 'bg-card-bg border border-card-border text-slate-205'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-invert prose-sm max-w-none text-xs">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))
          )}

          {/* Active swarm indicator */}
          {activeStep && (
            <div className="flex items-start gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-950 border border-indigo-800 text-indigo-400 animate-spin">
                <Loader2 className="h-3.5 w-3.5" />
              </div>
              <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs bg-indigo-950/40 border border-indigo-505/20 text-indigo-300">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
                  {activeStep}
                </span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* HITL Choice Panels */}
        {context && context.status === 'PLANNED' && !activeStep && (
          <div className="p-4 border-t border-card-border bg-slate-900/40 backdrop-blur-sm space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1 glow-text">
                <Sparkles className="h-3 w-3" />
                Plan Ready for Approval
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-accent-teal hover:bg-emerald-600 text-xs font-bold text-white transition active:scale-95 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Approve & Confirm
              </button>

              <button
                onClick={() => setShowReplanInput(!showReplanInput)}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-xs font-bold text-slate-205 transition active:scale-95"
              >
                <X className="h-3.5 w-3.5 text-red-400" />
                Modify Plan
              </button>
            </div>

            {showReplanInput && (
              <form onSubmit={handleReplanSubmit} className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={replanReason}
                  onChange={(e) => setReplanReason(e.target.value)}
                  placeholder="e.g. Find cheaper hotels, add a tour of Ooty lake on Day 2"
                  className="flex-1 rounded-lg border border-slate-705 bg-slate-800/80 px-2.5 py-2 text-xs text-white focus:border-primary focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition hover:bg-primary/95"
                >
                  Apply
                </button>
              </form>
            )}
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleSend} className="p-4 border-t border-card-border bg-slate-950/20 flex gap-2 shrink-0">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={chatMutation.isPending || approveMutation.isPending}
            placeholder={
              context?.status === 'CONFIRMED'
                ? 'Trip exists! Add comments...'
                : 'Send requirements to the swarm...'
            }
            className="flex-1 rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-3 text-xs text-slate-200 placeholder-slate-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={chatMutation.isPending || !message.trim()}
            className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary hover:bg-opacity-95 text-white shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Send className="h-4.5 w-4.5" />
          </button>
        </form>
      </div>

    </div>
  );
}
