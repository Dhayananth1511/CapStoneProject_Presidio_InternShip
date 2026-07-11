import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Search,
  Calendar,
  CalendarCheck,
  ArrowRight,
  Plane,
  Shield,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

interface Step {
  id: number;
  title: string;
  shortDesc: string;
  detailedDesc: string;
  icon: any;
  badge: string;
  color: string;
  screenshotMock: React.ReactNode;
}

export default function HomePage() {
  const [activeStep, setActiveStep] = useState(1);

  // Auto transition steps every 6 seconds to show dynamic progress
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev % 4) + 1);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const steps: Step[] = [
    {
      id: 1,
      badge: 'Step 1',
      title: 'Chat Naturally',
      shortDesc: 'Tell the AI where you want to go, when, and your budget limit.',
      detailedDesc:
        'Just type your ideas like: "4 days in Ooty with 2 friends next weekend, budget 25k." Our Assistant Coordinator reads it and extracts dates, destination, traveler count, and cost caps automatically.',
      icon: MessageSquare,
      color: 'from-blue-500/20 to-indigo-500/20 border-indigo-500/30 text-blue-400',
      screenshotMock: (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs font-mono space-y-3">
          <div className="flex gap-2">
            <span className="text-primary font-bold">You:</span>
            <span className="text-slate-200">Wanna go to Ooty next week for 3 days. Budget is 20,000 INR. 2 travelers.</span>
          </div>
          <div className="flex gap-2 border-t border-slate-950 pt-2 text-[11px]">
            <span className="text-indigo-400 font-bold">VoyageFlow AI:</span>
            <span className="text-slate-400">Understood! Extracting details: Destination: Ooty, Budget: ₹20,000, Travelers: 2, Duration: 3 days. Running options search...</span>
          </div>
        </div>
      ),
    },
    {
      id: 2,
      badge: 'Step 2',
      title: 'AI Planners Do the Research',
      shortDesc: 'Our specialized digital assistants look up live info concurrently.',
      detailedDesc:
        'Four dedicated AI planners spin up: the Weather Assistant checks target climates, the Transit Assistant calculates travel options (flight/train/road fares), the Hotel Assistant searches matching stays, and the Budget Assistant sums up the cost.',
      icon: Search,
      color: 'from-amber-500/20 to-orange-500/20 border-amber-500/30 text-amber-400',
      screenshotMock: (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs space-y-2">
          <div className="flex justify-between items-center text-[10px] text-slate-500 border-b border-slate-950 pb-1.5 font-mono">
            <span>RUNNING PLANNING ASSISTANTS</span>
            <span className="text-emerald-450 animate-pulse">● ACTIVE</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="bg-slate-950 p-2 rounded border border-slate-900">
              <span className="text-amber-400 font-semibold block">☀️ Weather Assistant</span>
              <span className="text-slate-400">Ooty: 19°C, pleasant breeze.</span>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-900">
              <span className="text-indigo-400 font-semibold block">🛫 Transit Assistant</span>
              <span className="text-slate-400">Road routes: ₹3,200 total gas.</span>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-900">
              <span className="text-emerald-400 font-semibold block">🏨 Lodging Assistant</span>
              <span className="text-slate-400">Ooty Inn: ₹4,500 / night.</span>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-900">
              <span className="text-rose-400 font-semibold block">⚖️ Budget Guardian</span>
              <span className="text-slate-455">Est ₹16,700 of ₹20,000 caps.</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 3,
      badge: 'Step 3',
      title: 'Review Day-by-Day Options',
      shortDesc: 'Inspect schedules, budget feasibility, and activities details.',
      detailedDesc:
        'Read your interactive day-by-day plan. Each day shows weather summaries, sightseeing timetables, and hotel locations. Don’t like something? Simply reply with adjustments, like "Find cheaper hotels" or "Add a boat tour to Day 2."',
      icon: Calendar,
      color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-400',
      screenshotMock: (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs space-y-3">
          <div className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-900">
            <div>
              <span className="text-[10px] text-primary font-bold block">DAY 1 - SIGHTSEEING</span>
              <span className="text-slate-200 font-medium">Ooty Lake & Botanical Gardens</span>
            </div>
            <span className="bg-slate-900 border border-slate-850 px-2 py-0.5 rounded text-[10px] text-emerald-450 font-mono">₹1,200</span>
          </div>
          <div className="pl-3 border-l-2 border-primary space-y-1.5 text-[11px] text-slate-440">
            <p>• 10:00 AM – Relaxing boat ride at Ooty Lake (2 hrs)</p>
            <p>• 02:00 PM – Stroll down the Rose Garden pathways (1.5 hrs)</p>
          </div>
        </div>
      ),
    },
    {
      id: 4,
      badge: 'Step 4',
      title: 'Confirm & Auto-Sync Calendar',
      shortDesc: 'Lock in credentials, get booking codes, and write events directly.',
      detailedDesc:
        'Once you click "Confirm Plan", VoyageFlow registers your hotel reservation codes, transit keys, and automatically syncs the entire itinerary directly to your Google Calendar so it is ready on your phone.',
      icon: CalendarCheck,
      color: 'from-purple-500/20 to-pink-500/20 border-purple-500/30 text-purple-400',
      screenshotMock: (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
            <CalendarCheck className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="space-y-1">
            <span className="font-bold text-white block">Trip Confirmed Successfully!</span>
            <p className="text-[11px] text-slate-400">Google Calendar Synced: 3 Events Created</p>
          </div>
          <div className="bg-slate-950 font-mono p-2 rounded text-[10px] text-slate-550 border border-slate-900">
            🏨 Hotel Ref: WH-8271A | 🚗 Cab Ref: TR-22B1
          </div>
        </div>
      ),
    },
  ];

  const currentStep = steps.find((s) => s.id === activeStep) || steps[0];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-dark-bg text-slate-100 flex flex-col justify-start relative overflow-hidden font-sans select-none">
      
      {/* Visual background neon light spheres */}
      <div className="absolute top-24 left-1/4 w-[380px] h-[380px] rounded-full bg-primary/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-24 right-1/4 w-[420px] h-[420px] rounded-full bg-indigo-500/10 blur-[140px] pointer-events-none" />

      {/* Main Grid Portal Container */}
      <div className="max-w-7xl mx-auto w-full px-6 py-12 lg:py-20 flex-1 flex flex-col justify-center space-y-16 relative z-10">
        
        {/* Banner Headers */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* LEFT: TITLE & CALL-TO-ACTIONS */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
              <span>Smart Travel Planning, Made Easy</span>
            </div>
            
            <h1 className="text-4.5xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
              A Personal AI Assistant to Plan Your{' '}
              <span className="bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
                Dream Vacation
              </span>
            </h1>
            
            <p className="text-base sm:text-lg text-slate-400 max-w-xl leading-relaxed">
              Tell us where you want to go in simple text. Our AI assistants look up weather forecast reports, check transport options, map out hotels under your budget limit, and plan a custom day-by-day plan instantly.
            </p>

            {/* Entry Workspace Portals */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-4 max-w-2xl">
              {/* Traveler Card */}
              <div className="premium-card rounded-2xl p-5 border border-slate-800/80 hover:border-primary/45 transition-all duration-300 group flex flex-col justify-between shadow-lg hover:shadow-primary/5 bg-slate-900/40 backdrop-blur-sm">
                <div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary mb-4 group-hover:scale-105 transition-transform duration-300">
                    <Plane className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-1.5">
                    Plan a New Trip
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-6">
                    Chat with VoyageFlow assistant, review day schedules, inspect hotel prices, and auto-sync itineraries.
                  </p>
                </div>
                <Link
                  to="/login?role=traveler"
                  className="inline-flex items-center justify-center gap-2 w-full bg-primary hover:bg-opacity-95 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition active:scale-98 cursor-pointer shadow-lg shadow-primary/20"
                >
                  Start Planning Now <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              {/* Admin Card */}
              <div className="premium-card rounded-2xl p-5 border border-slate-800/80 hover:border-indigo-400/45 transition-all duration-300 group flex flex-col justify-between shadow-lg hover:shadow-indigo-500/5 bg-slate-900/40 backdrop-blur-sm">
                <div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-405 mb-4 group-hover:scale-105 transition-transform duration-300">
                    <Shield className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-1.5">
                    Admin Dashboard
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-6">
                    Analyze trip statistics, view user metrics charts, monitor API costs, and inspect debug agent log details.
                  </p>
                </div>
                <Link
                  to="/login?role=admin"
                  className="inline-flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-slate-205 border border-slate-700 hover:border-slate-600 font-bold py-2.5 px-4 rounded-xl text-xs transition active:scale-98 cursor-pointer"
                >
                  Admin Console Control <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>

          {/* RIGHT: INTERACTIVE STEP GRAPHIC EXHIBIT */}
          <div className="lg:col-span-5 flex flex-col justify-center items-center">
            <div className="w-full max-w-md premium-card rounded-3xl p-6 relative overflow-hidden shadow-2xl space-y-4 bg-slate-900/30 border border-slate-850 backdrop-blur-md">
              <span className="text-[10px] font-bold text-primary tracking-widest uppercase block border-b border-card-border/60 pb-3 text-center">
                💻 HOW VOYAGEFLOW PLANNER WORKS
              </span>

              {/* Live Preview Display Pane */}
              <div className="p-4 bg-slate-950/40 rounded-2xl border border-slate-900 flex flex-col justify-center min-h-[160px] transition-all duration-300">
                {currentStep.screenshotMock}
              </div>

              {/* Step indicator bar */}
              <div className="flex items-center justify-between pt-2">
                <span className="bg-slate-950 font-mono text-[10px] text-slate-500 border border-slate-900 rounded px-2.5 py-1">
                  💻 PREVIEWING STEP {currentStep.id} OF 4
                </span>
                
                <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest">
                  {currentStep.badge}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* INTERACTIVE 4-STEP TIMELINE LIST */}
        <div className="space-y-6 pt-6">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="text-2xl font-bold text-white">How It Works in 4 Simple Steps</h2>
            <p className="text-xs text-slate-455 mt-1.5 leading-relaxed">
              No complex planning sheets or endless browser tabs. VoyageFlow structures everything in simple travel phases.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4">
            {steps.map((step) => {
              const StepIcon = step.icon;
              const isActive = activeStep === step.id;

              return (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(step.id)}
                  className={`premium-card rounded-2xl p-5 border text-left flex flex-col justify-between h-48 transition-all duration-350 cursor-pointer ${
                    isActive
                      ? 'border-primary bg-primary/10 shadow-lg text-white scale-102 ring-1 ring-primary/20'
                      : 'border-slate-800/80 bg-slate-900/25 hover:border-slate-705 text-slate-400'
                  }`}
                >
                  <div className="flex justify-between items-start w-full">
                    <div className={`p-2.5 rounded-xl border ${
                      isActive ? 'bg-primary/25 border-primary/40 text-primary' : 'bg-slate-900 border-slate-800'
                    }`}>
                      <StepIcon className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest font-mono text-slate-500">
                      Step {step.id}
                    </span>
                  </div>

                  <div className="space-y-1 mt-4">
                    <h4 className="text-sm font-bold text-slate-100 flex items-center justify-between">
                      {step.title}
                      {isActive && <ChevronRight className="h-4 w-4 text-primary animate-pulse" />}
                    </h4>
                    <p className={`text-xs leading-relaxed ${isActive ? 'text-slate-300' : 'text-slate-455'}`}>
                      {step.shortDesc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ACTIVE STEP DETAILED PARAGRAPH INFO */}
          <div className="p-5 rounded-2xl bg-slate-900/30 border border-slate-850/80 font-sans max-w-4xl mx-auto mt-4 text-center">
            <p className="text-xs text-slate-400 leading-relaxed max-w-2xl mx-auto">
              💡 <strong className="text-slate-202">{currentStep.title} Details:</strong> {currentStep.detailedDesc}
            </p>
          </div>
        </div>

        {/* High level trust badges */}
        <div className="border-t border-slate-805 pt-8 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto w-full text-center">
          <div className="space-y-1 font-sans">
            <span className="text-[11px] font-bold tracking-widest text-[#7a80b0] uppercase">⚡ Easy Chat</span>
            <p className="text-[11px] font-semibold text-slate-400">Describe your travel ideas in natural text</p>
          </div>
          <div className="space-y-1 font-sans">
            <span className="text-[11px] font-bold tracking-widest text-[#7a80b0] uppercase">⚖️ Safe Stays</span>
            <p className="text-[11px] font-semibold text-slate-400">Automatic hotel and flight cap compliance</p>
          </div>
          <div className="space-y-1 font-sans">
            <span className="text-[11px] font-bold tracking-widest text-[#7a80b0] uppercase">⛅ Weather Checked</span>
            <p className="text-[11px] font-semibold text-slate-400">Weather alerts and forecast checks</p>
          </div>
          <div className="space-y-1 font-sans">
            <span className="text-[11px] font-bold tracking-widest text-[#7a80b0] uppercase">📅 Calendar Synced</span>
            <p className="text-[11px] font-semibold text-slate-400">Add schedule to your phone automatically</p>
          </div>
        </div>

      </div>
    </div>
  );
}
