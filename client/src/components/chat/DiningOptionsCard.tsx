import React from 'react';
import { ArrowUpRight } from 'lucide-react';

interface DiningOptionsCardProps {
  context: any;
  isDark: boolean;
}

export const DiningOptionsCard: React.FC<DiningOptionsCardProps> = ({ context, isDark }) => {
  const selectedHotel = context.accommodation?.selected_hotel ||
    (context.accommodation?.hotels?.[0] ?? null);
  const hotelAmenities: string[] = Array.isArray(selectedHotel?.amenities) ? selectedHotel.amenities : [];

  const diningKeywords = ['restaurant', 'room service', 'dining', 'breakfast', 'bar', 'buffet', 'caf', 'cafe', 'food', 'kitchen', 'meal'];
  const inHotelDining = hotelAmenities.filter((a: string) =>
    diningKeywords.some(kw => a.toLowerCase().includes(kw))
  );

  const hasRoomService = hotelAmenities.some((a: string) => a.toLowerCase().includes('room service'));
  const hasRestaurant = hotelAmenities.some((a: string) =>
    ['restaurant', 'dining', 'caf', 'cafe', 'buffet'].some(kw => a.toLowerCase().includes(kw))
  );
  const hasBreakfast = hotelAmenities.some((a: string) => a.toLowerCase().includes('breakfast'));

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
        <div className="flex gap-1 flex-wrap">
          {nearbyRestaurants.some((r: any) => r.source_type === 'geoapify_places') && (
            <span className="text-[7.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-emerald-700 dark:text-emerald-400 leading-none uppercase tracking-wide">
              🗺️ Geo
            </span>
          )}
          {nearbyRestaurants.some((r: any) => r.source_type === 'llm_recommendation' || !r.source_type) && (
            <span className="text-[7.5px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-amber-700 dark:text-amber-400 leading-none uppercase tracking-wide">
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
                🛊 Room Service
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
                isDark ? 'bg-slate-955/40 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}>
                {amenity}
              </span>
            ))}
          </div>
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
                : { label: '💡 AI', cls: isDark ? 'bg-amber-955/30 border-amber-800/30 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700' };
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
};
