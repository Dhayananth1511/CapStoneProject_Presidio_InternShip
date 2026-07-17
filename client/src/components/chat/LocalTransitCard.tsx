import React from 'react';

interface LocalTransitCardProps {
  context: any;
  isDark: boolean;
}

export const LocalTransitCard: React.FC<LocalTransitCardProps> = ({ context, isDark }) => {
  const hasLocalTransport = context.local_transport &&
    context.local_transport.distances_from_hotel &&
    context.local_transport.distances_from_hotel.length > 0;

  if (!hasLocalTransport) return null;

  return (
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
              ? isDark ? 'text-amber-400 bg-amber-955/30 border-amber-800/30' : 'text-amber-700 bg-amber-50 border-amber-200'
              : isDark ? 'text-blue-400 bg-blue-955/30 border-blue-800/30' : 'text-blue-700 bg-blue-50 border-blue-200';

            const isHub = item.attraction?.includes('Entry/Exit Hub');
            const isFlightHub = item.attraction?.toLowerCase().includes('airport');
            const isTrainHub = item.attraction?.toLowerCase().includes('railway');
            const hubIcon = isFlightHub ? '🛫' : isTrainHub ? '🚆' : '🚌';

            return (
              <div
                key={idx}
                className={`flex items-center justify-between rounded-lg border px-2.5 py-2 gap-2 transition-all hover:shadow-sm ${
                  isHub
                    ? isDark
                      ? 'bg-indigo-950/20 border-indigo-500/35 hover:border-indigo-450/50'
                      : 'bg-indigo-50/55 border-indigo-250 hover:border-indigo-300'
                    : isDark
                    ? 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Attraction name */}
                <div className="flex items-start gap-1.5 min-w-0 flex-1">
                  <span className="text-[11px] mt-0.5 shrink-0">{isHub ? hubIcon : '📌'}</span>
                  <span className={`text-[10.5px] font-semibold line-clamp-2 leading-snug ${
                    isHub
                      ? isDark
                        ? 'text-indigo-200 font-bold'
                        : 'text-indigo-850 font-bold'
                      : isDark
                      ? 'text-slate-200'
                      : 'text-slate-800'
                  }`}>
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
                      isDark ? 'bg-slate-800 border-slate-700 text-slate-405' : 'bg-slate-50 border-slate-200 text-slate-505'
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
                      isDark ? 'bg-emerald-950/30 border-emerald-800/30 text-emerald-400' : 'bg-emerald-55 border-emerald-200 text-emerald-700'
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
          isDark ? 'bg-indigo-950/20 border-indigo-900/30' : 'bg-indigo-50 border-indigo-120'
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
                <span className={`font-bold ${isDark ? 'text-slate-202' : 'text-slate-700'}`}>
                  ₹{rate.base_fare} base + ₹{rate.rate_per_km}/km
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
