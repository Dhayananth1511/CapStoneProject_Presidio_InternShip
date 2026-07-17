import React, { useState } from 'react';
import { ChevronUp, ChevronDown, Clock, ArrowUpRight, CalendarCheck } from 'lucide-react';
import type { ItineraryData } from '../../types';
import { formatTimeAndPeriod } from '../../utils/timeHelper';

interface ItineraryTimelineProps {
  itinerary: ItineraryData;
  accommodation?: {
    recommended?: string;
    selected_hotel?: {
      name?: string;
      address?: string;
      vicinity?: string;
    };
  };
  activities?: {
    attraction_options?: Array<{
      name: string;
      vicinity?: string;
    }>;
  };
  destination: string;
  isDark: boolean;
  budget?: any;
}

export const ItineraryTimeline: React.FC<ItineraryTimelineProps> = ({
  itinerary,
  accommodation,
  activities,
  destination,
  isDark,
  budget,
}) => {
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({});

  const toggleDay = (dayNum: number) => {
    setExpandedDays(prev => ({
      ...prev,
      [dayNum]: prev[dayNum] === undefined ? false : !prev[dayNum],
    }));
  };

  if (!itinerary?.days) {
    return (
      <div className="text-center py-16 text-slate-500 space-y-3">
        <CalendarCheck className="h-10 w-10 mx-auto text-slate-700 animate-pulse" />
        <p className="text-sm font-semibold">Itinerary Not Generated Yet</p>
        <p className="text-xs px-6 text-slate-655 font-normal">
          Complete all parameter slot details in the chat and run full plan generation.
        </p>
      </div>
    );
  }

  const hotelName = accommodation?.recommended || accommodation?.selected_hotel?.name || 'Self Arranged';

  return (
    <div className={`space-y-6 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 ${
      isDark ? 'before:bg-indigo-950' : 'before:bg-indigo-100'
    }`}>
      {itinerary.days.map((dayItem, idx) => {
        const isDayExpanded = expandedDays[dayItem.day] === undefined ? dayItem.day === 1 : expandedDays[dayItem.day];
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
                      <ChevronUp className="h-4 w-4 text-slate-405 shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-405 shrink-0" />
                    )}
                  </h4>
                </div>
                {(() => {
                  const dayTravelTotal = dayItem.schedule?.reduce((acc, action) => acc + (action.travel_cost_inr || 0), 0) || 0;
                  const dayEntryTotal = dayItem.schedule?.reduce((acc, action) => acc + (action.cost_inr || 0), 0) || 0;
                  const totalDaysCount = itinerary.days?.length || 1;
                  const dailyFoodTotal = budget?.food ? Math.round(Number(budget.food) / totalDaysCount) : 0;
                  const finalDailyTotal = dayTravelTotal + dayEntryTotal + dailyFoodTotal;

                  if (finalDailyTotal <= 0) return null;

                  return (
                    <div className="relative group/tooltip inline-flex items-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded leading-none border transition-colors cursor-help select-none ${
                        isDark ? 'bg-slate-900 border-slate-800 text-emerald-450 hover:bg-slate-850 hover:border-slate-700' : 'bg-emerald-50 border-emerald-100/50 text-emerald-700 hover:bg-emerald-100'
                      }`}>
                        ₹{finalDailyTotal.toLocaleString()}
                      </span>
                      
                      {/* Cost breakdown Tooltip */}
                      <div className={`absolute bottom-full right-0 mb-2 w-48 p-2.5 rounded-lg border shadow-xl transition-all duration-200 origin-bottom-right scale-95 opacity-0 pointer-events-none group-hover/tooltip:scale-100 group-hover/tooltip:opacity-100 group-hover/tooltip:pointer-events-auto z-30 space-y-1.5 ${
                        isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-slate-205 text-slate-700'
                      }`}>
                        <p className="font-extrabold text-[9px] uppercase tracking-wider text-slate-500 border-b pb-1 mb-1.5">
                          💵 cost breakdown
                        </p>
                        {dailyFoodTotal > 0 && (
                          <div className="flex justify-between text-[10px]">
                            <span>🍜 Food & Dine</span>
                            <span className="font-bold">₹{dailyFoodTotal.toLocaleString()}</span>
                          </div>
                        )}
                        {dayEntryTotal > 0 && (
                          <div className="flex justify-between text-[10px]">
                            <span>🎟️ Entry Fees</span>
                            <span className="font-bold">₹{dayEntryTotal.toLocaleString()}</span>
                          </div>
                        )}
                        {dayTravelTotal > 0 && (
                          <div className="flex justify-between text-[10px]">
                            <span>🛺 Transit & Commute</span>
                            <span className="font-bold">₹{dayTravelTotal.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="border-t pt-1.5 mt-1.5 flex justify-between text-[10px] font-extrabold text-emerald-500">
                          <span>Total Day Cost</span>
                          <span>₹{finalDailyTotal.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {isDayExpanded && (
                <div className="space-y-3 pt-2.5 border-t border-card-border/40 animate-fadeIn">
                  {dayItem.description && (
                    <div className={`text-[11px] px-2.5 py-1.5 rounded border transition-colors ${
                      isDark ? 'text-slate-300 bg-slate-900/40 border-slate-805' : 'text-slate-700 bg-slate-50 border-slate-100'
                    }`}>
                      📝 <strong>Summary:</strong> {dayItem.description}
                    </div>
                  )}
                  {dayItem.weather_note && (
                    <div className={`text-[11px] px-2.5 py-1.5 rounded border italic transition-colors ${
                      isDark ? 'text-slate-404 bg-indigo-955/20 border-indigo-900/10' : 'text-slate-655 bg-indigo-50/50 border-indigo-120/40'
                    }`}>
                      ⛅ {dayItem.weather_note}
                    </div>
                  )}

                  {/* Daily Transit summary, if local travel commutes have estimated expenses */}
                  {(() => {
                    const dayTravelTotal = dayItem.schedule?.reduce((acc, action) => acc + (action.travel_cost_inr || 0), 0) || 0;
                    if (dayTravelTotal > 0) {
                      return (
                        <div className={`text-[11px] px-2.5 py-1.5 rounded border transition-colors flex items-center justify-between ${
                          isDark 
                            ? 'text-sky-305 bg-sky-955/15 border-sky-900/30' 
                            : 'text-sky-900 bg-sky-50 border-sky-100'
                        }`}>
                          <span className="flex items-center gap-1">🚏 <strong>Local Transit:</strong> Est. daily commute expenses from lodging</span>
                          <span className="font-bold text-sky-500">₹{dayTravelTotal.toLocaleString()}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}

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
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                  accommodation?.selected_hotel?.address
                                    ? `${hotelName}, ${accommodation.selected_hotel.address}`
                                    : (accommodation?.selected_hotel?.vicinity
                                      ? `${hotelName}, ${accommodation.selected_hotel.vicinity}`
                                      : `${hotelName} ${destination || ''}`)
                                )}`}
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

                      {dayItem.schedule && dayItem.schedule.map((action, aIdx) => {
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
                        const matchOpt = activities?.attraction_options?.find((opt) => opt.name?.toLowerCase() === (action.location || '').toLowerCase());
                        const queryStr = matchOpt?.vicinity && !matchOpt.vicinity.includes('Hotelbeds')
                          ? `${placeQuery}, ${matchOpt.vicinity}`
                          : `${placeQuery}, ${destination || ''}`;
                        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryStr)}`;

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
                                  {action.travel_cost_inr !== undefined && action.travel_cost_inr > 0 && (
                                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded ${
                                      isDark ? 'bg-emerald-950/30 text-emerald-450 border border-emerald-900/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                    }`}>
                                      🚗 Commute: ₹{action.travel_cost_inr}
                                    </span>
                                  )}
                                  {action.cost_inr !== undefined && action.cost_inr > 0 && (
                                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded ${
                                      isDark ? 'bg-blue-950/30 text-blue-400 border border-blue-900/30' : 'bg-blue-50 text-blue-705 border border-blue-100'
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
                                            ? 'bg-slate-955 border-slate-800 text-slate-400'
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
                                <h5 className={`text-xs font-semibold leading-normal ${isDark ? 'text-slate-205' : 'text-slate-800'}`}>
                                  {action.activity}
                                  {action.location && (
                                    <span className="font-normal text-slate-400">
                                      {" at "}
                                      <a
                                        href={mapsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={`Search "${action.location}" on Google Maps`}
                                        className={`font-semibold underline inline-flex items-center gap-0.5 hover:text-indigo-505 transition-colors ${
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
                                    <span className="shrink-0 mt-0.5">🚕</span>
                                    <span>
                                      <strong>Commute Info:</strong> {action.transport_note}
                                    </span>
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No schedules or sightseeing activities added to this day index.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
