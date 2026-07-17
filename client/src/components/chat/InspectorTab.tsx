import React from 'react';
import { Download, Check, Building2, BadgeCheck, KeyRound, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { HotelCard } from './HotelCard';
import { TransportOptionsCard } from './TransportOptionsCard';
import { AttractionCard } from './AttractionCard';
import { CheckedParametersCard } from './CheckedParametersCard';
import { WeatherSpecialistCard } from './WeatherSpecialistCard';
import { DiningOptionsCard } from './DiningOptionsCard';
import { LocalTransitCard } from './LocalTransitCard';

interface InspectorTabProps {
  context: any;
  isDark: boolean;
  showBudgetBreakdown: boolean;
  setShowBudgetBreakdown: (show: boolean) => void;
  handleDownloadItinerary: () => void;
  lodgingCategoryTab: 'budget' | 'mid_range' | 'luxury';
  setLodgingCategoryTab: (tab: 'budget' | 'mid_range' | 'luxury') => void;
  hotelSaving: boolean;
  handleSelectHotel: (name: string, tier: string) => void;
  transportSaving: boolean;
  handleSelectTransport: (operator: string, mode: string) => void;
  handleAlternativeSelect: (suggestion: string) => void;
  bookingRefs?: { hotel?: string; transport?: string; calendar?: string } | null;
}

export const InspectorTab: React.FC<InspectorTabProps> = ({
  context,
  isDark,
  showBudgetBreakdown,
  setShowBudgetBreakdown,
  handleDownloadItinerary,
  lodgingCategoryTab,
  setLodgingCategoryTab,
  hotelSaving,
  handleSelectHotel,
  transportSaving,
  handleSelectTransport,
  handleAlternativeSelect,
  bookingRefs,
}) => {
  return (
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
            <Download className="h-3.5 w-3.5" /> Export PDF Itinerary
          </button>
        )}
      </div>

      {/* BOOKING CONFIRMED CARD — only visible when trip is CONFIRMED */}
      {context.status === 'CONFIRMED' && (
        <div className={`rounded-xl border p-4 space-y-3 animate-fadeIn ${
          isDark
            ? 'bg-emerald-950/20 border-emerald-800/40'
            : 'bg-emerald-50 border-emerald-200'
        }`}>
          <div className="flex items-center gap-2">
            <BadgeCheck className="h-5 w-5 text-emerald-500 shrink-0" />
            <h4 className={`text-xs font-bold uppercase tracking-widest ${
              isDark ? 'text-emerald-400' : 'text-emerald-700'
            }`}>
              Booking Confirmed
            </h4>
            {context.booking?.confirmed_at && (
              <span className={`ml-auto text-[10px] font-semibold ${
                isDark ? 'text-slate-500' : 'text-slate-400'
              }`}>
                {new Date(context.booking.confirmed_at).toLocaleDateString('en-IN', {
                  day: '2-digit', month: 'short', year: 'numeric'
                })}
              </span>
            )}
          </div>

          <div className={`rounded-lg border p-3 space-y-2 ${
            isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-emerald-100'
          }`}>
            <div className="flex items-center gap-2 text-xs">
              <KeyRound className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
              <span className={`font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Booking References</span>
            </div>
            <div className="space-y-1.5 pt-1">
              {/* Hotel Ref */}
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[10.5px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>🏨 Hotel</span>
                <code className={`text-[10.5px] font-bold px-2 py-0.5 rounded font-mono ${
                  isDark ? 'bg-slate-800 text-emerald-400' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {context.booking?.refs?.hotel || bookingRefs?.hotel || '—'}
                </code>
              </div>
              {/* Transport Ref */}
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[10.5px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>✈️ Transport</span>
                <code className={`text-[10.5px] font-bold px-2 py-0.5 rounded font-mono ${
                  isDark ? 'bg-slate-800 text-sky-400' : 'bg-sky-100 text-sky-800'
                }`}>
                  {context.booking?.refs?.transport || bookingRefs?.transport || '—'}
                </code>
              </div>
              {/* Calendar Event Ref */}
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[10.5px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>📅 Calendar Event</span>
                <code className={`text-[10.5px] font-bold px-2 py-0.5 rounded font-mono max-w-[55%] truncate ${
                  isDark ? 'bg-slate-800 text-indigo-400' : 'bg-indigo-100 text-indigo-800'
                }`} title={context.booking?.refs?.calendar || bookingRefs?.calendar || '—'}>
                  {(() => {
                    const cal = context.booking?.refs?.calendar || bookingRefs?.calendar;
                    if (!cal || cal === 'No calendar synced') return 'Pending Sync';
                    return cal;
                  })()}
                </code>
              </div>
            </div>
          </div>

          <p className={`text-[10px] leading-relaxed ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            This trip is now locked. You can export a PDF itinerary using the button above. Chat modifications are disabled.
          </p>
        </div>
      )}

            {/* CHECKED PARAMETERS CARD */}
      <CheckedParametersCard context={context} isDark={isDark} />
      {/* CORE BUDGET GUARDIAN SUMMARY */}
      {context.budget && (
        <div className="premium-card rounded-xl p-4 space-y-2">
          <div className="flex justify-between items-center">
            <h4 className={`text-xs font-bold uppercase tracking-widest ${
              isDark ? 'text-emerald-400' : 'text-emerald-700'
            }`}>
              ⚖️ Budget Guardian Agent
            </h4>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded leading-none border ${
              context.budget.is_feasible
                ? isDark
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                : isDark
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-red-50 border-red-100 text-red-700'
            }`}>
              {context.budget.is_feasible ? 'Feasible' : 'Exceeds Cap'}
            </span>
          </div>

          <div className={`p-3 rounded-lg border text-xs space-y-3 transition-colors ${
            isDark ? 'bg-indigo-950/20 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <span className={`text-[10px] uppercase font-bold block ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>ESTIMATED TOTAL</span>
                <span className="font-extrabold text-sm text-emerald-500">
                  ₹{(context.budget.total_cost_inr !== undefined ? context.budget.total_cost_inr : (context.budget.total_estimated_cost || 0)).toLocaleString()}
                </span>
              </div>
              <div>
                <span className={`text-[10px] uppercase font-bold block ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>BUDGET LIMIT CAP</span>
                <span className={`font-extrabold text-sm ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
                  ₹{(context.input?.budget_inr || 0).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => setShowBudgetBreakdown(!showBudgetBreakdown)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-bold transition select-none cursor-pointer ${
                  isDark
                    ? 'bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-indigo-300 hover:text-indigo-200'
                    : 'bg-slate-105 hover:bg-slate-200 border-slate-200 text-indigo-600 hover:text-indigo-700'
                }`}
              >
                <span className="flex items-center gap-1">
                  📊 {showBudgetBreakdown ? 'Hide Details' : 'View Cost Breakdown'}
                </span>
                {showBudgetBreakdown ? '▲' : '▼'}
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
                        <td className={`py-2 ${isDark ? 'text-slate-400' : 'text-slate-655'}`}>✈️ Transit</td>
                        <td className={`py-2 text-right ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          ₹{(context.budget.transport || 0).toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td className={`py-2 ${isDark ? 'text-slate-400' : 'text-slate-655'}`}>🏨 Lodging</td>
                        <td className={`py-2 text-right ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          ₹{(context.budget.accommodation || 0).toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td className={`py-2 ${isDark ? 'text-slate-400' : 'text-slate-655'}`}>🍜 Food & Dining</td>
                        <td className={`py-2 text-right ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          ₹{(context.budget.food || 0).toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td className={`py-2 ${isDark ? 'text-slate-400' : 'text-slate-655'}`}>🎟️ Sightseeing Entry</td>
                        <td className={`py-2 text-right ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          ₹{(context.budget.activities || 0).toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td className={`py-2 ${isDark ? 'text-slate-400' : 'text-slate-655'}`}>🛺 Local Cab Rides</td>
                        <td className={`py-2 text-right ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          ₹{(context.budget.local_transport || 0).toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td className={`py-2 ${isDark ? 'text-slate-400' : 'text-slate-655'}`}>🚨 Reserve Fund (10%)</td>
                        <td className={`py-2 text-right ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          ₹{(context.budget.emergency_fund || 0).toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Alternatives suggested by Budget Guardian */}
            {!context.budget.is_feasible && context.budget.alternatives && context.budget.alternatives.length > 0 && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-2 mt-2">
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
                          ? 'bg-slate-900 hover:bg-[#1a1230] text-indigo-305 hover:text-indigo-300 border-indigo-900/30'
                          : 'bg-white hover:bg-neutral-50 text-indigo-650 hover:text-indigo-705 border-indigo-200/50'
                      }`}
                    >
                      💸 {altOption}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
{/* DATA SOURCE INTELLIGENCE LEGEND */}
      {(context.accommodation || context.activities || context.weather) && (
        <div className={`rounded-xl p-3.5 space-y-2 border ${
          isDark
            ? 'bg-slate-900/50 border-slate-800'
            : 'bg-slate-50 border-slate-200'
        }`}>
          <p className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${
            isDark ? 'text-slate-500' : 'text-slate-400'
          }`}>
            🔍 Data Source Intelligence
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {/* Hotels */}
            {context.accommodation && (() => {
              const allHotels = [
                ...(context.accommodation.categories?.budget || []),
                ...(context.accommodation.categories?.mid_range || []),
                ...(context.accommodation.categories?.luxury || []),
                ...(context.accommodation.hotels || []),
              ];
              const hasHotelbeds = allHotels.some((h: any) => h.source_type === 'hotelbeds_api');
              const hasGeoapify = allHotels.some((h: any) => h.source_type === 'geoapify_places');
              const hasLLM = allHotels.some((h: any) => h.is_llm_recommended || h.source_type === 'llm_recommendation');
              return (
                <div className="flex flex-col gap-1">
                  <span className={`text-[9px] font-bold uppercase ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>🏨 Hotels</span>
                  <div className="flex gap-1 flex-wrap">
                    {hasHotelbeds && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 border border-blue-400/30 text-blue-600 dark:text-blue-400 leading-none uppercase tracking-wide">
                        🏨 Hotelbeds API
                      </span>
                    )}
                    {hasGeoapify && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-emerald-700 dark:text-emerald-400 leading-none uppercase tracking-wide">
                        🗺️ Geoapify Places
                      </span>
                    )}
                    {hasLLM && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-amber-700 dark:text-amber-400 leading-none uppercase tracking-wide">
                        💡 LLM Fallback
                      </span>
                    )}
                    {!hasHotelbeds && !hasGeoapify && !hasLLM && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-500 leading-none uppercase tracking-wide">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Attractions & Restaurants */}
            {context.activities && (() => {
              const attrSrc = (context.activities.attraction_options || []).some(
                (a: any) => a.source_type === 'geoapify_places'
              );
              const restSrc = (context.activities.restaurant_options || []).some(
                (r: any) => r.source_type === 'geoapify_places'
              );
              const attrLLM = (context.activities.attraction_options || []).some(
                (a: any) => a.source_type === 'llm_recommendation' || a.is_llm_recommended
              );
              const attrHB = (context.activities.attraction_options || []).some(
                (a: any) => a.source_type === 'hotelbeds_api'
              );
              return (
                <div className="flex flex-col gap-1">
                  <span className={`text-[9px] font-bold uppercase ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>🎡 Places & Dining</span>
                  <div className="flex gap-1 flex-wrap">
                    {(attrSrc || restSrc) && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-emerald-700 dark:text-emerald-400 leading-none uppercase tracking-wide">
                        🗺️ Geoapify Places
                      </span>
                    )}
                    {attrHB && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 border border-blue-400/30 text-blue-600 dark:text-blue-400 leading-none uppercase tracking-wide">
                        🏨 Hotelbeds Activities
                      </span>
                    )}
                    {attrLLM && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-amber-700 dark:text-amber-400 leading-none uppercase tracking-wide">
                        💡 LLM Fallback
                      </span>
                    )}
                    {!attrSrc && !restSrc && !attrLLM && !attrHB && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-500 leading-none uppercase tracking-wide">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Weather */}
            {context.weather && (
              <div className="flex flex-col gap-1">
                <span className={`text-[9px] font-bold uppercase ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>🌤️ Weather</span>
                <div className="flex gap-1 flex-wrap">
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-400/30 text-sky-700 dark:text-sky-400 leading-none uppercase tracking-wide">
                    ☁️ Open-Meteo API
                  </span>
                </div>
              </div>
            )}

            {/* Routing */}
            {context.transport && (
              <div className="flex flex-col gap-1">
                <span className={`text-[9px] font-bold uppercase ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>🚗 Routing</span>
                <div className="flex gap-1 flex-wrap">
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-emerald-700 dark:text-emerald-400 leading-none uppercase tracking-wide">
                    🗺️ Geoapify Routing
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

            {/* WEATHER ANALYSIS SECTION */}
      <WeatherSpecialistCard context={context} isDark={isDark} />

      {/* ACCOMMODATION / HOTELS COMPONENT SECTION */}
      {context.accommodation && (
        <div className="premium-card rounded-xl p-4 space-y-2">
          <h4 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1 ${
            isDark ? 'text-indigo-400' : 'text-indigo-700'
          }`}>
            <Building2 className="h-4.5 w-4.5 text-indigo-400" /> Lodging Specialist Agent
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
                        {hasCategories ? 'Compare Hotel Tiers' : 'Compare Lodging Choices'}
                      </p>
                      {context.accommodation.selected_category && (
                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          context.accommodation.selected_category === 'skipped'
                            ? 'bg-amber-500 text-white border border-amber-405'
                            : isDark
                            ? 'bg-indigo-950 text-indigo-400 border border-indigo-900/60'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                        }`}>
                          Active: {context.accommodation.selected_category === 'skipped' ? 'Self Arranged' : context.accommodation.selected_category.replace('_', ' ')}
                        </span>
                      )}
                    </div>

                    {/* Data source legend for lodging */}
                    <div className="flex gap-1.5 flex-wrap items-center mt-1 pb-1">
                      <span className="text-[8.5px] text-slate-500 font-bold uppercase tracking-wider mr-1">Provenances:</span>
                      {hotelsList.some((h: any) => h.source_type === 'hotelbeds_api') && (
                        <span className="text-[7.5px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-400/20 text-blue-600 dark:text-blue-400 leading-none">
                          🏨 HB API
                        </span>
                      )}
                      {hotelsList.some((h: any) => h.source_type === 'geoapify_places') && (
                        <span className="text-[7.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-400/20 text-emerald-650 dark:text-emerald-400 leading-none">
                          🗺️ Geoapify
                        </span>
                      )}
                      {hotelsList.some((h: any) => h.source_type === 'llm_recommendation' || h.is_llm_recommended) && (
                        <span className="text-[7.5px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-400/20 text-amber-600 dark:text-amber-400 leading-none">
                          💡 AI Recomended
                        </span>
                      )}
                    </div>

                    {hotelsList.every((h: any) => h.is_llm_recommended || h.source_type === 'llm_recommendation') && (
                      <div className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                        isDark
                          ? 'bg-amber-955/15 border-amber-800/30 text-amber-399'
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
                            const thresholds = context.accommodation.category_thresholds || {};
                            const tabLabel = tab === 'budget' 
                              ? (thresholds.budget ? `Budget (${thresholds.budget.replace('/night', '')})` : 'Budget (<5k)') 
                              : tab === 'mid_range' 
                              ? (thresholds.mid_range ? `Mid-Range (${thresholds.mid_range.replace('/night', '')})` : 'Mid-Range (5k-15k)') 
                              : (thresholds.luxury ? `Luxury (${thresholds.luxury.replace('/night', '')})` : 'Luxury (>15k)');
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
                                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-205'
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
                            disabled={hotelSaving}
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
                        const isSaving = hotelSaving;

                        return (
                          <HotelCard
                            key={idx}
                            hotel={hotel}
                            isDark={isDark}
                            isRecommended={isRecommended}
                            isSaving={isSaving}
                            lodgingCategoryTab={lodgingCategoryTab}
                            destination={context.input?.destination || ''}
                            handleSelectHotel={handleSelectHotel}
                            showSelectButton={context.status !== 'CONFIRMED'}
                          />
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
                      disabled={hotelSaving}
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

            {/*  DINING OPTIONS  */}
            <DiningOptionsCard context={context} isDark={isDark} />
          </div>
        </div>
      )}


      {/* TRANSIT SPECIALIST DETAILS */}
      {context.transport && (
        <div className="premium-card rounded-xl p-4 space-y-2">
          <h4 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1 ${
            isDark ? 'text-indigo-400' : 'text-indigo-700'
          }`}>
            🚗 Transit Specialist Agent
          </h4>
          <TransportOptionsCard
            transport={context.transport}
            status={context.status}
            isDark={isDark}
            isSaving={transportSaving}
            handleSelectTransport={handleSelectTransport}
            travelDate={context.input?.start_date}
          />
        </div>
      )}

      {/* ACTIVITIES SPECIALIST ATTENTION */}
      {context.activities && (
        <div className="premium-card rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1 ${
              isDark ? 'text-indigo-400' : 'text-indigo-700'
            }`}>
              🎡 Sightseeing Specialist Agent
            </h4>
            {/* Source legend for sightseeing */}
            <div className="flex gap-1 flex-wrap">
              {(context.activities.attraction_options || []).some((a: any) => a.source_type === 'geoapify_places') && (
                <span className="text-[7.5px] font-bold px-1 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-emerald-700 dark:text-emerald-400 leading-none uppercase tracking-wide">
                  🗺️ Geo
                </span>
              )}
              {(context.activities.attraction_options || []).some((a: any) => a.source_type === 'hotelbeds_api') && (
                <span className="text-[7.5px] font-bold px-1 py-0.5 rounded bg-blue-500/15 border border-blue-400/30 text-blue-600 dark:text-blue-400 leading-none uppercase tracking-wide">
                  🏨 HB
                </span>
              )}
              {(context.activities.attraction_options || []).some((a: any) => a.source_type === 'llm_recommendation' || a.is_llm_recommended) && (
                <span className="text-[7.5px] font-bold px-1 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-amber-700 dark:text-amber-400 leading-none uppercase tracking-wide">
                  💡 AI
                </span>
              )}
            </div>
          </div>

          {Array.isArray(context.activities.attraction_options) && context.activities.attraction_options.length > 0 ? (
            <div className="space-y-3 pt-1">
              <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                📍 Curated Places of Interest
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {context.activities.attraction_options.map((opt: any, idx: number) => {
                  // Only display real tourist places/attractions (exclude hotels showing on activities)
                  const nameStr = opt.name || '';
                  if (
                    nameStr.toLowerCase().includes('hotel') ||
                    nameStr.toLowerCase().includes('stay') ||
                    nameStr.toLowerCase().includes('inn') ||
                    nameStr.toLowerCase().includes('resort')
                  ) {
                    return null;
                  }
                  return (
                    <AttractionCard
                      key={idx}
                      item={opt}
                      idx={idx}
                      destination={context.input?.destination || ''}
                      isDark={isDark}
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-550 italic">No sightseeing coordinates mapped in this area.</p>
          )}
        </div>
      )}

            {/* LOCAL TRANSIT — Hotel → Tourist Places (Geoapify-powered) */}
      {context.local_transport && context.local_transport.distances_from_hotel && context.local_transport.distances_from_hotel.length > 0 && (
        <div className="premium-card rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 ${
              isDark ? 'text-amber-400' : 'text-amber-700'
            }`}>
              🛺 Local Transit Agent
            </h4>
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-emerald-700 dark:text-emerald-400 leading-none uppercase tracking-wide">
              🗺️ Geoapify Routing
            </span>
          </div>
          <LocalTransitCard context={context} isDark={isDark} />
        </div>
      )}
      </div>
  );
};
