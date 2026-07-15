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
  Calendar,
  Compass,
  Download,
  ArrowUpRight,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import api from '../lib/axios';
import { useThemeStore } from '../store/themeStore';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_MESSAGE_LENGTH = 500;

function formatTimeAndPeriod(timeStr: string): string {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hour = parseInt(parts[0], 10);
  const min = parseInt(parts[1], 10);
  if (isNaN(hour) || isNaN(min)) return timeStr;
  
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const displayMin = min < 10 ? `0${min}` : min;
  const formattedTime = `${displayHour}:${displayMin} ${ampm}`;
  
  let category = '';
  if (hour < 5) category = 'Late Night';
  else if (hour < 11) category = 'Morning';
  else if (hour < 13) category = 'Late Morning';
  else if (hour < 17) category = 'Afternoon';
  else if (hour < 20) category = 'Evening';
  else category = 'Night';
  
  return `${category} (${formattedTime})`;
}

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
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({});
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

  const handleAlternativeSelect = (suggestion: string) => {
    setMessages((prev) => [...prev, { role: 'user', content: `Adjust my plan: ${suggestion}` }]);
    chatMutation.mutate({ message: `Adjust plan: ${suggestion}`, tripId });
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

  // Helper to remove block emojis and garbled symbols for standard jsPDF Helvetica
  const cleanForPDF = (text: string): string => {
    if (!text) return '';
    return text
      .replace(/₹/g, 'INR ')
      .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '');
  };

  // Download confirmed plan details as PDF file
  const handleDownloadItinerary = () => {
    if (!context) return;
    
    try {
      const doc = new jsPDF();
      let y = 20;

      // Header helper for subsequent pages
      const checkPageBreak = (neededHeight: number) => {
        if (y + neededHeight > 275) {
          doc.addPage();
          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(140, 140, 140);
          doc.text(`TRIPPLANNER AI ITINERARY - DESTINATION: ${(context.input.destination || 'TRIP').toUpperCase()}`, 15, 10);
          doc.setDrawColor(226, 232, 240);
          doc.line(15, 12, 195, 12);
          y = 22;
        }
      };

      // 1. Branding Header Banner
      doc.setFillColor(30, 41, 59); // Dark blue gray/navy
      doc.rect(15, y, 180, 24, 'F');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(255, 255, 255);
      doc.text('TRIPPLANNER AI - TRIP PLAN ITINERARY', 22, y + 15);
      y += 32;

      // 2. Summary Details Card
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.rect(15, y, 180, 42, 'FD');
      
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(10.5);

      // Col 1
      doc.setFont('Helvetica', 'bold');
      doc.text('Destination:', 20, y + 10);
      doc.setFont('Helvetica', 'normal');
      doc.text(`${context.input.destination || 'N/A'}`, 48, y + 10);

      doc.setFont('Helvetica', 'bold');
      doc.text('Origin:', 20, y + 18);
      doc.setFont('Helvetica', 'normal');
      doc.text(`${context.input.origin || 'N/A'}`, 48, y + 18);

      doc.setFont('Helvetica', 'bold');
      doc.text('Dates:', 20, y + 26);
      doc.setFont('Helvetica', 'normal');
      doc.text(`${context.input.start_date || 'N/A'} to ${context.input.end_date || 'N/A'}`, 48, y + 26);

      doc.setFont('Helvetica', 'bold');
      doc.text('Travelers:', 20, y + 34);
      doc.setFont('Helvetica', 'normal');
      doc.text(`${context.input.travelers || 1} guest(s)`, 48, y + 34);

      // Col 2
      const selectedHotelName = context.accommodation?.recommended || context.accommodation?.selected_hotel?.name || 'Self Arranged';
      const transportProvider = context.transport?.selected_option 
        ? `${context.transport.selected_option.operator} (${context.transport.selected_option.mode})`
        : (context.transport?.options?.[0]
          ? `${context.transport.options[0].operator} (${context.transport.options[0].mode})`
          : 'Self Arranged');

      doc.setFont('Helvetica', 'bold');
      doc.text('Accommodation:', 112, y + 10);
      doc.setFont('Helvetica', 'normal');
      
      // Make Hotel Name a clickable link in the header card
      if (selectedHotelName && selectedHotelName !== 'Self Arranged' && selectedHotelName !== 'Hotel') {
        doc.setTextColor(79, 70, 229); // indigo link color
        let truncatedHotelName = selectedHotelName.length > 22 ? selectedHotelName.substring(0, 20) + '...' : selectedHotelName;
        const hotelCardMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedHotelName + ' ' + (context.input?.destination || ''))}`;
        doc.textWithLink(truncatedHotelName, 148, y + 10, { url: hotelCardMapsUrl });
        
        // draw underline
        const wCard = doc.getTextWidth(truncatedHotelName);
        doc.setDrawColor(79, 70, 229);
        doc.setLineWidth(0.15);
        doc.line(148, y + 10.5, 148 + wCard, y + 10.5);
      } else {
        doc.text(selectedHotelName, 148, y + 10);
      }
      doc.setTextColor(30, 41, 59); // Reset

      doc.setFont('Helvetica', 'bold');
      doc.text('Main Transit:', 112, y + 18);
      doc.setFont('Helvetica', 'normal');
      let truncatedTransitGroup = transportProvider.length > 22 ? transportProvider.substring(0, 20) + '...' : transportProvider;
      doc.text(truncatedTransitGroup, 148, y + 18);

      doc.setFont('Helvetica', 'bold');
      doc.text('Budget Ceiling:', 112, y + 26);
      doc.setFont('Helvetica', 'normal');
      doc.text(`INR ${(context.input.budget_inr || 30000).toLocaleString()}`, 148, y + 26);

      doc.setFont('Helvetica', 'bold');
      doc.text('Feasibility:', 112, y + 34);
      doc.setFont('Helvetica', 'normal');
      doc.text(context.budget?.is_feasible ? 'Feasible (Within Budget)' : 'Over Budget Constraint', 148, y + 34);

      y += 50;

      // 3. Booking references if confirmed
      if (context.booking?.refs) {
        checkPageBreak(30);
        doc.setDrawColor(99, 102, 241);
        doc.setFillColor(245, 243, 255);
        doc.rect(15, y, 180, 18, 'FD');
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(109, 40, 217); // Purple
        doc.text('CONFIRMED RESERVATIONS & BOOKING REFERENCES:', 20, y + 6);
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(8.5);
        doc.text(`Hotel Booking Ref: ${context.booking.refs.hotel || 'N/A'}    |    Transit Booking Ref: ${context.booking.refs.transport || 'N/A'}    |    Sync: ${context.booking.refs.calendar || 'Completed'}`, 20, y + 12);
        
        y += 26;
      }

      // 4. Budget summary table
      if (context.budget) {
        checkPageBreak(75);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text('Planned Budget Breakdown & Cost Analysis', 15, y);
        y += 6;

        // Table Header
        doc.setFillColor(241, 245, 249);
        doc.rect(15, y, 180, 8, 'F');
        doc.setFontSize(8.5);
        doc.setFont('Helvetica', 'bold');
        doc.text('Expense Category', 20, y + 5.5);
        doc.text('Cost (INR)', 160, y + 5.5);
        y += 8;

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        
        const budgetCategoryRows = [
          { name: 'Main Transit (Outbound & Return Commutes)', cost: context.budget.transport || 0 },
          { name: 'Lodging (Hotel / Accommodation stays)', cost: context.budget.accommodation || 0 },
          { name: 'Food & Meals budget allocation', cost: context.budget.food || 0 },
          { name: 'Local Sightseeing & Activities (Entry Fees)', cost: context.budget.activities || 0 },
          { name: 'Local Transport (Taxi / Auto Rickshaw commutes)', cost: context.budget.local_transport || 0 },
          { name: 'Emergency backup reserve logic (10%)', cost: context.budget.emergency_fund || 0 },
        ];

        budgetCategoryRows.forEach(row => {
          doc.text(row.name, 20, y + 5.5);
          doc.text(`INR ${Number(row.cost).toLocaleString()}`, 160, y + 5.5);
          doc.setDrawColor(241, 245, 249);
          doc.line(15, y + 8, 195, y + 8);
          y += 8;
        });

        // Total sum
        const estimatedTotalVal = context.budget.total_cost_inr ?? context.budget.total_estimated_cost ?? 0;
        doc.setFont('Helvetica', 'bold');
        doc.setFillColor(236, 253, 245);
        doc.rect(15, y, 180, 9, 'F');
        doc.setTextColor(16, 185, 129); // green
        doc.text('TOTAL ESTIMATED TRIP COST', 20, y + 6);
        doc.text(`INR ${estimatedTotalVal.toLocaleString()}`, 160, y + 6);
        y += 18;
      }

      // 5. Curated Day-to-Day Timeline Planner
      if (context.itinerary?.days && Array.isArray(context.itinerary.days)) {
        checkPageBreak(25);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(12.5);
        doc.setTextColor(79, 70, 229); // Indigo
        doc.text('Curated Chronological Timeline Itinerary', 15, y);
        y += 8;

        context.itinerary.days.forEach((day: any) => {
          checkPageBreak(35);
          // Day title bar
          doc.setFillColor(99, 102, 241); // Indigo-500
          doc.rect(15, y, 180, 9, 'F');
          doc.setFontSize(9.5);
          doc.setFont('Helvetica', 'bold');
          doc.setTextColor(255, 255, 255);
          
          const title = `Day ${day.day}: ${cleanForPDF(day.title || 'Sightseeing schedule')}`;
          doc.text(title, 20, y + 6);
          if (day.daily_total_inr > 0) {
            doc.text(`Estimated Spend: INR ${day.daily_total_inr.toLocaleString()}`, 148, y + 6);
          }
          y += 9;

          // Weather block
          if (day.weather_note) {
            doc.setFillColor(239, 246, 255);
            doc.rect(15, y, 180, 6, 'F');
            doc.setFontSize(8.5);
            doc.setFont('Helvetica', 'oblique');
            doc.setTextColor(30, 41, 59);
            
            const cleanedWeather = cleanForPDF(day.weather_note);
            doc.text(`Weather Status: ${cleanedWeather}`, 20, y + 4.5);
            y += 6;
          }
          y += 4;

          // Prepend chosen hotel base node in timeline list
          if (selectedHotelName && selectedHotelName !== 'Self Arranged' && selectedHotelName !== 'Hotel') {
            checkPageBreak(22);
            const hotelNodeStartY = y;

            // Timeline dot for hotel
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(99, 102, 241);
            doc.setLineWidth(0.4);
            doc.circle(20, y + 3.5, 1.2, 'FD');

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(99, 102, 241);
            doc.text('Base Hotel Stay', 24, y + 4.5);

            y += 9;

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(79, 70, 229); // clickable link style
            
            const hotelMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedHotelName + ' ' + (context.input?.destination || ''))}`;
            doc.textWithLink(selectedHotelName, 24, y, { url: hotelMapsUrl });
            
            const hotelLinkWidth = doc.getTextWidth(selectedHotelName);
            doc.setDrawColor(79, 70, 229);
            doc.setLineWidth(0.15);
            doc.line(24, y + 0.5, 24 + hotelLinkWidth, y + 0.5);
            
            y += 6;

            // Connector line for hotel item
            doc.setDrawColor(99, 102, 241);
            doc.line(20, hotelNodeStartY, 20, y);
            y += 2;
          }

          // Schedule items
          if (day.schedule && Array.isArray(day.schedule) && day.schedule.length > 0) {
            day.schedule.forEach((action: any) => {
              // Estimate height for page break check
              let itemH = 15;
              if (action.transport_note) itemH += 5;
              checkPageBreak(itemH);
              
              const itemStartY = y;
              
              // Timeline connector circle
              doc.setFillColor(255, 255, 255);
              doc.setDrawColor(99, 102, 241);
              doc.setLineWidth(0.4);
              doc.circle(20, y + 3.5, 1.2, 'FD');

              // Period and Costs
              const formattedTime = formatTimeAndPeriod(action.time) || action.time;
              doc.setFont('Helvetica', 'bold');
              doc.setFontSize(8.5);
              doc.setTextColor(99, 102, 241);
              doc.text(formattedTime, 24, y + 4.5);

              // Cost string
              let priceDetails = '';
              if (action.cost_inr > 0) priceDetails += `Entry: INR ${action.cost_inr.toLocaleString()}`;
              if (action.travel_cost_inr > 0) {
                if (priceDetails) priceDetails += '  |  ';
                priceDetails += `Commute: INR ${action.travel_cost_inr.toLocaleString()}`;
              }
              if (priceDetails) {
                doc.setFont('Helvetica', 'bold');
                doc.setFontSize(8);
                doc.setTextColor(16, 185, 129);
                doc.text(priceDetails, 150, y + 4.5);
              }
              y += 10; // spacing between time row and activity row

              // Activity name & Location link drawing
              doc.setFont('Helvetica', 'bold');
              doc.setFontSize(9);
              doc.setTextColor(30, 41, 59);

              let activityText = action.activity;
              let hasLink = false;
              let locationName = '';
              let mapsUrl = '';

              if (action.location) {
                locationName = action.location;
                const placeQuery = action.location;
                mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeQuery + ' ' + (context.input?.destination || ''))}`;
                hasLink = true;
                
                if (!activityText.toLowerCase().includes(locationName.toLowerCase())) {
                  activityText += ' at ';
                }
              }

              doc.text(activityText, 24, y);
              
              if (hasLink && locationName) {
                const activityWidth = doc.getTextWidth(activityText);
                doc.setTextColor(79, 70, 229);
                doc.textWithLink(locationName, 24 + activityWidth, y, { url: mapsUrl });
                
                const locationWidth = doc.getTextWidth(locationName);
                doc.setDrawColor(79, 70, 229);
                doc.setLineWidth(0.15);
                doc.line(24 + activityWidth, y + 0.5, 24 + activityWidth + locationWidth, y + 0.5);
                
                doc.setTextColor(30, 41, 59); // Reset color
              }
              y += 6; // Move below activity line

              // Transport note
              if (action.transport_note) {
                doc.setFont('Helvetica', 'oblique');
                doc.setFontSize(8);
                doc.setTextColor(100, 116, 139);
                const cleanedTransitLine = cleanForPDF(action.transport_note);
                doc.text(`   ${cleanedTransitLine}`, 24, y);
                y += 5; // Move below transport note line
              }
              
              // Draw timeline segment
              doc.setDrawColor(99, 102, 241);
              doc.setLineWidth(0.4);
              doc.line(20, itemStartY, 20, y);
              
              y += 3; // buffer spacing between timeline nodes
            });
          } else {
            doc.setFont('Helvetica', 'oblique');
            doc.setFontSize(8.5);
            doc.setTextColor(100, 116, 139);
            doc.text('Leisure & rest hours.', 25, y + 4.5);
            y += 8;
          }
          y += 5;
        });

        // 6. Curated Notes
        if (context.itinerary.notes) {
          checkPageBreak(30);
          
          doc.setDrawColor(226, 232, 240);
          doc.setFillColor(248, 250, 252);
          doc.rect(15, y, 180, 22, 'FD');
          
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(79, 70, 229);
          doc.text('Core Notes & Recommendations:', 20, y + 6);
          
          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(71, 85, 105);
          const splitNotes = doc.splitTextToSize(cleanForPDF(context.itinerary.notes), 170);
          doc.text(splitNotes, 20, y + 12);
        }
      }

      // Download
      doc.save(`TripPlanner_Itinerary_${context.input.destination || 'Trip'}.pdf`);
      toast.success('Successfully downloaded PDF Itinerary! 📄');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to generate PDF document.');
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
            /* TAB 1: INSPECTOR DETAILS */
            <div className="space-y-4">
              {/* STAGE & STATUS CARD */}
              <div className="premium-card rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <p className={`text-xs font-semibold mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>TRIP STATUS</p>
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
                    <span className={`font-bold text-sm tracking-wide uppercase ${isDark ? 'text-white' : 'text-slate-800'}`}>{context.status}</span>
                  </div>
                </div>

                {/* Exporter Utility */}
                {(context.status === 'CONFIRMED' || context.status === 'PLANNED') && (
                  <button
                    onClick={handleDownloadItinerary}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white transition active:scale-95 shadow-md hover:shadow-indigo-500/10 cursor-pointer select-none"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download Itinerary
                  </button>
                )}

                <div>
                  <p className={`text-xs text-right mb-0.5 font-semibold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>SESSION ID</p>
                  <span className={`font-mono text-xs px-2 py-1 rounded border ${isDark ? 'text-slate-400 bg-slate-900 border-slate-800' : 'text-slate-600 bg-slate-100 border-slate-200'}`}>
                    {context.sessionId.substring(0, 8)}
                  </span>
                </div>
              </div>

              {/* BOOKING CONFIRMATION DETAILS (Only visible when status is CONFIRMED) */}
              {context.status === 'CONFIRMED' && (
                <div className="premium-card rounded-xl p-5 border border-emerald-500/20 bg-emerald-500/5 space-y-4 animate-fadeIn">
                  <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5 font-sans animate-pulse">
                    <Check className="h-4 w-4 text-emerald-450 bg-emerald-500/10 p-0.5 rounded-full" />
                    Booking Reservations Confirmed
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`p-3 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-205'}`}>
                      <span className={`text-[10px] block font-bold uppercase mb-1 flex items-center gap-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        <Building2 className="h-3.5 w-3.5 text-primary animate-pulse" /> Lodging Reservation
                      </span>
                      <p className={`font-bold text-xs ${isDark ? 'text-slate-200' : 'text-slate-850'}`}>
                        {context.accommodation?.recommended || 'Recommended Hotel'}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={`text-[10.5px] px-2 py-0.5 rounded font-mono font-bold ${isDark ? 'bg-slate-950 text-emerald-450 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border border-emerald-250/50'}`}>
                          {context.booking?.refs?.hotel || 'Securing...'}
                        </span>
                        <span className="text-[9px] text-slate-500 font-medium">Secured</span>
                      </div>
                    </div>

                    <div className={`p-3 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-205'}`}>
                      <span className={`text-[10px] block font-bold uppercase mb-1 flex items-center gap-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        <Car className="h-3.5 w-3.5 text-primary animate-pulse" /> Transit Reservation
                      </span>
                      <p className={`font-bold text-xs ${isDark ? 'text-slate-205' : 'text-slate-850'}`}>
                        {context.transport?.best_option || (context.transport?.options?.[0]?.operator ? `${context.transport?.options?.[0]?.mode}: ${context.transport?.options?.[0]?.operator}` : 'Best Transport Option')}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={`text-[10.5px] px-2 py-0.5 rounded font-mono font-bold ${isDark ? 'bg-slate-950 text-emerald-450 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border border-emerald-250/50'}`}>
                          {context.booking?.refs?.transport || 'Securing...'}
                        </span>
                        <span className="text-[9px] text-slate-550 font-medium">Secured</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${isDark ? 'bg-slate-950/45 border-slate-850' : 'bg-[#f0fdf4]/50 border-emerald-100/50'}`}>
                    <div>
                      <span className={`text-[10px] block font-bold uppercase mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Google Calendar Integration</span>
                      <span className={`text-xs font-semibold ${isDark ? 'text-slate-350' : 'text-slate-700'}`}>
                        📅 {context.booking?.refs?.calendar && context.booking.refs.calendar !== 'No calendar synced' ? 'Successfully synced to calendar' : 'Not synced to Google Calendar'}
                      </span>
                    </div>
                    {context.booking?.confirmed_at && (
                      <span className={`text-[10px] font-semibold sm:text-right ${isDark ? 'text-slate-500' : 'text-slate-550'}`}>
                        Confirmed: {new Date(context.booking.confirmed_at).toLocaleDateString()} at {new Date(context.booking.confirmed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* EXTRACTED SLOTS */}
              <div className="premium-card rounded-xl p-5 space-y-3.5">
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                  <MapPin className="h-2.5 w-2.5 text-primary" /> Checked Parameters
                </h4>
                <div className="grid grid-cols-2 gap-3.5">
                  <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <span className={`text-[10px] block font-bold uppercase mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Destination</span>
                    <span className={`text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      {context.input.destination || <em className={isDark ? 'text-slate-600' : 'text-slate-400'}>Pending...</em>}
                    </span>
                  </div>
                  <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <span className={`text-[10px] block font-bold uppercase mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Origin</span>
                    <span className={`text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      {context.input.origin || <em className={isDark ? 'text-slate-600' : 'text-slate-400'}>Not selected</em>}
                    </span>
                  </div>
                  <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <span className={`text-[10px] block font-bold uppercase mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Travelers</span>
                    <span className={`text-xs font-semibold flex items-center gap-1 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      <Users className="h-3.5 w-3.5 text-primary" />
                      {context.input.travelers || 0}
                    </span>
                  </div>
                  <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <span className={`text-[10px] block font-bold uppercase mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Cap Limit</span>
                    <span className="text-xs font-semibold text-emerald-500 flex items-center gap-0.5">
                      <IndianRupee className="h-3.5 w-3.5 text-emerald-500" />
                      {context.input.budget_inr ? context.input.budget_inr.toLocaleString() : 0}
                    </span>
                  </div>
                  <div className={`col-span-2 p-2.5 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <span className={`text-[10px] block font-bold uppercase mb-0.5 font-sans ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Dates</span>
                    <span className={`text-xs font-semibold flex items-center gap-1.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      <CalendarDays className="h-4.5 w-4.5 text-primary" />
                      {context.input.start_date || 'YYYY-MM-DD'} – {context.input.end_date || 'YYYY-MM-DD'}
                    </span>
                  </div>
                </div>
              </div>

              {/* DYNAMIC RETRIEVED DATA */}
              {context.budget && (
                <div className="premium-card rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                    <IndianRupee className="h-4.5 w-4.5 text-emerald-450" /> Cost & Budget Assessment
                  </h4>

                  <div className="grid grid-cols-2 gap-2">
                    <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                      <span className={`text-[10px] block font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Estimated Total</span>
                      <span className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                        ₹{(context.budget.total_cost_inr ?? context.budget.total_estimated_cost)?.toLocaleString()}
                      </span>
                    </div>
                    <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                      <span className={`text-[10px] block font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Status</span>
                      <span
                        className={`text-xs font-bold ${
                          context.budget.is_feasible ? 'text-emerald-500' : 'text-red-500'
                        }`}
                      >
                        {context.budget.is_feasible ? 'Feasible' : 'Infeasible'}
                      </span>
                    </div>
                  </div>

                  {/* Toggle Cost Breakdown Dropdown */}
                  {(context.budget.transport !== undefined || context.budget.accommodation !== undefined) && (
                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowBudgetBreakdown(!showBudgetBreakdown)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-bold transition select-none cursor-pointer ${
                          isDark
                            ? 'bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-indigo-300 hover:text-indigo-200'
                            : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-indigo-600 hover:text-indigo-700'
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          📊 {showBudgetBreakdown ? 'Hide Details' : 'View Cost Breakdown'}
                        </span>
                        {showBudgetBreakdown ? (
                          <ChevronUp className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        )}
                      </button>

                      {showBudgetBreakdown && (
                        <div className={`rounded-lg border p-3 mt-2 overflow-x-auto animate-fadeIn ${isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50'}`}>
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className={`border-b text-[10px] uppercase font-bold ${isDark ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
                                <th className="pb-1.5 font-bold">Category</th>
                                <th className="pb-1.5 text-right font-bold">Cost (INR)</th>
                              </tr>
                            </thead>
                            <tbody className={`divide-y font-medium ${isDark ? 'divide-slate-900' : 'divide-slate-100'}`}>
                              <tr>
                                <td className={`py-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>✈️ Transit</td>
                                <td className={`py-2 text-right ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                  ₹{(context.budget.transport || 0).toLocaleString()}
                                </td>
                              </tr>
                              <tr>
                                <td className={`py-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>🏨 Lodging</td>
                                <td className={`py-2 text-right ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                  ₹{(context.budget.accommodation || 0).toLocaleString()}
                                </td>
                              </tr>
                              <tr>
                                <td className={`py-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>🍔 Food & Meals</td>
                                <td className={`py-2 text-right ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                  ₹{(context.budget.food || 0).toLocaleString()}
                                </td>
                              </tr>
                              <tr>
                                <td className={`py-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>🎟️ Sightseeing / Entrance</td>
                                <td className={`py-2 text-right ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                  ₹{(context.budget.activities || 0).toLocaleString()}
                                </td>
                              </tr>
                              <tr>
                                <td className={`py-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>🚕 Local Transport</td>
                                <td className={`py-2 text-right ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                  ₹{(context.budget.local_transport || 0).toLocaleString()}
                                </td>
                              </tr>
                              <tr>
                                <td className={`py-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>🚨 Emergency Fund (10%)</td>
                                <td className={`py-2 text-right ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                  ₹{(context.budget.emergency_fund || 0).toLocaleString()}
                                </td>
                              </tr>
                              <tr className={`border-t font-bold ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                <td className="pt-2 text-primary font-bold">💰 Total Cost</td>
                                <td className="pt-2 text-right text-emerald-500 font-bold">
                                  ₹{(context.budget.total_cost_inr ?? context.budget.total_estimated_cost)?.toLocaleString()}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {!context.budget.is_feasible && context.budget.alternatives && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-2.5">
                      <div className="flex gap-1.5 text-red-400 text-xs font-semibold">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>Plan exceeds your budget constraint!</span>
                      </div>
                      <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Select one of the alternatives computed by the Budget Agent:
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {context.budget.alternatives.map((altOption: string, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => handleAlternativeSelect(altOption)}
                            className={`w-full text-left border rounded px-2.5 py-1.5 text-xs transition animate-fadeIn cursor-pointer ${
                              isDark
                                ? 'bg-slate-900 hover:bg-indigo-950 text-indigo-300 hover:text-indigo-400 border-indigo-900/30'
                                : 'bg-white hover:bg-indigo-50 text-indigo-600 hover:text-indigo-700 border-indigo-200/50'
                            }`}
                          >
                            💸 {altOption}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {context.weather && (
                <div className="premium-card rounded-xl p-4 space-y-3">
                  <h4 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1 ${
                    isDark ? 'text-indigo-400' : 'text-indigo-700'
                  }`}>
                    <Sun className="h-4.5 w-4.5 text-amber-500" /> Climate Specialist Agent
                  </h4>
                  <div className={`p-3 rounded-lg border text-xs space-y-3 transition-colors ${
                    isDark ? 'bg-indigo-950/20 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <p className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      ⛅ Destination Climate Conditions
                    </p>

                    {/* Horizontal daily weather forecast cards */}
                    {Array.isArray(context.weather.forecast) && context.weather.forecast.length > 0 && (
                      <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-thin">
                        {context.weather.forecast.map((day: any, idx: number) => {
                          const getWeatherEmoji = (condition: string = '') => {
                            const cond = condition.toLowerCase();
                            if (cond.includes('clear') || cond.includes('sunny')) return '☀️';
                            if (cond.includes('partly cloudy') || cond.includes('few clouds') || cond.includes('cast')) return '🌤️';
                            if (cond.includes('cloudy') || cond.includes('overcast') || cond.includes('fog')) return '☁️';
                            if (cond.includes('thunder') || cond.includes('storm')) return '🌩️';
                            if (cond.includes('rain') || cond.includes('shower') || cond.includes('drizzle')) return '🌧️';
                            if (cond.includes('snow') || cond.includes('hail') || cond.includes('sleet')) return '❄️';
                            return '⛅';
                          };

                          const dateObj = new Date(day.date);
                          const formattedDate = isNaN(dateObj.getTime())
                            ? day.date
                            : dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                          return (
                            <div
                              key={idx}
                              className={`flex-shrink-0 w-28 p-2.5 rounded-lg border text-center transition-all ${
                                isDark
                                  ? 'bg-slate-900/60 border-slate-850 hover:border-slate-700'
                                  : 'bg-white border-slate-205 hover:border-slate-300 shadow-sm'
                              }`}
                            >
                              <p className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {formattedDate}
                              </p>
                              <div className="text-xl my-1">{getWeatherEmoji(day.condition)}</div>
                              <p className={`text-[10px] font-semibold truncate mb-1 ${isDark ? 'text-slate-300' : 'text-slate-650'}`} title={day.condition}>
                                {day.condition || 'Clear'}
                              </p>
                              <p className="text-[10.5px] font-bold text-primary">
                                {Math.round(day.temp_high_c)}°C / <span className={`${isDark ? 'text-slate-400' : 'text-slate-500'} font-normal`}>{Math.round(day.temp_low_c)}°C</span>
                              </p>
                              {day.rain_mm > 0 && (
                                <p className={`text-[9px] font-bold mt-0.5 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                                  🌧️ {day.rain_mm} mm
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {context.weather.reasoning && (
                      <div className={`mt-2 p-2.5 rounded border text-[11px] leading-relaxed transition-colors ${
                        isDark ? 'text-indigo-300 bg-indigo-950/45 border-indigo-900/40' : 'text-indigo-900 bg-indigo-50 border-indigo-120/40'
                      }`}>
                        <div className="flex items-start gap-1">
                          <span className="text-[12px] shrink-0 mt-0.5">🧠</span>
                          <div className={`prose max-w-none text-[11px] space-y-1 ${
                            isDark ? 'prose-invert text-indigo-300' : 'text-indigo-900 prose-slate'
                          }`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{context.weather.reasoning}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {context.accommodation && (
                <div className="premium-card rounded-xl p-4 space-y-2">
                  <h4 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1 ${
                    isDark ? 'text-indigo-400' : 'text-indigo-700'
                  }`}>
                    <Building2 className="h-4.5 w-4.5 text-primary" /> Lodging Specialist Agent
                  </h4>
                  <div className={`p-3 rounded-lg border text-xs space-y-3 transition-colors ${
                    isDark ? 'bg-indigo-950/20 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    {(() => {
                      const hasCategories = context.accommodation.categories && typeof context.accommodation.categories === 'object';
                      const hotelsList = hasCategories
                        ? (context.accommodation.categories[lodgingCategoryTab] || [])
                        : (context.accommodation.hotels || []);

                      if (Array.isArray(hotelsList) && hotelsList.length > 0) {
                        return (
                          <div className="space-y-3.5">
                            <div className="flex items-center justify-between">
                              <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                🏨 {hasCategories ? 'Compare Hotel Tiers' : 'Compare Lodging Choices'}
                              </p>
                              {context.accommodation.selected_category && (
                                <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                  context.accommodation.selected_category === 'skipped'
                                    ? 'bg-amber-500 text-white border border-amber-400'
                                    : isDark
                                    ? 'bg-indigo-950 text-indigo-400 border border-indigo-900/60'
                                    : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                }`}>
                                  Active: {context.accommodation.selected_category === 'skipped' ? 'Self Arranged' : context.accommodation.selected_category.replace('_', ' ')}
                                </span>
                              )}
                            </div>

                            {hotelsList.some((h: any) => h.is_llm_recommended) && (
                              <div className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                                isDark
                                  ? 'bg-amber-950/15 border-amber-800/30 text-amber-300'
                                  : 'bg-amber-50 border-amber-200 text-amber-800'
                              }`}>
                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                                <div className="space-y-1">
                                  <p className="font-bold text-[10.5px]">Live booking data unavailable — AI recommendations shown</p>
                                  <p className={`text-[10px] leading-relaxed ${isDark ? 'text-amber-400/80' : 'text-amber-700'}`}>
                                    We couldn't find verified hotel listings for <span className="font-bold">{context.input?.destination}</span> via our booking provider. These are popular properties recommended by AI. You can choose any of these options for your trip, and click any card to view it on Google Maps.
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Tiers Tab Bar */}
                            {hasCategories && (
                              <div className="space-y-2">
                                <div className="flex rounded-lg p-0.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                  {(['budget', 'mid_range', 'luxury'] as const).map((tab) => {
                                    const optionsCount = (context.accommodation.categories[tab] || []).length;
                                    if (optionsCount === 0) return null;
                                    const tabLabel = tab === 'budget' 
                                      ? 'Budget (<₹5k)' 
                                      : tab === 'mid_range' 
                                      ? 'Mid-Range (₹5k-₹15k)' 
                                      : 'Luxury (>₹15k)';
                                    const isActive = lodgingCategoryTab === tab;
                                    return (
                                      <button
                                        key={tab}
                                        type="button"
                                        onClick={() => setLodgingCategoryTab(tab)}
                                        className={`flex-1 text-center py-1.5 text-[10.5px] font-bold rounded-md transition select-none cursor-pointer ${
                                          isActive
                                            ? isDark
                                              ? 'bg-slate-850 text-indigo-400 shadow-sm border border-slate-750'
                                              : 'bg-white text-indigo-600 shadow-sm border border-slate-205'
                                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                                        }`}
                                      >
                                        {tabLabel} ({optionsCount})
                                      </button>
                                    );
                                  })}
                                </div>

                                {context.status !== 'CONFIRMED' && (
                                  <button
                                    type="button"
                                    disabled={selectHotelMutation.isPending}
                                    onClick={() => handleSelectHotel('Self Arranged', 'skipped')}
                                    className={`w-full py-1.5 rounded-lg text-[10.5px] font-bold border transition text-center flex items-center justify-center gap-1 select-none cursor-pointer ${
                                      context.accommodation.selected_category === 'skipped'
                                        ? isDark
                                          ? 'bg-amber-500/10 border-amber-500/50 text-amber-300'
                                          : 'bg-amber-50 border-amber-300 text-amber-800'
                                        : isDark
                                          ? 'bg-slate-900/50 hover:bg-amber-500/10 border-slate-800 text-slate-400 hover:text-amber-300 hover:border-amber-500/30'
                                          : 'bg-white hover:bg-amber-50/50 border-slate-205 text-slate-500 hover:text-amber-850 hover:border-amber-250'
                                    }`}
                                  >
                                    {context.accommodation.selected_category === 'skipped' ? (
                                      <>
                                        <Check className="h-3 w-3 text-amber-500" /> Skipped: Arranging Accommodation Myself
                                      </>
                                    ) : (
                                      'Skip Lodgings (Arrange Myself / Managed manually)'
                                    )}
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Hotels List */}
                            <div className="flex flex-col gap-2.5">
                               {hotelsList.map((hotel: any, idx: number) => {
                                const isRecommended = hotel.name === context.accommodation.recommended;
                                const ratingCount = Math.round(hotel.rating || 4.0);
                                const stars = Array.from({ length: 5 }, (_, i) => i < ratingCount);
                                const isSaving = selectHotelMutation.isPending;

                                return (
                                  <div
                                    key={idx}
                                    className={`p-3 rounded-xl border transition flex flex-col gap-2.5 cursor-pointer hover:shadow-md ${
                                      isRecommended
                                        ? isDark
                                          ? 'bg-indigo-955/20 border-primary shadow-md shadow-primary/5'
                                          : 'bg-indigo-50/40 border-indigo-400 shadow-md shadow-indigo-100/30'
                                        : isDark
                                        ? 'bg-slate-900/40 border-slate-850 hover:border-slate-700'
                                        : 'bg-white border-slate-205 hover:border-slate-350'
                                    }`}
                                    onClick={(e) => {
                                      const target = e.target as HTMLElement;
                                      if (target.tagName !== 'BUTTON' && !target.closest('button') && target.tagName !== 'A' && !target.closest('a')) {
                                        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hotel.name + ' ' + (context.input?.destination || ''))}`, '_blank');
                                      }
                                    }}
                                  >
                                    <div className="flex justify-between items-start">
                                      <div className="space-y-1 max-w-[70%]">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span className={`font-bold text-xs ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                            {hotel.name}
                                          </span>
                                          {isRecommended && (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-white leading-none flex items-center gap-0.5 animate-fadeIn">
                                              <Check className="h-2.5 w-2.5" /> Selected
                                            </span>
                                          )}
                                          <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hotel.name + ' ' + (context.input?.destination || ''))}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title="View on Google Maps"
                                            className="text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors flex items-center p-0.5"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <ArrowUpRight className="h-3.5 w-3.5" />
                                          </a>
                                        </div>

                                        {/* Star Ratings */}
                                        <div className="flex items-center gap-1">
                                          <span className="flex text-amber-500 text-[10px]">
                                            {stars.map((filled, sIdx) => (
                                              <span key={sIdx}>{filled ? '★' : '☆'}</span>
                                            ))}
                                          </span>
                                          <span className={`text-[9.5px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            ({hotel.rating || 4.0}/5 rating)
                                          </span>
                                        </div>
                                      </div>

                                      <div className="text-right">
                                        <p className="text-xs font-bold text-emerald-500">
                                          ₹{hotel.price_per_night_inr ? hotel.price_per_night_inr.toLocaleString() : 0} <span className={`text-[8.5px] font-normal ${isDark ? 'text-slate-450' : 'text-slate-500'}`}>/ night</span>
                                        </p>
                                        {hotel.total_cost_inr && (
                                          <p className={`text-[9.5px] font-semibold mt-0.5 ${isDark ? 'text-slate-450' : 'text-slate-550'}`}>
                                            ₹{hotel.total_cost_inr.toLocaleString()} total
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    {hotel.address && (
                                      <p className={`text-[10px] flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-505'}`}>
                                        <MapPin className="h-3 w-3 shrink-0 text-indigo-455" /> {hotel.address}
                                      </p>
                                    )}

                                    {hotel.description && (
                                      <p className={`text-[10.5px] leading-relaxed italic ${isDark ? 'text-slate-350' : 'text-slate-600'}`}>
                                        "{hotel.description}"
                                      </p>
                                    )}

                                    {/* Amenities list */}
                                    {Array.isArray(hotel.amenities) && hotel.amenities.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {hotel.amenities.slice(0, 4).map((amenity: string, aIdx: number) => (
                                          <span
                                            key={aIdx}
                                            className={`text-[8.5px] font-semibold px-2 py-0.5 rounded-full border ${
                                              isDark
                                                ? 'bg-slate-950/50 border-slate-800 text-slate-400'
                                                : 'bg-slate-50 border-slate-205 text-slate-500'
                                            }`}
                                          >
                                            {amenity}
                                          </span>
                                        ))}
                                      </div>
                                    )}

                                    {/* Select Button */}
                                    {context.status !== 'CONFIRMED' && !isRecommended && (
                                      <button
                                        type="button"
                                        disabled={isSaving || context.status === 'CONFIRMED'}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSelectHotel(hotel.name, lodgingCategoryTab);
                                        }}
                                        className={`w-full py-1.5 rounded-lg text-xs font-bold border transition text-center flex items-center justify-center gap-1 cursor-pointer select-none ${
                                          isDark
                                            ? 'bg-indigo-950/40 hover:bg-primary/20 border-indigo-900/40 text-indigo-300 hover:text-white'
                                            : 'bg-indigo-50/50 hover:bg-primary/10 border-indigo-200 text-indigo-700 hover:text-indigo-805'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                      >
                                        {isSaving ? (
                                          <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Selecting Hotel...
                                          </>
                                        ) : (
                                          'Choose Hotel'
                                        )}
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-3.5">
                          <div className={`rounded-xl border p-4 space-y-2 ${isDark ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'}`}>
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                              <p className={`text-xs font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                No destination-matching hotels found
                              </p>
                            </div>
                            <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                              We could not find hotels that clearly match <span className="font-bold">{context.input?.destination || 'this destination'}</span>. We are hiding unrelated results instead of showing wrong hotels.
                            </p>
                            <p className={`text-[10.5px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                              You can continue with self-arranged stay, try a different budget tier, or adjust the destination wording.
                            </p>
                          </div>

                          {context.status !== 'CONFIRMED' && (
                            <button
                              type="button"
                              disabled={selectHotelMutation.isPending}
                              onClick={() => handleSelectHotel('Self Arranged', 'skipped')}
                              className={`w-full py-2 rounded-lg text-[10.5px] font-bold border transition text-center flex items-center justify-center gap-1 select-none cursor-pointer ${
                                context.accommodation.selected_category === 'skipped'
                                  ? isDark
                                    ? 'bg-amber-500/10 border-amber-500/50 text-amber-300'
                                    : 'bg-amber-50 border-amber-300 text-amber-800'
                                  : isDark
                                    ? 'bg-slate-900/50 hover:bg-amber-500/10 border-slate-800 text-slate-400 hover:text-amber-300 hover:border-amber-500/30'
                                    : 'bg-white hover:bg-amber-50/50 border-slate-205 text-slate-500 hover:text-amber-850 hover:border-amber-250'
                              }`}
                            >
                              {context.accommodation.selected_category === 'skipped' ? (
                                <>
                                  <Check className="h-3 w-3 text-amber-500" /> Skipped: Arranging Accommodation Myself
                                </>
                              ) : (
                                'Continue with Self-Arranged Stay'
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    {context.accommodation.reasoning && (
                      <div className={`mt-2 p-2.5 rounded border text-[11px] leading-relaxed transition-colors ${
                        isDark ? 'text-indigo-300 bg-indigo-950/45 border-indigo-900/40' : 'text-indigo-900 bg-indigo-50 border-indigo-120/40'
                      }`}>
                        <div className="flex items-start gap-1">
                          <span className="text-[12px] shrink-0 mt-0.5">🧠</span>
                          <div className={`prose max-w-none text-[11px] space-y-1 ${
                            isDark ? 'prose-invert text-indigo-300' : 'text-indigo-900 prose-slate'
                          }`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{context.accommodation.reasoning}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── DINING OPTIONS ── */}
                    {(() => {
                      const selectedHotel = context.accommodation?.selected_hotel ||
                        (context.accommodation?.hotels?.[0] ?? null);
                      const hotelAmenities: string[] = Array.isArray(selectedHotel?.amenities)
                        ? selectedHotel.amenities
                        : [];

                      const diningKeywords = ['restaurant', 'room service', 'dining', 'breakfast', 'bar', 'buffet', 'café', 'cafe', 'food', 'kitchen', 'meal'];
                      const inHotelDining = hotelAmenities.filter((a: string) =>
                        diningKeywords.some(kw => a.toLowerCase().includes(kw))
                      );

                      const hasRoomService = hotelAmenities.some((a: string) => a.toLowerCase().includes('room service'));
                      const hasRestaurant = hotelAmenities.some((a: string) =>
                        ['restaurant', 'dining', 'café', 'cafe', 'buffet'].some(kw => a.toLowerCase().includes(kw))
                      );
                      const hasBreakfast = hotelAmenities.some((a: string) => a.toLowerCase().includes('breakfast'));

                      const nearbyRestaurants = Array.isArray(context.activities?.restaurant_options)
                        ? context.activities.restaurant_options.slice(0, 5)
                        : (Array.isArray(context.activities?.restaurants)
                          ? context.activities.restaurants.slice(0, 5).map((name: string) => ({ name }))
                          : []);

                      const hasDiningData = inHotelDining.length > 0 || hasRoomService || hasRestaurant || hasBreakfast || nearbyRestaurants.length > 0;
                      if (!hasDiningData) return null;

                      return (
                        <div className={`mt-3 rounded-xl border p-3 space-y-3 ${
                          isDark ? 'border-slate-800 bg-slate-900/30' : 'border-slate-200 bg-white'
                        }`}>
                          <p className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                            isDark ? 'text-slate-400' : 'text-slate-500'
                          }`}>
                            🍽️ Dining Options
                          </p>

                          {/* In-hotel Dining */}
                          {(inHotelDining.length > 0 || hasRoomService || hasRestaurant || hasBreakfast) && (
                            <div className="space-y-1.5">
                              <p className={`text-[9.5px] font-bold uppercase tracking-wide ${
                                isDark ? 'text-indigo-400' : 'text-indigo-600'
                              }`}>🏨 In-Hotel Dining ({selectedHotel?.name || 'Selected Hotel'})</p>
                              <div className="flex flex-wrap gap-1.5">
                                {hasRoomService && (
                                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                                    isDark ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                  }`}>
                                    🛎️ Room Service
                                  </span>
                                )}
                                {hasRestaurant && (
                                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                                    isDark ? 'bg-amber-950/30 border-amber-800/40 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700'
                                  }`}>
                                    🍴 On-Site Restaurant
                                  </span>
                                )}
                                {hasBreakfast && (
                                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                                    isDark ? 'bg-sky-950/30 border-sky-800/40 text-sky-400' : 'bg-sky-50 border-sky-200 text-sky-700'
                                  }`}>
                                    ☕ Breakfast Included
                                  </span>
                                )}
                                {inHotelDining.filter((a: string) => !['room service', 'restaurant', 'breakfast'].some(k => a.toLowerCase().includes(k))).map((amenity: string, i: number) => (
                                  <span key={i} className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${
                                    isDark ? 'bg-slate-950/40 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
                                  }`}>
                                    {amenity}
                                  </span>
                                ))}
                              </div>
                              {!hasRoomService && !hasRestaurant && !hasBreakfast && (
                                <p className={`text-[9.5px] italic ${
                                  isDark ? 'text-slate-500' : 'text-slate-400'
                                }`}>No in-hotel dining amenities listed — verify with hotel on check-in.</p>
                              )}
                            </div>
                          )}

                          {/* Nearby Restaurants */}
                          {nearbyRestaurants.length > 0 && (
                            <div className="space-y-1.5">
                              <p className={`text-[9.5px] font-bold uppercase tracking-wide ${
                                isDark ? 'text-amber-400' : 'text-amber-700'
                              }`}>📍 Nearby Restaurants</p>
                              <div className="flex flex-col gap-1">
                                {nearbyRestaurants.map((r: any, i: number) => (
                                  <a
                                    key={i}
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((r.name || r) + ' restaurant ' + (context.input?.destination || ''))}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex items-center justify-between p-1.5 rounded-lg border text-[10px] transition hover:shadow-sm ${
                                      isDark
                                        ? 'bg-slate-900/50 border-slate-850 hover:border-amber-700/30 text-slate-300 hover:text-white'
                                        : 'bg-slate-50 border-slate-200 hover:border-amber-300 text-slate-700'
                                    }`}
                                  >
                                    <span className="font-semibold line-clamp-1">{r.name || r}</span>
                                    <span className="flex items-center gap-1 shrink-0 ml-2">
                                      {r.rating && (
                                        <span className="text-amber-500 text-[9px] font-bold">★ {r.rating}</span>
                                      )}
                                      <ArrowUpRight className="h-3 w-3 text-slate-400 shrink-0" />
                                    </span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {context.transport && (
                <div className="premium-card rounded-xl p-4 space-y-2">
                  <h4 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1 ${
                    isDark ? 'text-indigo-400' : 'text-indigo-700'
                  }`}>
                    <Car className="h-4.5 w-4.5 text-emerald-450" /> Transit Specialist Agent
                  </h4>
                  <div className={`p-3 rounded-lg border text-xs space-y-3 transition-colors ${
                    isDark ? 'bg-indigo-955/20 border-slate-800' : 'bg-slate-50 border-slate-205'
                  }`}>
                    {Array.isArray(context.transport.options) && context.transport.options.length > 0 ? (
                      <div className="space-y-3">
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          ✈️ Transit Options & Comparisons
                        </p>
                        <div className="flex flex-col gap-2.5">
                          {context.transport.options.map((option: any, idx: number) => {
                            const optionsList = context.transport.options;
                            const cheapestOption = optionsList.reduce((lowest: any, curr: any) => curr.cost_inr < lowest.cost_inr ? curr : lowest, optionsList[0]);
                            const fastestOption = optionsList.reduce((fastest: any, curr: any) => curr.duration_hrs < fastest.duration_hrs ? curr : fastest, optionsList[0]);

                            const isCheapest = option.cost_inr === cheapestOption.cost_inr;
                            const isFastest = option.duration_hrs === fastestOption.duration_hrs;

                            const renderModeIcon = (mode: string) => {
                              const icStyle = "h-4 w-4 shrink-0 mt-0.5";
                              if (mode.toLowerCase() === 'flight') return <Send className={`${icStyle} text-sky-400`} />;
                              if (mode.toLowerCase() === 'train') return <Clock className={`${icStyle} text-teal-400`} />;
                              if (mode.toLowerCase() === 'transfer') return <Car className={`${icStyle} text-emerald-450`} />;
                              return <Car className={`${icStyle} text-amber-500`} />;
                            };

                            const getModeLabelPrefix = (mode: string) => {
                              if (mode.toLowerCase() === 'flight') return '🛫 Flight';
                              if (mode.toLowerCase() === 'train') return '🚆 Train';
                              if (mode.toLowerCase() === 'transfer') return '🚗 Private Transfer';
                              return '🚌 Intercity Bus';
                            };

                            const isSelected = context.transport.selected_option && 
                              context.transport.selected_option.operator === option.operator && 
                              context.transport.selected_option.mode === option.mode;
                            const isCurrentlyActive = isSelected || (!context.transport.selected_option && idx === 0);
                            const isLiveFlightSchedule = option.data_source === 'live_schedule_estimated_fare';
                            const isEstimatedFlight = option.data_source === 'estimated_fallback';

                            return (
                              <div
                                key={idx}
                                className={`p-3 rounded-xl border transition flex flex-col gap-2.5 ${
                                  isCurrentlyActive
                                    ? isDark
                                      ? 'bg-indigo-955/20 border-primary shadow-md shadow-primary/5'
                                      : 'bg-indigo-50/40 border-indigo-400 shadow-md shadow-indigo-100/30'
                                    : isDark
                                    ? 'bg-slate-900/40 border-slate-850 hover:border-slate-700'
                                    : 'bg-white border-slate-205 hover:border-slate-350'
                                }`}
                              >
                                <div className="flex justify-between items-start">
                                  <div className="flex items-start gap-2">
                                    {renderModeIcon(option.mode)}
                                    <div className="space-y-1">
                                      <div className="flex flex-wrap items-center gap-1.5 font-sans">
                                        <span className={`font-bold text-xs ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                                          {getModeLabelPrefix(option.mode)}: {option.operator}
                                        </span>

                                        {/* Badges */}
                                        {isCurrentlyActive && (
                                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-white leading-none flex items-center gap-0.5 animate-fadeIn">
                                            <Check className="h-2.5 w-2.5" /> Selected
                                          </span>
                                        )}
                                        {isCheapest && !isCurrentlyActive && (
                                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 leading-none">
                                            Cheapest
                                          </span>
                                        )}
                                        {isFastest && !isCurrentlyActive && (!isCheapest || optionsList.length > 1) && (
                                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 leading-none">
                                            Fastest
                                          </span>
                                        )}
                                        {option.mode?.toLowerCase() === 'flight' && isLiveFlightSchedule && (
                                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 leading-none">
                                            Live schedule
                                          </span>
                                        )}
                                        {option.mode?.toLowerCase() === 'flight' && isEstimatedFlight && (
                                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 leading-none">
                                            Estimated
                                          </span>
                                        )}
                                      </div>

                                      <div className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        Schedule: <span className="font-bold">{option.departure || 'N/A'}</span> ➔ <span className="font-bold">{option.arrival || 'N/A'}</span>
                                      </div>
                                      
                                      <div className={`text-[9.5px] ${isDark ? 'text-slate-400' : 'text-slate-505'}`}>
                                        Duration: <span className="font-bold">{option.duration_hrs} hrs</span>
                                      </div>
                                      {option.mode?.toLowerCase() === 'flight' && (
                                        <div className={`text-[9.5px] ${isDark ? 'text-slate-400' : 'text-slate-505'}`}>
                                          Source: <span className="font-bold">{isLiveFlightSchedule ? 'Live schedule + estimated fare' : 'Estimated fallback data'}</span>
                                        </div>
                                      )}
                                      {Array.isArray(option.amenities) && option.amenities.length > 0 && (
                                        <div className="flex flex-wrap gap-1 pt-1">
                                          {option.amenities.slice(0, 3).map((am: string, amIdx: number) => (
                                            <span key={amIdx} className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full border ${isDark ? 'bg-slate-950/40 border-slate-805 text-slate-405' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                              {am}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="text-right whitespace-nowrap">
                                    <p className="text-xs font-bold text-emerald-500">
                                      ₹{(option.cost_inr || 0).toLocaleString()}
                                    </p>
                                    <p className={`text-[9px] font-normal ${isDark ? 'text-slate-450' : 'text-slate-400'}`}>
                                      ₹{(option.cost_per_traveler || 0).toLocaleString()} each
                                    </p>
                                  </div>
                                </div>

                                {/* Choose Option Button */}
                                {!isCurrentlyActive && context.status !== 'CONFIRMED' && (
                                  <button
                                    type="button"
                                    disabled={selectTransportMutation.isPending || context.status === 'CONFIRMED'}
                                    onClick={() => handleSelectTransport(option.operator, option.mode)}
                                    className={`w-full py-1.5 rounded-lg text-xs font-bold border transition text-center flex items-center justify-center gap-1 cursor-pointer select-none ${
                                      isDark
                                        ? 'bg-indigo-950/40 hover:bg-primary/20 border-indigo-900/40 text-indigo-300 hover:text-white'
                                        : 'bg-indigo-50/50 hover:bg-primary/10 border-indigo-200 text-indigo-700 hover:text-indigo-805'
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                                  >
                                    {selectTransportMutation.isPending ? (
                                      <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Selecting Transit...
                                      </>
                                    ) : (
                                      'Choose Option'
                                    )}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <>
                        {context.transport.best_option && (
                          <p className={isDark ? 'text-slate-350' : 'text-slate-700'}>
                            🛫 **Best Option**: {context.transport.best_option}
                          </p>
                        )}
                        {context.transport.estimated_cost_inr && (
                          <p className={isDark ? 'text-emerald-400 font-semibold' : 'text-emerald-700 font-bold'}>
                            Estimated Price: ₹{(context.transport.estimated_cost_inr || 0).toLocaleString()}
                          </p>
                        )}
                      </>
                    )}

                    {context.transport.reasoning && (
                      <div className={`mt-2 p-2.5 rounded border text-[11px] leading-relaxed transition-colors ${
                        isDark ? 'text-indigo-305 bg-indigo-955/45 border-indigo-900/40' : 'text-indigo-900 bg-indigo-50 border-indigo-120/40'
                      }`}>
                        <div className="flex items-start gap-1">
                          <span className="text-[12px] shrink-0 mt-0.5">🧠</span>
                          <div className={`prose max-w-none text-[11px] space-y-1 ${
                            isDark ? 'prose-invert text-indigo-305' : 'text-indigo-900 prose-slate'
                          }`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{context.transport.reasoning}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {context.activities && (
                <div className="premium-card rounded-xl p-4 space-y-2">
                  <h4 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1 ${
                    isDark ? 'text-indigo-400' : 'text-indigo-700'
                  }`}>
                    <MapPin className="h-4.5 w-4.5 text-primary" /> Sightseeing Specialist Agent
                  </h4>
                  <div className={`p-3 rounded-lg border text-xs space-y-3.5 transition-colors ${
                    isDark ? 'bg-indigo-955/20 border-slate-800' : 'bg-slate-50 border-slate-205'
                  }`}>
                    <p className={`font-medium ${isDark ? 'text-slate-350' : 'text-slate-700'}`}>🗺️ **Matched Interests**: {(context.input.interests || []).join(', ') || 'General Sightseeing'}</p>
                    
                    {context.activities.reasoning && (
                      <div className={`mt-2 p-2.5 rounded border text-[11px] leading-relaxed transition-colors ${
                        isDark ? 'text-indigo-305 bg-indigo-955/45 border-indigo-900/40' : 'text-indigo-900 bg-indigo-50 border-indigo-120/40'
                      }`}>
                        <div className="flex items-start gap-1">
                          <span className="text-[12px] shrink-0 mt-0.5">🧠</span>
                          <div className={`prose max-w-none text-[11px] space-y-1 ${
                            isDark ? 'prose-invert text-indigo-305' : 'text-indigo-900 prose-slate'
                          }`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{context.activities.reasoning}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Rich Attraction Cards Grid */}
                    {Array.isArray(context.activities.attraction_options) && context.activities.attraction_options.length > 0 && (
                      <div className="space-y-3 pt-2">
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          📍 Core Sightseeing Destinations
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          {context.activities.attraction_options.map((item: any, idx: number) => {
                            const ratingValue = Math.min(5, Math.max(0, item.rating || 0));
                            const stars = Array.from({ length: 5 }, (_, i) => i < Math.round(ratingValue));
                            
                            // Build direct search query for Google Maps using name and destination
                            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name + ' ' + (context.input?.destination || ''))}${item.place_id ? `&query_place_id=${item.place_id}` : ''}`;
                            
                                                        // Image source: Proxy server endpoint or fallback Unsplash URL
                            const fallbackImages = [
                              'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=650&q=80',
                              'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=650&q=80',
                              'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=650&q=80',
                              'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=650&q=80',
                              'https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=650&q=80',
                              'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=650&q=80',
                              'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=650&q=80',
                              'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=650&q=80',
                              'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?auto=format&fit=crop&w=650&q=80',
                              'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=650&q=80'
                            ];
                            const imgSrc = item.photo_reference
                              ? (item.photo_reference.startsWith('http')
                                ? item.photo_reference
                                : `/api/trips/place-photo?photo_reference=${item.photo_reference}`)
                              : fallbackImages[idx % fallbackImages.length];
                            return (
                              <div
                                key={idx}
                                className={`group p-2.5 rounded-xl border transition-all flex flex-col gap-2 relative overflow-hidden ${
                                  item.is_llm_recommended
                                    ? isDark
                                      ? 'bg-amber-950/10 border-amber-800/30 hover:border-amber-600/50 hover:shadow-md cursor-pointer'
                                      : 'bg-amber-50/40 border-amber-200 hover:border-amber-400/60 hover:shadow-md cursor-pointer'
                                    : isDark
                                      ? 'bg-slate-900/60 border-slate-850 hover:bg-slate-900/80 hover:border-slate-700 hover:shadow-lg'
                                      : 'bg-white border-slate-205 hover:border-slate-350 hover:shadow-lg'
                                }`}
                                onClick={() => {
                                  if (item.is_llm_recommended) {
                                    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name + ' ' + (context.input?.destination || ''))}`, '_blank');
                                  }
                                }}
                              >
                                {/* Image Container */}
                                <div className="h-28 w-full relative rounded-lg overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-950">
                                  <img
                                    src={imgSrc}
                                    alt={item.name}
                                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                                        onError={(e) => {
                                      e.currentTarget.src = fallbackImages[idx % fallbackImages.length];
                                    }}                                  />
                                  <div className="absolute top-2 right-2 flex items-center gap-1">
                                    <a
                                      href={item.is_llm_recommended
                                        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name + ' ' + (context.input?.destination || ''))}`
                                        : mapsUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={item.is_llm_recommended ? 'Search on Google Maps' : 'Open in Google Maps'}
                                      className={`h-7 w-7 rounded-full flex items-center justify-center shadow-lg transition active:scale-90 scale-95 hover:scale-105 ${
                                        isDark
                                          ? 'bg-slate-955 text-indigo-400 hover:bg-primary/20 hover:text-white border border-slate-805'
                                          : 'bg-white text-indigo-700 hover:bg-primary hover:text-white border border-slate-205'
                                      }`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <ArrowUpRight className="h-4 w-4" />
                                    </a>
                                  </div>
                                </div>

                                {/* Content Details */}
                                <div className="flex flex-col flex-1 justify-between gap-1 px-0.5">
                                  <div>
                                    <h5 className={`font-bold text-[11.5px] leading-tight line-clamp-1 group-hover:text-primary transition-colors ${isDark ? 'text-slate-100' : 'text-slate-900'}`} title={item.name}>
                                      {item.name}
                                    </h5>
                                                                        {item.vicinity && (
                                      <p className={`text-[9.5px] line-clamp-1 mt-0.5 flex items-center gap-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                        <MapPin className="h-2.5 w-2.5 shrink-0" />
                                        {item.vicinity}
                                      </p>
                                    )}
                                    {item.description && (
                                      <p className={`text-[10px] leading-snug line-clamp-2 mt-1 italic ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                        "{item.description}"
                                      </p>
                                    )}                                  </div>

                                  <div className="flex items-center justify-between gap-1.5 mt-1 pt-1 border-t border-slate-150/10 dark:border-slate-800">
                                    {/* Star Rating */}
                                    <div className="flex items-center gap-0.5">
                                      <span className="flex text-amber-500 text-[8.5px]">
                                        {stars.map((filled, sIdx) => (
                                          <span key={sIdx}>{filled ? '★' : '☆'}</span>
                                        ))}
                                      </span>
                                      <span className={`text-[9px] font-bold ml-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {ratingValue.toFixed(1)}
                                      </span>
                                    </div>
                                    
                                    {/* Reviews Count */}
                                    {item.user_ratings_total !== undefined && item.user_ratings_total > 0 && (
                                      <span className={`text-[8.5px] font-semibold font-mono ${isDark ? 'text-slate-500' : 'text-slate-455'}`}>
                                        ({item.user_ratings_total.toLocaleString()} reviews)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {context.local_transport && (
                <div className="premium-card rounded-xl p-4 space-y-2">
                  <h4 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1 ${
                    isDark ? 'text-indigo-400' : 'text-indigo-700'
                  }`}>
                    <Navigation className="h-4.5 w-4.5 text-primary animate-pulse" /> Local Logistics & Distances
                  </h4>
                  <div className={`p-3 rounded-lg border text-xs space-y-3.5 transition-colors ${
                    isDark ? 'bg-indigo-955/20 border-slate-800' : 'bg-slate-50 border-slate-205'
                  }`}>
                    
                    {/* Distance from hotel to attractions */}
                    {Array.isArray(context.local_transport.distances_from_hotel) && context.local_transport.distances_from_hotel.length > 0 && (
                      <div className="space-y-2">
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          🛣️ Hotel to Attraction Distances (Estimated)
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {context.local_transport.distances_from_hotel.map((item: any, idx: number) => (
                            <div key={idx} className={`p-2 rounded-lg border flex flex-col justify-between ${isDark ? 'bg-slate-900/60 border-slate-850' : 'bg-white border-slate-205'}`}>
                              <span className={`font-bold text-[10.5px] line-clamp-1 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{item.attraction}</span>
                              <div className="flex justify-between items-center mt-1 pt-1 border-t border-slate-100/5 dark:border-slate-805">
                                <span className={`text-[9.5px] ${isDark ? 'text-slate-450' : 'text-slate-500'}`}>Distance:</span>
                                <span className="text-[10px] font-bold text-primary">{item.distance_text || `${item.distance_km} km`}</span>
                              </div>
                              {item.duration_text && (
                                <div className="flex justify-between items-center text-[9.5px] text-slate-500 mt-0.5">
                                  <span>Travel Time:</span>
                                  <span>{item.duration_text}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Mode Estimates */}
                    {Array.isArray(context.local_transport.cab_estimates) && context.local_transport.cab_estimates.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-slate-150/10 dark:border-slate-800">
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          🛺 Multimodal Local Transport Pricing (Per Km)
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {context.local_transport.cab_estimates.map((est: any, idx: number) => {
                            const renderLocalModeIcon = (mode: string) => {
                              const size = "h-3.5 w-3.5";
                              if (mode.toLowerCase().includes('cab') || mode.toLowerCase().includes('taxi')) return <Car className={`${size} text-sky-400`} />;
                              if (mode.toLowerCase().includes('auto')) return <Navigation className={`${size} text-amber-500`} />;
                              if (mode.toLowerCase().includes('bike') || mode.toLowerCase().includes('motorcycle')) return <Sparkles className={`${size} text-emerald-450`} />;
                              return <Navigation className={`${size} text-purple-400`} />;
                            };
                            return (
                              <div key={idx} className={`p-2 rounded-lg border text-center flex flex-col items-center justify-between gap-1 ${isDark ? 'bg-slate-900/60 border-slate-850' : 'bg-white border-slate-205'}`}>
                                <div className="p-1 rounded-full bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
                                  {renderLocalModeIcon(est.mode)}
                                </div>
                                <span className={`font-bold text-[9.5px] line-clamp-1 block ${isDark ? 'text-slate-350' : 'text-slate-655'}`}>{est.mode}</span>
                                <div className="text-[10px] font-bold text-emerald-500 mt-1">₹{est.rate_per_km}/km</div>
                                <span className={`text-[8.5px] ${isDark ? 'text-slate-500' : 'text-slate-455'}`}>Base: ₹{est.base_fare}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Daily Heuristics */}
                    {context.local_transport.daily_budget_estimate && (
                      <div className={`mt-2 p-2.5 rounded border flex items-center justify-between text-[11px] leading-relaxed transition-colors ${
                        isDark ? 'text-indigo-305 bg-indigo-955/45 border-indigo-900/40' : 'text-indigo-900 bg-indigo-50 border-indigo-120/40'
                      }`}>
                        <div className="flex items-center gap-1.5 justify-between w-full">
                          <span className="font-semibold flex items-center gap-1">🗺️ Estimated Local Transport Cost per day:</span>
                          <span className="font-bold text-emerald-500 text-xs">₹{context.local_transport.daily_budget_estimate.toLocaleString()} / day</span>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              )}
            </div>
          ) : (
            /* TAB 2: INTERACTIVE TIME LINE ITINERARY */
            <div className="space-y-6">
              {!context.itinerary?.days ? (
                <div className="text-center py-16 text-slate-500 space-y-3">
                  <CalendarCheck className="h-10 w-10 mx-auto text-slate-700 animate-pulse" />
                  <p className="text-sm font-semibold">Itinerary Not Generated Yet</p>
                  <p className="text-xs px-6 text-slate-655 font-normal">
                    Complete all parameter slot details in the chat and run full plan generation.
                  </p>
                </div>
              ) : (
                <div className={`space-y-6 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 ${
                  isDark ? 'before:bg-indigo-950' : 'before:bg-indigo-100'
                }`}>
                  {context.itinerary.days.map((dayItem: any, idx: number) => {
                    const isDayExpanded = expandedDays[dayItem.day] === undefined ? dayItem.day === 1 : expandedDays[dayItem.day];
                    const hotelName = context.accommodation?.recommended || context.accommodation?.selected_hotel?.name || 'Self Arranged';
                    return (
                      <div key={idx} className="relative pl-8 space-y-3">
                        {/* Node point */}
                        <span className={`absolute left-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary border-4 ${
                          isDark ? 'border-slate-900' : 'border-white shadow-sm'
                        }`} />

                        <div className="premium-card rounded-xl p-4 space-y-2.5">
                          <div
                            onClick={() => toggleDay(dayItem.day)}
                            className="flex justify-between items-start cursor-pointer group select-none"
                          >
                            <div>
                              <span className="text-[10px] font-bold text-primary uppercase tracking-widest block mb-0.5">
                                Day {dayItem.day} – {dayItem.date || ''}
                              </span>
                              <h4 className={`text-sm font-bold transition flex items-center gap-1.5 ${
                                isDark ? 'text-slate-100 group-hover:text-primary' : 'text-slate-800 group-hover:text-indigo-650'
                              }`}>
                                {dayItem.title || 'Sightseeing'}
                                {isDayExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-slate-405 shrink-0" />
                                )}
                              </h4>
                            </div>
                            {dayItem.daily_total_inr > 0 && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded leading-none border transition-colors ${
                                isDark ? 'bg-slate-900 border-slate-800 text-emerald-450' : 'bg-emerald-50 border-emerald-100/50 text-emerald-700'
                              }`}>
                                ₹{dayItem.daily_total_inr.toLocaleString()}
                              </span>
                            )}
                          </div>

                          {isDayExpanded && (
                            <div className="space-y-3 pt-2.5 border-t border-card-border/40 animate-fadeIn">
                              {dayItem.description && (
                                <div className={`text-[11px] px-2.5 py-1.5 rounded border transition-colors ${
                                  isDark ? 'text-slate-300 bg-slate-900/40 border-slate-800' : 'text-slate-700 bg-slate-50 border-slate-100'
                                }`}>
                                  📝 <strong>Summary:</strong> {dayItem.description}
                                </div>
                              )}
                              {dayItem.weather_note && (
                                <div className={`text-[11px] px-2.5 py-1.5 rounded border italic transition-colors ${
                                  isDark ? 'text-slate-400 bg-indigo-955/20 border-indigo-900/10' : 'text-slate-655 bg-indigo-50/50 border-indigo-120/40'
                                }`}>
                                  ⛅ {dayItem.weather_note}
                                </div>
                              )}

                              {/* Activities list */}
                              {((dayItem.schedule && dayItem.schedule.length > 0) || (hotelName && hotelName !== 'Self Arranged' && hotelName !== 'Hotel')) ? (
                                <div className="space-y-4">
                                  {/* Stay hotel node if selected */}
                                  {hotelName && hotelName !== 'Self Arranged' && hotelName !== 'Hotel' && (
                                    <div className={`group relative pl-6 pb-4 border-l ${
                                      isDark ? 'border-slate-800' : 'border-slate-200'
                                    }`}>
                                      {/* Activity dot indicator */}
                                      <span className={`absolute -left-1.5 top-1.5 h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center transition-colors bg-white ${
                                        isDark 
                                          ? 'bg-slate-950 border-indigo-500 group-hover:border-emerald-500' 
                                          : 'border-primary group-hover:border-emerald-600'
                                      }`} />

                                      <div className={`rounded-xl p-3.5 border transition ${
                                        isDark 
                                          ? 'bg-slate-900/40 border-slate-800 hover:border-slate-700' 
                                          : 'bg-white border-slate-200 hover:border-slate-300'
                                      }`}>
                                        <div className="flex items-center justify-between mb-1.5">
                                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded flex items-center gap-1 leading-none ${
                                            isDark ? 'bg-slate-850 text-indigo-300' : 'bg-indigo-50 text-indigo-700'
                                          }`}>
                                            🏨 Accommodation Base
                                          </span>
                                        </div>
                                        <h5 className={`text-xs font-semibold leading-normal ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                          Base Stay at{' '}
                                          <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hotelName + ' ' + (context.input?.destination || ''))}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title={`Search "${hotelName}" on Google Maps`}
                                            className={`font-bold underline inline-flex items-center gap-0.5 hover:text-indigo-500 transition-colors ${
                                              isDark ? 'text-indigo-400' : 'text-indigo-650'
                                              }`}
                                            >
                                              {hotelName}
                                              <ArrowUpRight className="h-3.5 w-3.5 text-indigo-400" />
                                            </a>
                                          </h5>
                                          <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-550'} mt-1`}>
                                            Daily transit rides and round-trip distances are calculated relative to this hotel.
                                          </p>
                                        </div>
                                      </div>
                                    )}
  
                                    {dayItem.schedule && dayItem.schedule.map((action: any, aIdx: number) => {
                                    const actionText = String(action.activity || '').toLowerCase();
                                    const isRecommendation = actionText.includes('recommended');
                                    const badges = [
                                      isRecommendation ? 'Recommended' : '',
                                      actionText.includes('check-in') || actionText.includes('hotel') ? 'Stay' : '',
                                      actionText.includes('lunch') || actionText.includes('dinner') || actionText.includes('breakfast') ? 'Meal' : '',
                                      actionText.includes('visit') || actionText.includes('explore') || actionText.includes('sightseeing') ? 'Sightseeing' : '',
                                      action.transport_note ? 'Transit' : '',
                                    ].filter(Boolean);

                                    const formattedTime = formatTimeAndPeriod(action.time) || action.time;
                                    const placeQuery = action.location || action.activity;
                                    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeQuery + ' ' + (context.input?.destination || ''))}`;

                                    return (
                                      <div
                                        key={aIdx}
                                        className={`group relative pl-6 pb-5 last:pb-0 border-l last:border-l-0 ${
                                          isDark ? 'border-slate-800' : 'border-slate-200'
                                        }`}
                                      >
                                        {/* Activity dot indicator */}
                                        <span className={`absolute -left-1.5 top-1.5 h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                          isDark 
                                            ? 'bg-slate-950 border-indigo-500 group-hover:border-emerald-500' 
                                            : 'bg-white border-primary group-hover:border-emerald-600'
                                        }`} />

                                        <div className={`rounded-xl p-3.5 border transition ${
                                          isDark 
                                            ? 'bg-slate-900/40 border-slate-800 hover:border-slate-700' 
                                            : 'bg-white border-slate-200 hover:border-slate-300'
                                        }`}>
                                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                                                isDark ? 'bg-slate-850 text-indigo-300' : 'bg-indigo-50 text-indigo-700'
                                              }`}>
                                                <Clock className="h-3 w-3" />
                                                {formattedTime}
                                              </span>
                                              {action.duration_min && (
                                                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                                                  isDark ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                  ⏱️ {action.duration_min} mins
                                                </span>
                                              )}
                                              {action.travel_cost_inr > 0 && (
                                                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded ${
                                                  isDark ? 'bg-emerald-950/30 text-emerald-450 border border-emerald-900/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                                }`}>
                                                  🚗 Commute: ₹{action.travel_cost_inr}
                                                </span>
                                              )}
                                              {action.cost_inr > 0 && (
                                                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded ${
                                                  isDark ? 'bg-blue-950/30 text-blue-400 border border-blue-900/30' : 'bg-blue-50 text-blue-700 border border-blue-100'
                                                }`}>
                                                  🎟️ Entry: ₹{action.cost_inr}
                                                </span>
                                              )}
                                            </div>

                                            {/* Action tags badges */}
                                            <div className="flex gap-1">
                                              {badges.map((badge, badgeIdx) => (
                                                <span
                                                  key={badgeIdx}
                                                  className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border ${
                                                    badge === 'Recommended'
                                                      ? isDark
                                                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                                        : 'bg-amber-50 border-amber-200 text-amber-700'
                                                      : isDark
                                                        ? 'bg-slate-950 border-slate-800 text-slate-400'
                                                        : 'bg-white border-slate-205 text-slate-500'
                                                  }`}
                                                >
                                                  {badge}
                                                </span>
                                              ))}
                                            </div>
                                          </div>

                                          {/* Activity & Clickable Place Title */}
                                          <div className="space-y-1.5">
                                            <h5 className={`text-xs font-semibold leading-normal ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                              {action.activity}
                                              {action.location && (
                                                <span className="font-normal text-slate-400">
                                                  {" at "}
                                                  <a
                                                    href={mapsUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title={`Search "${action.location}" on Google Maps`}
                                                    className={`font-semibold underline inline-flex items-center gap-0.5 hover:text-indigo-500 transition-colors ${
                                                      isDark ? 'text-indigo-400' : 'text-indigo-650'
                                                    }`}
                                                  >
                                                    {action.location}
                                                    <ArrowUpRight className="h-3.5 w-3.5 text-indigo-400" />
                                                  </a>
                                                </span>
                                              )}
                                            </h5>

                                            {/* Getting there transit note */}
                                            {action.transport_note && (
                                              <p className={`text-[11px] flex gap-1 items-start ${
                                                isDark ? 'text-slate-400' : 'text-slate-655'
                                              }`}>
                                                <span className="shrink-0">🚏</span>
                                                <span className="italic">{action.transport_note}</span>
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
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
                      <span className={`absolute left-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-4 ${
                        isDark ? 'bg-slate-800 border-slate-900' : 'bg-slate-300 border-white shadow-sm'
                      }`} />
                      <div className={`border p-4 rounded-xl space-y-2 text-xs transition-colors ${
                        isDark ? 'bg-slate-950/50 border-slate-850' : 'bg-slate-50 border-slate-205'
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
            <div className={`p-4 border-t backdrop-blur-sm space-y-3 shrink-0 ${isDark ? 'border-card-border bg-slate-900/40' : 'border-slate-200 bg-white/90'}`}>
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
                  className="flex items-center gap-1 px-3 py-2 rounded-lg bg-accent-teal hover:bg-emerald-600 text-xs font-bold text-white transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                  Approve & Confirm
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
    </div>
  );
}













