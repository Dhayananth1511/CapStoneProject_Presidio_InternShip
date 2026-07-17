import React from 'react';
import { Check, ArrowUpRight, MapPin, Loader2 } from 'lucide-react';
import type { Hotel } from '../../types';

interface HotelCardProps {
  hotel: Hotel;
  isDark: boolean;
  isRecommended: boolean;
  isSaving: boolean;
  lodgingCategoryTab: string;
  destination: string;
  handleSelectHotel: (hotelName: string, category: string) => void;
  showSelectButton: boolean;
}

export const HotelCard: React.FC<HotelCardProps> = ({
  hotel,
  isDark,
  isRecommended,
  isSaving,
  lodgingCategoryTab,
  destination,
  handleSelectHotel,
  showSelectButton,
}) => {
  const ratingCount = Math.round(hotel.rating || 4.0);
  const stars = Array.from({ length: 5 }, (_, i) => i < ratingCount);

  const queryHotel = hotel.address
    ? (hotel.address.toLowerCase().startsWith(hotel.name.toLowerCase())
      ? hotel.address
      : `${hotel.name}, ${hotel.address}`)
    : (hotel.vicinity && !hotel.vicinity.includes('Hotelbeds')
      ? (hotel.vicinity.toLowerCase().startsWith(hotel.name.toLowerCase())
        ? hotel.vicinity
        : `${hotel.name}, ${hotel.vicinity}`)
      : `${hotel.name}, ${destination}`);

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryHotel)}`;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName !== 'BUTTON' &&
      !target.closest('button') &&
      target.tagName !== 'A' &&
      !target.closest('a')
    ) {
      window.open(mapsUrl, '_blank');
    }
  };

  return (
    <div
      className={`p-3 rounded-xl border transition flex flex-col gap-2.5 cursor-pointer hover:shadow-md ${
        isRecommended
          ? isDark
            ? 'bg-indigo-955/20 border-primary shadow-md shadow-primary/5'
            : 'bg-indigo-50/40 border-indigo-400 shadow-md shadow-indigo-100/30'
          : isDark
          ? 'bg-slate-900/40 border-slate-850 hover:border-slate-700'
          : 'bg-white border-slate-205 hover:border-slate-350'
      }`}
      onClick={handleClick}
    >
      <div className="flex justify-between items-start">
        <div className="space-y-1 max-w-[70%]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`font-bold text-xs ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {hotel.name}
            </span>
            {(() => {
              const srcType = hotel.source_type;
              const isLLM = hotel.is_llm_recommended || srcType === 'llm_recommendation';
              const isHotelbeds = srcType === 'hotelbeds_api';
              const isGeoapify = srcType === 'geoapify_places';
              if (isLLM) {
                return (
                  <span className="text-[8.5px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-500 dark:text-amber-400 leading-none uppercase tracking-wider">
                    💡 AI Recommendation
                  </span>
                );
              }
              if (isHotelbeds) {
                return (
                  <span className="text-[8.5px] font-extrabold px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 leading-none uppercase tracking-wider">
                    🏨 Hotelbeds API
                  </span>
                );
              }
              if (isGeoapify) {
                return (
                  <span className="text-[8.5px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-650 dark:text-emerald-400 leading-none uppercase tracking-wider">
                    🗺️ Geoapify Live
                  </span>
                );
              }
              // legacy fallback: no source_type set
              return (
                <span className="text-[8.5px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-650 dark:text-emerald-400 leading-none uppercase tracking-wider">
                  🌐 Live Data
                </span>
              );
            })()}
            {isRecommended && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-white leading-none flex items-center gap-0.5 animate-fadeIn">
                <Check className="h-2.5 w-2.5" /> Selected
              </span>
            )}
            <a
              href={mapsUrl}
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
            <span className={`text-[9.5px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-505'}`}>
              ({hotel.rating || 4.0}/5 rating)
            </span>
          </div>
        </div>

        <div className="text-right">
          <p className="text-xs font-bold text-emerald-500">
            ₹{hotel.price_per_night_inr ? hotel.price_per_night_inr.toLocaleString() : 0}{' '}
            <span className={`text-[8.5px] font-normal ${isDark ? 'text-slate-450' : 'text-slate-500'}`}>
              / night
            </span>
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
      {showSelectButton && !isRecommended && (
        <button
          type="button"
          disabled={isSaving}
          onClick={(e) => {
            e.stopPropagation();
            handleSelectHotel(hotel.name, lodgingCategoryTab);
          }}
          className={`w-full py-1.5 rounded-lg text-xs font-bold border transition text-center flex items-center justify-center gap-1 cursor-pointer select-none ${
            isDark
              ? 'bg-indigo-955/40 hover:bg-primary/20 border-indigo-900/40 text-indigo-300 hover:text-white'
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
};
