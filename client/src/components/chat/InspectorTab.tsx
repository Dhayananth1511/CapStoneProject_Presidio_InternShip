import React from 'react';
import { Download, CloudSun, AlertTriangle, ArrowUpRight, Check, Building2, MapPin, Users, IndianRupee, CalendarDays } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { HotelCard } from './HotelCard';
import { TransportOptionsCard } from './TransportOptionsCard';
import { AttractionCard } from './AttractionCard';

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

      {/* CHECKED PARAMETERS CARD */}
      {context.input && (
        <div className="premium-card rounded-xl p-5 space-y-3.5">
          <h4 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1 ${
            isDark ? 'text-indigo-400' : 'text-indigo-700'
          }`}>
            <MapPin className="h-4.5 w-4.5 text-primary" /> Checked Parameters
          </h4>
          <div className="grid grid-cols-2 gap-3.5">
            <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <span className={`text-[10px] block font-bold uppercase mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Destination</span>
              <span className={`text-xs font-semibold ${isDark ? 'text-slate-205' : 'text-slate-850'}`}>
                {context.input.destination || <em className={isDark ? 'text-slate-600' : 'text-slate-400'}>Pending...</em>}
              </span>
            </div>
            <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <span className={`text-[10px] block font-bold uppercase mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Origin</span>
              <span className={`text-xs font-semibold ${isDark ? 'text-slate-205' : 'text-slate-850'}`}>
                {context.input.origin || <em className={isDark ? 'text-slate-600' : 'text-slate-400'}>Not selected</em>}
              </span>
            </div>
            <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <span className={`text-[10px] block font-bold uppercase mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Travelers</span>
              <span className={`text-xs font-semibold flex items-center gap-1 ${isDark ? 'text-slate-205' : 'text-slate-850'}`}>
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
              <span className={`text-xs font-semibold flex items-center gap-1.5 ${isDark ? 'text-slate-205' : 'text-slate-850'}`}>
                <CalendarDays className="h-4.5 w-4.5 text-primary" />
                {context.input.start_date || 'YYYY-MM-DD'} – {context.input.end_date || 'YYYY-MM-DD'}
              </span>
            </div>
          </div>
        </div>
      )}
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

      {/* WEATHER ANALYSIS SECTION */}
      {context.weather && (
        <div className="premium-card rounded-xl p-4 space-y-2">
          <h4 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 ${
            isDark ? 'text-sky-400' : 'text-sky-700'
          }`}>
            <CloudSun className="h-4.5 w-4.5" /> Weather Specialist Agent
          </h4>
          <div className={`p-3 rounded-lg border text-xs space-y-3 transition-colors ${
            isDark ? 'bg-indigo-950/20 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className={`font-bold ${isDark ? 'text-slate-205' : 'text-slate-805'}`}>
              🌤️ Climate Summary ({context.input?.destination || 'Destination'}):
            </div>
            
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
                          : 'bg-white border-slate-205 hover:border-slate-350 shadow-sm'
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
                        <p className={`text-[9px] font-bold mt-0.5 ${isDark ? 'text-indigo-400' : 'text-indigo-650'}`}>
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

            {context.weather.advisory && (
              <div className={`text-[10.5px] p-2.5 rounded-lg border flex gap-1.5 items-start mt-2 ${
                isDark ? 'bg-amber-955/20 border-amber-900/30 text-amber-399' : 'bg-amber-50 border-amber-105/50 text-amber-800'
              }`}>
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                <span>
                  <strong>Advisory:</strong> {context.weather.advisory}
                </span>
              </div>
            )}
          </div>
        </div>
      )}


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

                    {hotelsList.some((h: any) => h.is_llm_recommended) && (
                      <div className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                        isDark
                          ? 'bg-amber-955/15 border-amber-800/30 text-amber-300'
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
            {(() => {
              const selectedHotel = context.accommodation?.selected_hotel ||
                (context.accommodation?.hotels?.[0] ?? null);
              const hotelAmenities: string[] = Array.isArray(selectedHotel?.amenities)
                ? selectedHotel.amenities
                : [];

              const diningKeywords = ['restaurant', 'room service', 'dining', 'breakfast', 'bar', 'buffet', 'caf', 'cafe', 'food', 'kitchen', 'meal'];
              const inHotelDining = hotelAmenities.filter((a: string) =>
                diningKeywords.some(kw => a.toLowerCase().includes(kw))
              );

              const hasRoomService = hotelAmenities.some((a: string) => a.toLowerCase().includes('room service'));
              const hasRestaurant = hotelAmenities.some((a: string) =>
                ['restaurant', 'dining', 'caf', 'cafe', 'buffet'].some(kw => a.toLowerCase().includes(kw))
              );
              const hasBreakfast = hotelAmenities.some((a: string) => a.toLowerCase().includes('breakfast'));

              // Merge restaurant options from all sources (Geoapify, Hotelbeds, LLM)
              const nearbyRestaurants = Array.isArray(context.activities?.restaurant_options)
                ? context.activities.restaurant_options.slice(0, 6)
                : (Array.isArray(context.activities?.restaurants)
                  ? context.activities.restaurants.slice(0, 6).map((name: string) => ({ name, source_type: 'llm_recommendation' }))
                  : []);

              const hasDiningData = inHotelDining.length > 0 || hasRoomService || hasRestaurant || hasBreakfast || nearbyRestaurants.length > 0;
              if (!hasDiningData) return null;

              return (
                <div className={`mt-3 rounded-xl border p-3 space-y-3 ${
                isDark ? 'border-slate-800 bg-slate-900/30' : 'border-slate-205 bg-white'
              }`}>
                <div className="flex items-center justify-between">
                  <p className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}>
                    🍽️ Dining Options
                  </p>
                  {/* Data source legend for dining */}
                  <div className="flex gap-1 flex-wrap">
                    {nearbyRestaurants.some((r: any) => r.source_type === 'geoapify_places') && (
                      <span className="text-[7.5px] font-bold px-1 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-emerald-700 dark:text-emerald-400 leading-none uppercase tracking-wide">
                        🗺️ Geo
                      </span>
                    )}
                    {nearbyRestaurants.some((r: any) => r.source_type === 'llm_recommendation' || !r.source_type) && (
                      <span className="text-[7.5px] font-bold px-1 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-amber-700 dark:text-amber-400 leading-none uppercase tracking-wide">
                        💡 AI
                      </span>
                    )}
                  </div>
                </div>

                {/* In-hotel Dining */}
                {(inHotelDining.length > 0 || hasRoomService || hasRestaurant || hasBreakfast) && (
                  <div className="space-y-1.5">
                    <p className={`text-[9.5px] font-bold uppercase tracking-wide ${
                      isDark ? 'text-indigo-400' : 'text-indigo-655'
                    }`}>🔑 In-Hotel Dining ({selectedHotel?.name || 'Selected Hotel'})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {hasRoomService && (
                        <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                          isDark ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-450' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        }`}>
                          🛊Room Service
                        </span>
                      )}
                      {hasRestaurant && (
                        <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                          isDark ? 'bg-amber-955/30 border-amber-800/40 text-amber-400' : 'bg-amber-50 border-amber-200 text-emerald-700'
                        }`}>
                          🍴 On-Site Restaurant
                        </span>
                      )}
                      {hasBreakfast && (
                        <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                          isDark ? 'bg-sky-955/35 border-sky-800/40 text-sky-400' : 'bg-sky-50 border-sky-200 text-sky-700'
                        }`}>
                          🍳 Breakfast Included
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
                        isDark ? 'text-slate-505' : 'text-slate-400'
                      }`}>No in-hotel dining amenities listed — verify with hotel on check-in.</p>
                    )}
                  </div>
                )}

                {/* Nearby Restaurants — mixed sources */}
                {nearbyRestaurants.length > 0 && (
                  <div className="space-y-1.5">
                    <p className={`text-[9.5px] font-bold uppercase tracking-wide ${
                      isDark ? 'text-amber-400' : 'text-amber-700'
                    }`}>🍱 Nearby Restaurants</p>
                    <div className="flex flex-col gap-1">
                      {nearbyRestaurants.map((r: any, i: number) => {
                        const srcBadge = r.source_type === 'geoapify_places'
                          ? { label: '🗺️ Geo', cls: isDark ? 'bg-emerald-950/30 border-emerald-800/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700' }
                          : r.source_type === 'hotelbeds_api'
                          ? { label: '🏨 HB', cls: isDark ? 'bg-blue-950/30 border-blue-800/30 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-700' }
                          : { label: '💡 AI', cls: isDark ? 'bg-amber-950/30 border-amber-800/30 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700' };
                        return (
                          <a
                            key={i}
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((r.name || r) + ' restaurant ' + (context.input?.destination || ''))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center justify-between p-1.5 rounded-lg border text-[10px] transition hover:shadow-sm ${
                              isDark
                                ? 'bg-slate-900/50 border-slate-850 hover:border-amber-700/30 text-slate-350 hover:text-white'
                                : 'bg-slate-55 border-slate-200 hover:border-amber-300 text-slate-700'
                            }`}
                          >
                            <span className="font-semibold line-clamp-1">{r.name || r}</span>
                            <span className="flex items-center gap-1 shrink-0 ml-2">
                              {r.rating && (
                                <span className="text-amber-500 text-[9px] font-bold">⭐ {r.rating}</span>
                              )}
                              <span className={`text-[7.5px] font-bold px-1 py-0.5 rounded border leading-none ${srcBadge.cls}`}>
                                {srcBadge.label}
                              </span>
                              <ArrowUpRight className="h-3 w-3 text-slate-400 shrink-0" />
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
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
          />
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

          <div className={`p-3 rounded-lg border text-xs space-y-3 ${
            isDark ? 'bg-amber-950/10 border-slate-800' : 'bg-amber-50/60 border-amber-100'
          }`}>
            {/* Origin hotel label */}
            {(context.accommodation?.recommended || context.accommodation?.selected_hotel?.name) && (
              <div className={`flex items-center gap-1.5 text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <span>🏨</span>
                <span>From: <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{context.accommodation?.recommended || context.accommodation?.selected_hotel?.name}</span></span>
              </div>
            )}

            {/* Per-attraction distance rows */}
            <div className="space-y-2">
              <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                📍 Distances to Tourist Spots
              </p>
              <div className="flex flex-col gap-1.5">
                {context.local_transport.distances_from_hotel.map((item: any, idx: number) => {
                  const dist = Number(item.distance_km) || 0;
                  const modeEmoji = dist === 0 ? '🚶' : dist < 2 ? '🚶' : dist < 6 ? '🛺' : '🚗';
                  const modeLabel = dist === 0 ? 'Walking' : dist < 2 ? 'Walk' : dist < 6 ? 'Auto' : 'Cab';
                  const baseFare = modeLabel === 'Auto' ? 40 : modeLabel === 'Cab' ? 80 : 0;
                  const ratePerKm = modeLabel === 'Auto' ? 10 : modeLabel === 'Cab' ? 15 : 0;
                  const estFare = modeLabel === 'Walking' || modeLabel === 'Walk'
                    ? 0
                    : Math.round((baseFare + dist * ratePerKm) * 2);
                  const modeColor = modeLabel === 'Walk' || modeLabel === 'Walking'
                    ? isDark ? 'text-emerald-400 bg-emerald-950/30 border-emerald-800/30' : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : modeLabel === 'Auto'
                    ? isDark ? 'text-amber-400 bg-amber-950/30 border-amber-800/30' : 'text-amber-700 bg-amber-50 border-amber-200'
                    : isDark ? 'text-blue-400 bg-blue-950/30 border-blue-800/30' : 'text-blue-700 bg-blue-50 border-blue-200';

                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between rounded-lg border px-2.5 py-2 gap-2 transition-all hover:shadow-sm ${
                        isDark
                          ? 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Attraction name */}
                      <div className="flex items-start gap-1.5 min-w-0 flex-1">
                        <span className="text-[11px] mt-0.5 shrink-0">📌</span>
                        <span className={`text-[10.5px] font-semibold line-clamp-2 leading-snug ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          {item.attraction}
                        </span>
                      </div>

                      {/* Stats chips */}
                      <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                        {/* Distance */}
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none ${
                          isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'
                        }`}>
                          {item.distance_km} km
                        </span>

                        {/* Mode */}
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none ${modeColor}`}>
                          {modeEmoji} {modeLabel}
                        </span>

                        {/* Duration */}
                        {item.duration_text && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border leading-none ${
                            isDark ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}>
                            {item.duration_text}
                          </span>
                        )}

                        {/* Fare */}
                        {estFare > 0 ? (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none ${
                            isDark ? 'bg-indigo-950/50 border-indigo-800/40 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                          }`}>
                            ₹{estFare} RT
                          </span>
                        ) : (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none ${
                            isDark ? 'bg-emerald-950/30 border-emerald-800/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          }`}>
                            Free
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Daily average summary */}
            {context.local_transport.daily_budget_estimate !== undefined && (
              <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                isDark ? 'bg-indigo-950/20 border-indigo-900/30' : 'bg-indigo-50 border-indigo-100'
              }`}>
                <span className={`text-[10px] font-bold ${isDark ? 'text-indigo-300' : 'text-indigo-700'}`}>
                  📊 Est. Daily Commute Budget
                </span>
                <span className={`text-sm font-extrabold ${isDark ? 'text-indigo-200' : 'text-indigo-800'}`}>
                  ₹{(context.local_transport.daily_budget_estimate || 0).toLocaleString()}
                </span>
              </div>
            )}

            {/* Cab rate reference table */}
            {Array.isArray(context.local_transport.cab_estimates) && context.local_transport.cab_estimates.length > 0 && (
              <div className="space-y-1.5">
                <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  💡 Local Fare Reference
                </p>
                <div className="flex flex-col gap-1">
                  {context.local_transport.cab_estimates.map((rate: any, i: number) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between text-[9.5px] px-2.5 py-1.5 rounded border ${
                        isDark ? 'bg-slate-900/40 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <span className="font-semibold">{rate.mode}</span>
                      <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                        ₹{rate.base_fare} base + ₹{rate.rate_per_km}/km
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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
    </div>
  );
};
