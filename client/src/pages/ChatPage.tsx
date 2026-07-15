import { useState, useRef, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';
import {
  Send,
  Bot,
  User,
  Loader2,
  Check,
  X,
  Sparkles,
  ArrowLeft,
  Trash2,
  Calendar,
  Compass,
} from 'lucide-react';

import api from '../lib/axios';
import { useThemeStore } from '../store/themeStore';



import { ItineraryTimeline } from '../components/chat/ItineraryTimeline';
import { InspectorTab } from '../components/chat/InspectorTab';
import { downloadItineraryPDF } from '../utils/pdfHelper';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_MESSAGE_LENGTH = 500;



// Pre-defined interests for tag-picker UI (covers the main travel interest categories)
const INTEREST_TAGS = [
  { label: '🏔️ Adventure', value: 'adventure' },
  { label: '🍜 Food & Cuisine', value: 'food' },
  { label: '🏛️ Culture & History', value: 'culture' },
  { label: '🏖️ Beach & Relaxation', value: 'beach' },
  { label: '🛕 Temples & Spiritual', value: 'temples' },
  { label: '🌿 Nature & Wildlife', value: 'nature' },
  { label: '🛍️ Shopping', value: 'shopping' },
  { label: '🎭 Nightlife & Music', value: 'nightlife' },
  { label: '📸 Photography', value: 'photography' },
  { label: '⛷️ Winter Sports', value: 'winter sports' },
];

export default function ChatPage() {
  const navigate = useNavigate();
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const [searchParams, setSearchParams] = useSearchParams();
  const tripIdParam = searchParams.get('tripId');

  const [message, setMessage] = useState('');

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hi! I'm TripPlanner, your Lead Travel Supervisor Agent. 🗺️\n\nWhere would you like to travel next? Let me know the destination, dates, budget, or number of travelers to begin!",
    },
  ]);
  const [tripId, setTripId] = useState<string | undefined>(tripIdParam || undefined);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [context, setContext] = useState<any>(null);
  const [lodgingCategoryTab, setLodgingCategoryTab] = useState<'budget' | 'mid_range' | 'luxury'>('mid_range');
  const [activeTab, setActiveTab] = useState<'inspector' | 'itinerary'>('inspector');
  const [showBudgetBreakdown, setShowBudgetBreakdown] = useState(false);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [showInterestPicker, setShowInterestPicker] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showConfirmBookingModal, setShowConfirmBookingModal] = useState(false);
  
  const getChosenHotelName = () => {
    if (context?.accommodation?.selected_category === 'skipped' || context?.accommodation?.selected_hotel?.name === 'Self Arranged') {
      return 'Self Arranged / Skipped';
    }
    return context?.accommodation?.selected_hotel?.name || context?.accommodation?.recommended || 'Self Arranged';
  };

  const getChosenTransportName = () => {
    if (context?.transport?.selected_option?.operator === 'Self Arranged') {
      return 'Self Arranged (skipped)';
    }
    if (context?.transport?.selected_option) {
      return `${context.transport.selected_option.operator} (${context.transport.selected_option.mode})`;
    }
    if (context?.transport?.options?.[0]) {
      return `${context.transport.options[0].operator} (${context.transport.options[0].mode})`;
    }
    return 'Self Arranged';
  };

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

  // Reset to clean planning session if there is no tripId in search parameters
  useEffect(() => {
    if (!tripIdParam) {
      setTripId(undefined);
      setContext(null);
      setMessages([
        {
          role: 'assistant',
          content:
            "Hi! I'm TripPlanner, your Lead Travel Supervisor Agent. 🗺️\n\nWhere would you like to travel next? Let me know the destination, dates, budget, or number of travelers to begin!",
        },
      ]);
      setActiveTab('inspector');
      setActiveStep(null);
      setShowReplanInput(false);
      setShowBudgetBreakdown(false);
      setSelectedInterests([]);
      setShowInterestPicker(false);
    }
  }, [tripIdParam]);

  // Handle Google OAuth callback query params (success/denied/error)
  useEffect(() => {
    const googleAuth = searchParams.get('google_auth');
    if (googleAuth === 'success') {
      toast.success('✅ Google Calendar connected! Your trips will now sync automatically.');
      setSearchParams((prev) => { prev.delete('google_auth'); return prev; });
    } else if (googleAuth === 'denied') {
      toast('Google Calendar connection was cancelled.', { icon: '🔕' });
      setSearchParams((prev) => { prev.delete('google_auth'); return prev; });
    } else if (googleAuth === 'error') {
      toast.error('Google Calendar connection failed. Please try again.');
      setSearchParams((prev) => { prev.delete('google_auth'); return prev; });
    }
  }, [searchParams, setSearchParams]);

  // Scroll to bottom whenever messages update
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeStep]);

  useEffect(() => {
    if (context?.accommodation?.selected_category && context.accommodation.selected_category !== 'skipped') {
      setLodgingCategoryTab(context.accommodation.selected_category);
    }
  }, [context]);

  // Mutation for sending chat messages to the Planner Agent Swarm
  const chatMutation = useMutation({
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
        const res = await api.post('/trips/plan', payload);
        return res.data;
      } catch (firstErr: any) {
        const isTimeout = firstErr.code === 'ECONNABORTED' || firstErr.message?.includes('timeout') || firstErr.response?.status === 504;
        // Auto-retry on timeout: MongoDB already saved the result during the first attempt,
        // so the retry call returns instantly with the computed data.
        if (isTimeout) {
          setActiveStep('Agent swarm warming up — auto-retrying now...');
          await new Promise(resolve => setTimeout(resolve, 2500));
          try {
            const retryRes = await api.post('/trips/plan', payload);
            return retryRes.data;
          } catch (retryErr) {
            throw retryErr;
          }
        }
        throw firstErr;
      } finally {
        clearInterval(interval);
      }
    },
    onSuccess: (data) => {
      setActiveStep(null);
      if (data.tripId) {
        setTripId(data.tripId);
        // Sync tripId into the URL so a page refresh reloads this trip
        setSearchParams((prev) => { prev.set('tripId', data.tripId); return prev; }, { replace: true });
      }
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
        toast.success('Trip plan ready for your review! ✈️');
      }
    },
    onError: (err: any) => {
      setActiveStep(null);
      const isOffline = !navigator.onLine || err.code === 'ERR_NETWORK';
      const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
      const errMessage = isOffline
        ? 'Connection lost. Please check your internet and try again.'
        : isTimeout
        ? 'The AI agent swarm is warming up on the server. Please click Send again — it will work on the next attempt.'
        : err.response?.data?.message || 'Connection to the agent swarm timed out. Please try again.';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `${isOffline ? '📡' : '⚠️'} **${isOffline ? 'Offline' : 'Agent Error'}:** ${errMessage}`,
        },
      ]);
      if (isOffline) toast.error('You appear to be offline.');
      if (isTimeout) toast('The server is warming up — please send your message again.', { icon: '🔄', duration: 5000 });
    },
  });

  // Mutation for choosing a hotel option
  const selectHotelMutation = useMutation({
    mutationFn: async (payload: { hotelName: string; category: string }) => {
      const res = await api.post(`/trips/${tripId}/select-hotel`, payload);
      return res.data;
    },
    onSuccess: (data) => {
      if (data.trip) {
        setContext(data.trip);
        if (data.trip.conversationHistory) {
          setMessages(data.trip.conversationHistory);
        }
      }
      toast.success('🏨 Lodging preference updated!');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update lodging selection.');
    }
  });

  const handleSelectHotel = (hotelName: string, category: string) => {
    selectHotelMutation.mutate({ hotelName, category });
  };

  // Mutation for choosing a transport option
  const selectTransportMutation = useMutation({
    mutationFn: async (payload: { operator: string; mode: string }) => {
      const res = await api.post(`/trips/${tripId}/select-transport`, payload);
      return res.data;
    },
    onSuccess: (data) => {
      if (data.trip) {
        setContext(data.trip);
        if (data.trip.conversationHistory) {
          setMessages(data.trip.conversationHistory);
        }
      }
      toast.success('🎫 Transport preference updated!');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update transport selection.');
    }
  });

  const handleSelectTransport = (operator: string, mode: string) => {
    selectTransportMutation.mutate({ operator, mode });
  };

  // Mutation for approving / confirming the trip (HITL Gate)
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!tripId) return;
      const res = await api.post(`/trips/${tripId}/approve`);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success('Trip confirmed! Booking references generated. 🎉');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `🎉 Awesome! The trip has been successfully approved & confirmed.\n\n🔑 **Booking References:**\n* 🏨 **Hotel:** \`${data.bookingRefs?.hotel}\`\n* ✈️ **Transport:** \`${data.bookingRefs?.transport}\`\n* 📅 **Calendar integration:** Created Google Calendar event (\`${data.bookingRefs?.calendar}\`)`,
        },
      ]);
      if (context) setContext({ ...context, status: 'CONFIRMED', booking: { refs: data.bookingRefs, confirmed_at: new Date().toISOString() } });
    },
    onError: (err: any) => {
      toast.error(`Approval failed: ${err.response?.data?.message || err.message}`);
    },
  });

  // Mutation for rejecting / replanning the trip (HITL rejection)
  const rejectMutation = useMutation({
    mutationFn: async (reason: string) => {
      setActiveStep('Replanning Agent: Clearing Selective Stale Contexts...');
      
      const interval = setInterval(() => {
        setActiveStep('Recycling Swarm Pipelines & Re-calculating...');
      }, 1000);

      try {
        const res = await api.post(`/trips/${tripId}/reject`, { reason });
        return res.data;
      } finally {
        clearInterval(interval);
      }
    },
    onSuccess: (data) => {
      setActiveStep(null);
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
        toast.error('Re-planning requires additional information or budget adjustment.');
      } else if (data.status === 'PLANNED' && data.plan) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `🔄 I modified your plan based on your feedback:\n\n${data.plan}`,
          },
        ]);
        toast.success('Plan updated based on your changes! 🔄');
      }
    },
    onError: (err: any) => {
      setActiveStep(null);
      toast.error(`Replanning failed: ${err.response?.data?.message || err.message}`);
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendWithInterests(e);
  };



  const handleDeleteTrip = async () => {
    if (!context?.sessionId) return;
    setShowDiscardConfirm(true);
  };

  // Toggle an interest tag on/off and inject it into the chat message
  const handleInterestToggle = (interestValue: string) => {
    setSelectedInterests((prev) => {
      const next = prev.includes(interestValue)
        ? prev.filter((i) => i !== interestValue)
        : [...prev, interestValue];
      return next;
    });
  };

  const handleSendWithInterests = (e: React.FormEvent) => {
    e.preventDefault();
    let finalMessage = message.trim();
    if (selectedInterests.length > 0 && !context?.input?.interests?.length) {
      finalMessage = finalMessage
        ? `${finalMessage}. My interests: ${selectedInterests.join(', ')}`
        : `My travel interests are: ${selectedInterests.join(', ')}`;
    }
    if (!finalMessage || chatMutation.isPending || approveMutation.isPending || rejectMutation.isPending) return;
    setMessages((prev) => [...prev, { role: 'user', content: finalMessage }]);
    setMessage('');
    if (selectedInterests.length > 0 && !context?.input?.interests?.length) {
      setSelectedInterests([]);
      setShowInterestPicker(false);
    }
    chatMutation.mutate({ message: finalMessage, tripId });
  };

  // Trigger Google Calendar OAuth flow
  const handleConnectCalendar = async () => {
    try {
      const res = await api.get('/auth/google');
      if (res.data.authUrl) {
        window.location.href = res.data.authUrl;
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Google Calendar is not configured on the server.');
    }
  };



  // Download confirmed plan details as PDF file
  const handleDownloadItinerary = () => {
    downloadItineraryPDF(context);
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

  if (tripIdParam && !context) {
    return (
      <div className={`flex h-[calc(100vh-4rem)] flex-col items-center justify-center relative overflow-hidden transition-colors duration-300 ${isDark ? 'bg-[#090d16] text-slate-400' : 'bg-slate-50 text-slate-500'}`}>
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <Compass className="h-10 w-10 text-primary animate-spin" />
        <p className="text-sm font-medium mt-4">Restoring your trip planning session...</p>
      </div>
    );
  }

  if (!context) {
    return (
      <div className={`flex h-[calc(100vh-4rem)] flex-col relative overflow-hidden transition-colors duration-300 ${isDark ? 'bg-[#090d16]' : 'bg-slate-50'}`}>
        {/* Glowing background highlights */}
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header bar */}
        <div className={`z-10 px-6 py-4 border-b flex items-center justify-between shrink-0 ${isDark ? 'bg-slate-950/40 border-card-border/80' : 'bg-white/80 border-slate-200'}`}>
          <Link
            to="/dashboard"
            className={`flex items-center gap-1.5 text-xs transition ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <ArrowLeft className={`h-4 w-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
            Back to Trips
          </Link>
          <span className={`text-xs font-bold px-3 py-1 border rounded-lg ${isDark ? 'text-slate-400 bg-slate-900/60 border-slate-800' : 'text-slate-600 bg-slate-100 border-slate-200'}`}>
            🧭 TripPlanner AI Swarm
          </span>
        </div>

        {/* Scrollable central interface */}
        <div className="flex-1 overflow-y-auto px-4 py-8 md:py-12 z-10 flex flex-col justify-between">
          <div className="max-w-2xl w-full mx-auto space-y-8 my-auto">
            {/* Logo and Intro title */}
            <div className="text-center space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 shadow-lg shadow-primary/5">
                <Compass className="h-7 w-7 text-primary" />
              </div>
              <h2 className={`text-2xl md:text-3xl font-extrabold tracking-tight glow-text ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Design Your Next Journey
              </h2>
              <p className={`text-xs md:text-sm max-w-md mx-auto leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Provide your destination, budget constraints, dates, or travelers. Our AI agent swarm will check flights, lodging, local climate, and draft an itinerary.
              </p>
            </div>

            {/* Chat Bubble Logs */}
            <div className="space-y-4 pt-4">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-3.5 ${
                    msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  } animate-fadeIn`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                      msg.role === 'user'
                        ? 'bg-primary/10 border-primary/25 text-primary'
                        : 'bg-indigo-950 border-indigo-800/80 text-indigo-405'
                    }`}
                  >
                    {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>

                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-xs md:text-sm shadow-md leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-white font-medium shadow-primary/10'
                        : isDark
                        ? 'bg-card-bg border border-card-border/80 text-slate-200'
                        : 'bg-white border border-slate-200 text-slate-700'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className={`prose prose-sm max-w-none text-xs md:text-sm ${isDark ? 'prose-invert' : 'prose-slate'}`}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}

              {/* Swarm loading indicator */}
              {activeStep && (
                <div className="flex items-start gap-3.5 animate-fadeIn">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-950 border border-indigo-800 text-indigo-400 animate-spin">
                    <Loader2 className="h-4 w-4" />
                  </div>
                  <div className="max-w-[80%] rounded-2xl px-4 py-3 text-xs bg-indigo-950/40 border border-indigo-505/20 text-indigo-300">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
                      {activeStep}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* suggestion cards (only shows when user has not messages yet) */}
            {messages.length === 1 && !activeStep && (
              <div className="pt-4 space-y-3">
                <p className={`text-[10px] font-bold uppercase tracking-widest text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  Quick Proposal Starters
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto">
                  {[
                    { label: "🏖️ Weekend in Goa with friends", prompt: "Plan a 3-day weekend trip to Goa for 4 friends, budget ₹15,000, starting next month." },
                    { label: "🏔️ Ooty solitude getaway (Solo)", prompt: "Create a 3-day solo nature trip to Ooty, budget ₹10,000, starting next month." },
                    { label: "🛕 Temple tour of historic Hampi", prompt: "Design a 4-day historic trip to Hampi for 2 travelers, budget ₹18,000." },
                    { label: "🌲 Shimla nature sightseeing tour", prompt: "Plan a 5-day nature sightseeing trip to Shimla under ₹25,000." }
                  ].map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setMessage(s.prompt);
                      }}
                      className={`p-3 border rounded-xl text-left text-xs transition active:scale-[98%] shadow-sm cursor-pointer ${
                        isDark
                          ? 'bg-slate-900/40 hover:bg-slate-800/60 border-slate-800 hover:border-indigo-500/30 text-slate-300 hover:text-white hover:shadow-indigo-500/5'
                          : 'bg-white hover:bg-indigo-50/60 border-slate-200 hover:border-indigo-300/50 text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div ref={chatEndRef} />
        </div>

        {/* Input box */}
        <div className={`border-t p-4 shrink-0 z-10 ${isDark ? 'bg-slate-950/40 border-card-border/60' : 'bg-white/90 border-slate-200'}`}>
          <div className="max-w-2xl mx-auto space-y-3">
            {!context?.input?.interests?.length && (
              <div className="px-1">
                <button
                  type="button"
                  onClick={() => setShowInterestPicker(!showInterestPicker)}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition select-none cursor-pointer"
                >
                  <Sparkles className="h-3 w-3" />
                  {showInterestPicker ? 'Hide interest tags' : 'Add your travel interests (optional)'}
                </button>
                {showInterestPicker && (
                  <div className="flex flex-wrap gap-1.5 mt-2 pb-1">
                    {INTEREST_TAGS.map((tag) => (
                      <button
                        key={tag.value}
                        type="button"
                        onClick={() => handleInterestToggle(tag.value)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition select-none cursor-pointer ${
                          selectedInterests.includes(tag.value)
                            ? 'bg-primary/20 border-primary/50 text-primary'
                            : isDark
                            ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                            : 'bg-slate-100 border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-slate-700'
                        }`}
                      >
                        {tag.label}
                      </button>
                    ))}
                  </div>
                )}
                {selectedInterests.length > 0 && (
                  <p className="text-[10px] text-indigo-400 mt-1">
                    Selected: {selectedInterests.join(', ')} — will be appended to your query
                  </p>
                )}
              </div>
            )}

            <form onSubmit={handleSend} className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                  disabled={chatMutation.isPending}
                  placeholder="Enter details to start planning e.g. Shimla trip, budget 20000, 3 travelers"
                  className={`w-full rounded-xl border px-4 py-3 text-xs md:text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/25 transition disabled:opacity-50 pr-12 ${
                    isDark
                      ? 'border-slate-800 bg-slate-900/60 text-slate-200 placeholder-slate-500'
                      : 'border-slate-300 bg-white text-slate-800 placeholder-slate-400'
                  }`}
                />
                {message.length > 300 && (
                  <span className={`absolute right-3.5 bottom-3.5 text-[10px] font-mono ${
                    message.length >= MAX_MESSAGE_LENGTH ? 'text-red-400' : 'text-slate-500'
                  }`}>
                    {message.length}/{MAX_MESSAGE_LENGTH}
                  </span>
                )}
              </div>
              <button
                type="submit"
                disabled={chatMutation.isPending || !message.trim()}
                className="flex items-center justify-center h-[42px] w-12 rounded-xl bg-primary hover:bg-opacity-95 text-white shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <Send className="h-4.5 w-4.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-[calc(100vh-4rem)] flex-col md:flex-row relative transition-colors duration-300 ${isDark ? 'bg-[#090d16]' : 'bg-slate-50'}`}>
      
      {/* LEFT CANVAS: Shared Trip Context Inspector & Visual Itinerary Timeline (Large Panel) */}
      <div className={`flex flex-1 flex-col overflow-hidden ${isDark ? 'bg-slate-950/10' : 'bg-slate-50/80'}`}>
        {/* Toggle Inspector vs. Interactive Timeline Tabs with Chat Toggle on right */}
        <div className={`flex border-b shrink-0 px-4 items-center justify-between ${isDark ? 'border-card-border bg-slate-950/40' : 'border-slate-200 bg-white/90'}`}>
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('inspector')}
              className={`py-3.5 px-2 text-xs font-bold uppercase tracking-wider transition ${
                activeTab === 'inspector'
                  ? `border-b-2 border-primary ${isDark ? 'text-white bg-slate-900/50' : 'text-indigo-700 bg-indigo-50/60'}`
                  : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Plan Details
            </button>
            <button
              onClick={() => setActiveTab('itinerary')}
              className={`py-3.5 px-2 text-xs font-bold uppercase tracking-wider transition relative ${
                activeTab === 'itinerary'
                  ? `border-b-2 border-primary ${isDark ? 'text-white bg-slate-900/50' : 'text-indigo-700 bg-indigo-50/60'}`
                  : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
              } ${
                context?.itinerary?.days
                  ? 'after:absolute after:top-2 after:right-0 after:h-2 after:w-2 after:rounded-full after:bg-primary'
                  : ''
              }`}
            >
              Interactive Timeline
            </button>
          </div>
          
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-bold px-3 py-1.5 border rounded-lg transition active:scale-95 cursor-pointer select-none ${
              isDark ? 'bg-slate-900/55 hover:bg-slate-800/80 border-slate-800' : 'bg-slate-100 hover:bg-indigo-50 border-slate-200'
            }`}
          >
            {isChatOpen ? (
              <>
                <X className="h-3.5 w-3.5 text-indigo-400" />
                Close Chat
              </>
            ) : (
              <>
                <Bot className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
                Open Chat Agent
              </>
            )}
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {activeTab === 'inspector' ? (
            <InspectorTab
              context={context}
              isDark={isDark}
              showBudgetBreakdown={showBudgetBreakdown}
              setShowBudgetBreakdown={setShowBudgetBreakdown}
              handleDownloadItinerary={handleDownloadItinerary}
              lodgingCategoryTab={lodgingCategoryTab}
              setLodgingCategoryTab={setLodgingCategoryTab}
              hotelSaving={selectHotelMutation.isPending}
              handleSelectHotel={handleSelectHotel}
              transportSaving={selectTransportMutation.isPending}
              handleSelectTransport={handleSelectTransport}
              handleAlternativeSelect={(suggestion: string) => {
                setMessages((prev) => [...prev, { role: 'user', content: `Adjust my plan: ${suggestion}` }]);
                chatMutation.mutate({ message: `Adjust plan: ${suggestion}`, tripId });
              }}
            />
          ) : (
            /* TAB 2: INTERACTIVE TIME LINE ITINERARY */
            <div className="space-y-6">
              <ItineraryTimeline
                itinerary={context.itinerary}
                accommodation={context.accommodation}
                activities={context.activities}
                destination={context.input?.destination || ''}
                isDark={isDark}
              />
              {context.itinerary?.days && context.itinerary?.notes && (
                <div className="pl-8 relative">
                  <span className={`absolute left-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-4 ${
                    isDark ? 'bg-slate-800 border-slate-900' : 'bg-slate-300 border-white shadow-sm'
                  }`} />
                  <div className={`border p-4 rounded-xl space-y-2 text-xs transition-colors ${
                    isDark ? 'bg-slate-950/55 border-slate-850' : 'bg-slate-50 border-slate-205'
                  }`}>
                    <h4 className={`font-bold uppercase tracking-widest text-[10px] ${
                      isDark ? 'text-slate-300' : 'text-slate-705'
                    }`}>
                      Travel Tips & Recommendations
                    </h4>
                    <p className={`leading-relaxed italic ${isDark ? 'text-slate-405' : 'text-slate-600'}`}>{context.itinerary.notes}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT CANVAS: Chat & Conversation (Narrow sidebar layout on the right) */}
      {isChatOpen && (
        <div className={`w-full md:w-[440px] flex flex-col border-l overflow-hidden shrink-0 animate-fadeIn ${isDark ? 'bg-slate-950/20 border-card-border' : 'bg-white/80 border-slate-200'}`}>
          
          {/* Sub Header back button with Discard option + Google Calendar connect */}
          <div className={`p-3 border-b flex items-center justify-between shrink-0 ${isDark ? 'bg-slate-950/25 border-card-border' : 'bg-white/90 border-slate-200'}`}>
            <Link
              to="/dashboard"
              className={`flex items-center gap-1.5 text-xs transition ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <ArrowLeft className={`h-4 w-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
              Back to Trips
            </Link>
            {context && (
              <div className="flex items-center gap-2">
                {/* Sync to Google Calendar — visible on PLANNED and CONFIRMED */}
                {(context.status === 'PLANNED' || context.status === 'CONFIRMED') && (
                  <button
                    onClick={handleConnectCalendar}
                    title="Sync to Google Calendar"
                    className={`flex items-center gap-1 text-[11px] font-semibold transition px-2 py-1 border rounded cursor-pointer ${
                      context.status === 'CONFIRMED'
                        ? isDark
                          ? 'text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/20 hover:border-emerald-500/40'
                          : 'text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200 hover:border-emerald-300'
                        : isDark
                        ? 'text-slate-400 hover:text-indigo-300 bg-slate-900/50 hover:bg-indigo-950/50 border-slate-800 hover:border-indigo-700/40'
                        : 'text-slate-500 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <Calendar className="h-3 w-3 shrink-0" />
                    {context.status === 'CONFIRMED' ? '📅 Re-sync Calendar' : 'Sync Calendar'}
                  </button>
                )}
                <span className={`text-xs font-semibold px-2 py-0.5 border rounded ${
                  isDark ? 'text-slate-400 bg-slate-900/80 border-slate-800' : 'text-slate-600 bg-slate-100 border-slate-200'
                }`}>
                  ✈️ {context.input?.destination || 'Options'}
                </span>
                <button
                  onClick={handleDeleteTrip}
                  className="flex items-center gap-1 text-[11px] font-semibold text-red-450 hover:text-red-400 transition px-2 py-1 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/20 rounded cursor-pointer"
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
                        : isDark
                        ? 'bg-card-bg border border-card-border text-slate-200'
                        : 'bg-slate-100 border border-slate-200 text-slate-700'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className={`prose prose-sm max-w-none text-xs ${isDark ? 'prose-invert' : 'prose-slate'}`}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))
            )}

            {/* Active swarm step */}
            {activeStep && (
              <div className="flex items-start gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-955 border border-indigo-800 text-indigo-400 animate-spin">
                  <Loader2 className="h-3.5 w-3.5" />
                </div>
                <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs bg-indigo-950/40 border border-indigo-505/20 text-indigo-300 animate-pulse">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
                    {activeStep}
                  </span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* HITL approval panels */}
          {context && context.status === 'PLANNED' && !activeStep && (
            <div className={`p-4 border-t backdrop-blur-sm space-y-3 shrink-0 ${isDark ? 'border-card-border bg-slate-900/40' : 'border-slate-205 bg-white/90'}`}>
              <div className={`p-3 rounded-xl border border-dashed text-xs space-y-1.5 transition-colors ${
                isDark ? 'bg-indigo-955/20 border-indigo-500/30' : 'bg-indigo-50/50 border-indigo-200'
              }`}>
                <p className={`font-bold flex items-center gap-1.5 ${isDark ? 'text-indigo-400' : 'text-indigo-700'}`}>
                  📋 check all and approve
                </p>
                <p className={`text-[10px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Before confirming, please review all details above (hotel choice, intercity transit, daily sightseeing schedule, local transport commutes, and the total budget assessment).
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setShowConfirmBookingModal(true)}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg bg-accent-teal hover:bg-emerald-600 text-xs font-bold text-white transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {approveMutation.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Approving...
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Approve & Confirm
                    </>
                  )}
                </button>

                <button
                  onClick={() => setShowReplanInput(!showReplanInput)}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg border text-xs font-bold transition active:scale-95 cursor-pointer ${
                    isDark ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200' : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700'
                  }`}
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
                    placeholder="e.g. Find cheaper hotels, add tour to database"
                    className={`flex-1 rounded-lg border px-2.5 py-2 text-xs focus:border-primary focus:outline-none ${
                      isDark ? 'border-slate-700 bg-slate-800/80 text-white' : 'border-slate-300 bg-white text-slate-800'
                    }`}
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition hover:bg-primary/95 cursor-pointer"
                  >
                    Apply
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Form input controls */}
          <div className={`border-t shrink-0 ${isDark ? 'border-card-border bg-slate-950/20' : 'border-slate-200 bg-white/90'}`}>
            
            {/* Interests panel */}
            {!context?.input?.interests?.length && context?.status !== 'CONFIRMED' && (
              <div className="px-4 pt-3">
                <button
                  type="button"
                  onClick={() => setShowInterestPicker(!showInterestPicker)}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition cursor-pointer select-none"
                >
                  <Sparkles className="h-3 w-3" />
                  {showInterestPicker ? 'Hide interest tags' : 'Add your travel interests (optional)'}
                </button>
                {showInterestPicker && (
                  <div className="flex flex-wrap gap-1.5 mt-2 pb-2">
                    {INTEREST_TAGS.map((tag) => (
                      <button
                        key={tag.value}
                        type="button"
                        onClick={() => handleInterestToggle(tag.value)}
                        className={`px-2 py-1 rounded-full text-[11px] font-semibold border transition select-none cursor-pointer ${
                          selectedInterests.includes(tag.value)
                            ? 'bg-primary/20 border-primary/50 text-primary'
                            : isDark
                            ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                            : 'bg-slate-100 border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-slate-700'
                        }`}
                      >
                        {tag.label}
                      </button>
                    ))}
                  </div>
                )}
                {selectedInterests.length > 0 && (
                  <p className="text-[10px] text-indigo-400 pb-1">
                    Selected: {selectedInterests.join(', ')} — will be appended
                  </p>
                )}
              </div>
            )}

            <form onSubmit={handleSend} className="p-4 flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                  disabled={chatMutation.isPending || approveMutation.isPending || context?.status === 'CONFIRMED'}
                  placeholder={
                    context?.status === 'CONFIRMED'
                      ? 'This trip is confirmed and locked from modifications.'
                      : 'Send details to your planner...'
                  }
                  className={`w-full rounded-xl border px-3.5 py-3 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition disabled:opacity-50 pr-12 ${
                    isDark
                      ? 'border-slate-800 bg-slate-900/60 text-slate-200 placeholder-slate-500'
                      : 'border-slate-300 bg-white text-slate-800 placeholder-slate-400'
                  }`}
                />
                {message.length > 300 && (
                  <span className={`absolute right-2.5 bottom-2.5 text-[10px] font-mono ${
                    message.length >= MAX_MESSAGE_LENGTH ? 'text-red-400' : 'text-slate-500'
                  }`}>
                    {message.length}/{MAX_MESSAGE_LENGTH}
                  </span>
                )}
              </div>
              <button
                type="submit"
                disabled={chatMutation.isPending || !message.trim() || context?.status === 'CONFIRMED'}
                className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary hover:bg-opacity-95 text-white shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <Send className="h-4.5 w-4.5" />
              </button>
            </form>
          </div>
        </div>
      )}

      {showDiscardConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className={`premium-card rounded-2xl max-w-sm w-full p-6 mx-4 border shadow-2xl space-y-4 ${
            isDark ? 'border-card-border/80 bg-card-bg/95' : 'border-slate-200 bg-white'
          }`}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-red-500/10 rounded-xl flex items-center justify-center border border-red-500/20">
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Discard Trip</h3>
                <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>This action cannot be undone.</p>
              </div>
            </div>
            <p className={`text-xs leading-normal ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Are you sure you want to discard and cancel your trip plan to (or design for) <span className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{context?.input?.destination || 'this destination'}</span>?
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowDiscardConfirm(false)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition active:scale-95 cursor-pointer ${
                  isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowDiscardConfirm(false);
                  try {
                    await api.delete(`/trips/${context.sessionId}`);
                    toast.success('Trip discarded successfully.');
                    navigate('/dashboard');
                  } catch (err: any) {
                    toast.error('Failed to cancel trip: ' + (err.response?.data?.message || err.message));
                  }
                }}
                className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-bold text-white transition active:scale-95 cursor-pointer"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmBookingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className={`premium-card rounded-2xl max-w-md w-full p-6 mx-4 border shadow-2xl space-y-4 ${
            isDark ? 'border-card-border/80 bg-card-bg/95' : 'border-slate-200 bg-white'
          }`}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20">
                <Check className="h-5 w-5 text-indigo-400 font-bold" />
              </div>
              <div>
                <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Confirm Booking Details</h3>
                <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Please check the lodging and transit choices before verifying booking.</p>
              </div>
            </div>

            <div className={`p-3.5 rounded-xl space-y-2.5 ${isDark ? 'bg-slate-900/60' : 'bg-slate-50'}`}>
              <div className="flex justify-between items-start text-xs">
                <span className={`font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>🏨 Accommodation Choice:</span>
                <span className={`font-bold text-right max-w-[60%] ${isDark ? 'text-white' : 'text-slate-800'}`}>
                  {getChosenHotelName()}
                </span>
              </div>
              <div className="border-t border-dashed border-slate-550/10 dark:border-slate-100/10 my-2" />
              <div className="flex justify-between items-start text-xs">
                <span className={`font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>✈️ Transport Selected:</span>
                <span className={`font-bold text-right max-w-[60%] ${isDark ? 'text-white' : 'text-slate-800'}`}>
                  {getChosenTransportName()}
                </span>
              </div>
            </div>

            <p className={`text-xs text-center font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
              Can you continue with booking?
            </p>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowConfirmBookingModal(false)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition active:scale-95 cursor-pointer text-center ${
                  isDark ? 'bg-slate-805 hover:bg-slate-705 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                No, Go Back
              </button>
              <button
                onClick={() => {
                  setShowConfirmBookingModal(false);
                  approveMutation.mutate();
                }}
                disabled={approveMutation.isPending}
                className="flex-1 py-1.5 rounded-lg bg-accent-teal hover:bg-emerald-600 text-xs font-bold text-white transition active:scale-95 cursor-pointer text-center flex items-center justify-center gap-1"
              >
                Yes, Book Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}













