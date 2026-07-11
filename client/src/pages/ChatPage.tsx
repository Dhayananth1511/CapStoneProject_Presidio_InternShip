import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import api from '../lib/axios';
import { useAuthStore } from '../store/authStore';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  type?: 'plan' | 'question' | 'confirm' | 'text';
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Welcome! I am your Swarm Travel Assistant 🗺️. Give me a destination, travel dates, and your budget, and I'll route my specialty agents to assemble a complete itinerary!",
      type: 'text'
    }
  ]);
  const [input, setInput] = useState('');
  const [currentTripId, setCurrentTripId] = useState<string | undefined>();
  const [waitingForApproval, setWaitingForApproval] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  // Auto-scroll on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Swarm agent step indicators during loading state
  const steps = [
    'Supervisor extracting slots...',
    'Coordinator allocating parallel MCP tools...',
    'Transport / Hotel / Weather tools pulling cache data...',
    'Budget Agent evaluating feasibility...',
    'Itinerary Agent drafting day-by-day itineraries...',
    'Coordinator synthesizing final Markdown presentation...'
  ];

  useEffect(() => {
    let interval: any;
    if (activeStep < steps.length - 1) {
      interval = setInterval(() => {
        setActiveStep((s) => s + 1);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [activeStep]);

  // Fetch previous trips to display in sidebar
  const { data: previousTrips, refetch: refetchTrips } = useQuery({
    queryKey: ['my-trips'],
    queryFn: () => api.get('/trips').then((r) => r.data.trips),
  });

  const planMutation = useMutation({
    mutationFn: (message: string) => {
      setActiveStep(0);
      return api.post('/trips/plan', { message, tripId: currentTripId }).then((r) => r.data);
    },
    onSuccess: (data) => {
      refetchTrips();
      if (data.status === 'NEEDS_INFO') {
        setCurrentTripId(data.tripId);
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: data.clarifyingQuestion, type: 'question' }
        ]);
      } else if (data.status === 'PLANNED') {
        setCurrentTripId(data.tripId);
        setWaitingForApproval(true);
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: data.plan, type: 'plan' },
          {
            role: 'assistant',
            content: '**Would you like to approve and book this plan?** Click Approve to book flights/hotels and log it directly to your Google Calendar, or explain what you want modified.',
            type: 'confirm'
          },
        ]);
      }
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/trips/${currentTripId}/approve`).then((r) => r.data),
    onSuccess: (data) => {
      refetchTrips();
      setWaitingForApproval(false);
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: `🎉 **Trip Confirmed!** Your hotel reference is: \`${data.bookingRefs?.hotel}\` and transport ref is \`${data.bookingRefs?.transport}\`. Check your Google Calendar for the scheduled event coordinates!`,
          type: 'text'
        },
      ]);
    },
  });

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages((m) => [...m, { role: 'user', content: input }]);

    if (waitingForApproval) {
      setWaitingForApproval(false);
      // Trigger rejection logic via replanning endpoint, then re-execute route
      api.post(`/trips/${currentTripId}/reject`, { reason: input });
    }

    planMutation.mutate(input);
    setInput('');
  };

  return (
    <div className="flex h-screen bg-[#0b0c10] text-[#c5c6c7] font-sans">
      {/* Sidebar - History */}
      <aside className="w-80 bg-[#1f2833]/20 border-r border-white/5 flex flex-col hidden md:flex">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✈️</span>
            <div>
              <h2 className="text-white font-extrabold text-sm tracking-wide">MY TRIPS</h2>
              <p className="text-xs text-slate-500">Persisted itineraries</p>
            </div>
          </div>
        </div>

        {/* List of past trips */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {previousTrips && previousTrips.length > 0 ? (
            previousTrips.map((trip: any) => (
              <div
                key={trip.sessionId}
                onClick={() => {
                  setCurrentTripId(trip.sessionId);
                  api.get(`/trips/${trip.sessionId}`).then((r) => {
                    const savedPlan = r.data.trip.formattedPlan;
                    if (savedPlan) {
                      setMessages([
                        { role: 'assistant', content: savedPlan, type: 'plan' }
                      ]);
                      setWaitingForApproval(trip.status === 'PLANNED');
                    }
                  });
                }}
                className={`p-3.5 rounded-xl border border-white/5 cursor-pointer transition duration-200 ${
                  currentTripId === trip.sessionId
                    ? 'bg-indigo-500/10 border-indigo-500/30'
                    : 'bg-[#151622]/40 hover:bg-[#151622]/80 hover:border-white/10'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400">
                    {trip.status}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(trip.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="text-white font-bold text-sm truncate">
                  {trip.input.destination || 'Unresolved Destination'}
                </h3>
                <p className="text-xs text-slate-400 mt-1 truncate">
                  Budget: ₹{trip.input.budget_inr?.toLocaleString() || 'N/A'}
                </p>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-xs text-slate-500 bg-[#151622]/20 rounded-xl border border-dashed border-white/5">
              No saved trips yet.
            </div>
          )}
        </div>

        {/* User Card */}
        <div className="p-4 bg-[#1f2833]/10 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-white font-extrabold">
              {user?.name?.[0]?.toUpperCase() || 'T'}
            </div>
            <div>
              <p className="text-white text-sm font-semibold truncate max-w-36">{user?.name}</p>
              <p className="text-slate-500 text-[10px] truncate max-w-36">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-2 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 rounded-lg transition"
            title="Sign Out"
          >
            🔌
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col h-full bg-[#0d0e15] relative">
        {/* Top Navbar */}
        <header className="px-6 py-4 border-b border-white/5 bg-[#151622]/60 backdrop-blur-xl flex items-center justify-between">
          <div>
            <h1 className="text-lg font-extrabold text-white tracking-wide">✈️ Swarm Trip Planner</h1>
            <p className="text-slate-500 text-xs mt-0.5">Multi-Agent Autonomic Orchestrations</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
            <span className="text-[#a5a6a7] text-xs font-semibold">Active Agent Swarm Connection</span>
          </div>
        </header>

        {/* Chat / Messages Panel */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-4xl px-5 py-4 rounded-2xl text-sm leading-relaxed shadow-lg ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-indigo-700 to-indigo-600 text-white rounded-br-sm'
                    : 'bg-[#151622]/70 border border-white/5 text-slate-200 rounded-bl-sm'
                }`}
              >
                {msg.type === 'plan' ? (
                  <div className="prose prose-invert max-w-none text-[#d1d5db] font-sans">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {/* Active Agent Swarm steps loading overlay */}
          {planMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-[#151622]/90 border border-indigo-500/20 px-5 py-4 rounded-2xl shadow-xl w-full max-w-md">
                <div className="flex items-center gap-3 mb-2.5">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                  <span className="text-white font-bold text-xs">Swarm Agents Dispatching</span>
                </div>
                <p className="text-indigo-400 text-xs font-semibold transition-all duration-300">
                  {steps[activeStep]}
                </p>
                <div className="w-full bg-[#0a0a0f] h-1.5 rounded-full mt-3 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${((activeStep + 1) / steps.length) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          {/* HITL Approve / Reject overlay */}
          {waitingForApproval && (
            <div className="flex gap-3 justify-center pt-4">
              <button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                className="px-6 py-3 bg-[#10b981] hover:bg-[#059669] disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all duration-200"
              >
                {approveMutation.isPending ? 'Confirming with Booking API...' : '✅ Approve & Book'}
              </button>
              <button
                onClick={() => setInput('I want to modify the plan: ')}
                className="px-6 py-3 bg-[#1f2833]/80 hover:bg-[#1f2833] text-white font-bold rounded-xl border border-white/5 transition"
              >
                ✏️ Request Modifications
              </button>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input box bottom */}
        <footer className="p-4 border-t border-white/5 bg-[#151622]/40 backdrop-blur-xl">
          <div className="max-w-4xl mx-auto flex gap-3.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={planMutation.isPending}
              placeholder="Describe your trip details (e.g., Ooty for 4 days next week, budget ₹30,000)..."
              className="flex-1 px-4 py-3.5 rounded-xl bg-[#0f101a] border border-white/5 text-white placeholder-slate-500 focus:border-indigo-500/40 focus:outline-none transition"
            />
            <button
              onClick={handleSend}
              disabled={planMutation.isPending || !input.trim()}
              className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold rounded-xl transition shadow-lg shadow-indigo-600/10"
            >
              Send Request
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
