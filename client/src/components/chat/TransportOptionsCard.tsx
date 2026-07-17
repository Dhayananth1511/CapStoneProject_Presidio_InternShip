import React from 'react';
import { Send, Clock, Car, Check, Loader2 } from 'lucide-react';
import type { TransportData } from '../../types';

interface TransportOptionsCardProps {
  transport: TransportData;
  status: string;
  isDark: boolean;
  isSaving: boolean;
  handleSelectTransport: (operator: string, mode: string) => void;
  travelDate?: string;
}

export const TransportOptionsCard: React.FC<TransportOptionsCardProps> = ({
  transport,
  status,
  isDark,
  isSaving,
  handleSelectTransport,
  travelDate,
}) => {
  const formatDateNicely = (dateStr: string) => {
    try {
      const dateObj = new Date(dateStr);
      if (isNaN(dateObj.getTime())) return dateStr;
      return dateObj.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className={`p-3 rounded-lg border text-xs space-y-3 transition-colors ${
      isDark ? 'bg-indigo-950/20 border-slate-800' : 'bg-slate-50 border-slate-205'
    }`}>
      {status !== 'CONFIRMED' && (
        <button
          type="button"
          disabled={isSaving}
          onClick={() => handleSelectTransport('Self Arranged', 'skipped')}
          className={`w-full mb-2.5 py-1.5 rounded-lg text-[10.5px] font-bold border transition text-center flex items-center justify-center gap-1 select-none cursor-pointer ${
            transport.selected_option?.operator === 'Self Arranged'
              ? isDark
                ? 'bg-amber-500/10 border-amber-500/50 text-amber-300'
                : 'bg-amber-50 border-amber-300 text-amber-800'
              : isDark
                ? 'bg-slate-900/55 hover:bg-amber-500/10 border-slate-800 text-slate-400 hover:text-amber-300 hover:border-amber-500/30'
                : 'bg-white hover:bg-amber-50/55 border-slate-205 text-slate-505 hover:text-amber-850 hover:border-amber-250'
          }`}
        >
          {transport.selected_option?.operator === 'Self Arranged' ? (
            <>
              <Check className="h-3 w-3 text-amber-500 animate-fadeIn" /> Skipped: Arranging Transit Myself
            </>
          ) : (
            'Skip Transit (Arrange commuter travel myself)'
          )}
        </button>
      )}

      {Array.isArray(transport.options) && transport.options.length > 0 ? (
        <div className="space-y-4">
          {transport.distance_km && (
            <div className={`p-2.5 rounded-lg border font-semibold flex items-center justify-between text-[10.5px] ${
              isDark ? 'bg-slate-900/60 border-slate-800 text-slate-300 font-sans' : 'bg-white border-slate-200 text-slate-700'
            }`}>
              <span className="flex items-center gap-1">🛣️ Inter-City Route Distance:</span>
              <span className={`font-extrabold text-xs ${isDark ? 'text-indigo-400' : 'text-indigo-700'}`}>
                {transport.distance_km} km
              </span>
            </div>
          )}

          {/* Comparative Bar Chart Visualization */}
          {(() => {
            const options = transport.options || [];
            const maxCost = Math.max(...options.map(o => o.cost_inr || 1));
            const maxDuration = Math.max(...options.map(o => o.duration_hrs || 1));

            return (
              <div className={`p-3.5 rounded-xl border text-[11px] space-y-3 shadow-sm ${
                isDark ? 'bg-slate-900/50 border-slate-850' : 'bg-white border-slate-205'
              }`}>
                <p className={`font-extrabold text-[10px] uppercase tracking-wider ${isDark ? 'text-indigo-400' : 'text-indigo-700'}`}>
                  📊 Transport Comparison (Price & Duration)
                </p>
                <div className="space-y-3">
                  {options.map((option, oIdx) => {
                    const pricePercent = Math.max(12, Math.round(((option.cost_inr || 0) / maxCost) * 100));
                    const durationPercent = Math.max(12, Math.round(((option.duration_hrs || 0) / maxDuration) * 100));
                    const isSelected = transport.selected_option && 
                      transport.selected_option.operator === option.operator && 
                      transport.selected_option.mode === option.mode;
                    const isCurrentlyActive = isSelected || (!transport.selected_option && oIdx === 0);

                    return (
                      <div key={oIdx} className={`space-y-1.5 p-2 rounded-lg transition-colors duration-250 ${
                        isCurrentlyActive 
                          ? (isDark ? 'bg-indigo-950/20 shadow-sm' : 'bg-indigo-50/50') 
                          : ''
                      }`}>
                        <div className="flex justify-between items-center text-[10.5px] font-bold">
                          <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                            {option.operator} ({option.mode})
                          </span>
                          <span className={isDark ? 'text-emerald-450 font-semibold' : 'text-emerald-705 font-semibold'}>
                            ₹{option.cost_inr.toLocaleString()} • {option.duration_hrs}h
                          </span>
                        </div>
                        
                        {/* Price Bar */}
                        <div className="flex items-center gap-2">
                          <span className="w-12 text-[8px] text-slate-400 font-bold uppercase tracking-widest text-right shrink-0">price</span>
                          <div className="flex-1 h-2 bg-slate-205 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                              style={{ width: `${pricePercent}%` }}
                            />
                          </div>
                        </div>

                        {/* Duration Bar */}
                        <div className="flex items-center gap-2">
                          <span className="w-12 text-[8px] text-slate-400 font-bold uppercase tracking-widest text-right shrink-0">time</span>
                          <div className="flex-1 h-2 bg-slate-205 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-500 rounded-full transition-all duration-500" 
                              style={{ width: `${durationPercent}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            ✈️ Transit Options & Comparisons
          </p>
          <div className="flex flex-col gap-2.5">
            {transport.options.map((option, idx) => {
              const optionsList = transport.options || [];
              const cheapestOption = optionsList.reduce((lowest, curr) => curr.cost_inr < lowest.cost_inr ? curr : lowest, optionsList[0]);
              const fastestOption = optionsList.reduce((fastest, curr) => curr.duration_hrs < fastest.duration_hrs ? curr : fastest, optionsList[0]);

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

              const isSelected = transport.selected_option && 
                transport.selected_option.operator === option.operator && 
                transport.selected_option.mode === option.mode;
              const isCurrentlyActive = isSelected || (!transport.selected_option && idx === 0);
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
                          <span className={`font-bold text-xs ${isDark ? 'text-slate-205' : 'text-slate-900'}`}>
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

                        {/* Travel Date */}
                        <div className={`text-[10px] font-semibold flex items-center gap-1 ${isDark ? 'text-indigo-300' : 'text-indigo-700'}`}>
                          <span>📅 Date:</span>
                          <span className="font-bold">{travelDate ? formatDateNicely(travelDate) : 'Departure Date'}</span>
                          {option.distance_km && (
                            <span className={`text-[9.5px] font-normal ml-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              ({option.distance_km} km journey)
                            </span>
                          )}
                        </div>

                        {/* Premium Visual Timeline */}
                        <div className="flex items-center gap-2 py-1 select-none">
                          <div className="text-center">
                            <p className="text-[10.5px] font-bold text-slate-800 dark:text-slate-200 leading-snug">{option.departure || '09:00'}</p>
                            <p className="text-[7.5px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">DEP</p>
                          </div>
                          
                          {/* Timeline Bar */}
                          <div className="flex-1 flex flex-col items-center justify-center relative px-2">
                            <span className="text-[7.5px] font-extrabold text-indigo-620 dark:text-indigo-400 font-sans z-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-1 -bottom-2 shrink-0 select-none">
                              {option.duration_hrs} hrs
                            </span>
                            <div className="w-full h-0.5 border-t border-dashed border-slate-300 dark:border-slate-750"></div>
                          </div>

                          <div className="text-center">
                            <p className="text-[10.5px] font-bold text-slate-800 dark:text-slate-200 leading-snug">{option.arrival || '11:00'}</p>
                            <p className="text-[7.5px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">ARR</p>
                          </div>
                        </div>

                        {option.mode?.toLowerCase() === 'flight' && (
                          <div className={`text-[9px] ${isDark ? 'text-slate-405' : 'text-slate-500'}`}>
                            Source: <span className="font-semibold">{isLiveFlightSchedule ? 'Live schedule + estimated fare' : 'Estimated fallback data'}</span>
                          </div>
                        )}
                        {Array.isArray(option.amenities) && option.amenities.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {option.amenities.slice(0, 3).map((am, amIdx) => (
                              <span key={amIdx} className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full border ${isDark ? 'bg-slate-955/40 border-slate-805 text-slate-405' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
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
                  {!isCurrentlyActive && status !== 'CONFIRMED' && (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleSelectTransport(option.operator, option.mode)}
                      className={`w-full py-1.5 rounded-lg text-xs font-bold border transition text-center flex items-center justify-center gap-1 cursor-pointer select-none ${
                        isDark
                          ? 'bg-indigo-950/40 hover:bg-primary/20 border-indigo-900/40 text-indigo-300 hover:text-white'
                          : 'bg-indigo-50/50 hover:bg-primary/10 border-indigo-200 text-indigo-700 hover:text-indigo-805'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isSaving ? (
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
          {transport.best_option && (
            <p className={isDark ? 'text-slate-350' : 'text-slate-700'}>
              🛫 **Best Option**: {transport.best_option}
            </p>
          )}
          {transport.estimated_cost_inr && (
            <p className={isDark ? 'text-emerald-440 font-semibold' : 'text-emerald-700 font-bold'}>
              Estimated Price: ₹{(transport.estimated_cost_inr || 0).toLocaleString()}
            </p>
          )}
        </>
      )}
    </div>
  );
};
