import React from 'react';
import { ArrowUpRight, MapPin } from 'lucide-react';
import type { Attraction } from '../../types';

interface AttractionCardProps {
  item: Attraction;
  idx: number;
  isDark: boolean;
  destination: string;
}

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
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=650&q=80',
];

export const AttractionCard: React.FC<AttractionCardProps> = ({
  item,
  idx,
  isDark,
  destination,
}) => {
  const ratingValue = Math.min(5, Math.max(0, item.rating || 0));
  const stars = Array.from({ length: 5 }, (_, i) => i < Math.round(ratingValue));

  const cleanDestination = destination ? destination.trim() : '';

  const rawQuery = item.vicinity && !item.vicinity.includes('Hotelbeds')
    ? (item.vicinity.toLowerCase().startsWith(item.name.toLowerCase())
      ? item.vicinity
      : `${item.name}, ${item.vicinity}`)
    : `${item.name}`;

  // Make sure destination is appended to query string if not already present
  const queryStr = cleanDestination && !rawQuery.toLowerCase().includes(cleanDestination.toLowerCase())
    ? `${rawQuery}, ${cleanDestination}`
    : rawQuery;

  // Only use query_place_id if it's a valid Google Place ID (starts with ChI)
  const isGooglePlaceId = item.place_id && item.place_id.startsWith('ChI');
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryStr)}${
    isGooglePlaceId ? `&query_place_id=${item.place_id}` : ''
  }`;

  const imgSrc = item.photo_reference
    ? (item.photo_reference.startsWith('http')
      ? item.photo_reference
      : `/api/trips/place-photo?photo_reference=${item.photo_reference}`)
    : fallbackImages[idx % fallbackImages.length];

  const handleCardClick = () => {
    window.open(mapsUrl, '_blank');
  };

  return (
    <div
      onClick={handleCardClick}
      className={`group p-2.5 rounded-xl border transition-all flex flex-col gap-2 relative overflow-hidden cursor-pointer ${
        item.is_llm_recommended || item.source_type === 'llm_recommendation'
          ? isDark
            ? 'bg-amber-955/10 border-amber-800/30 hover:border-amber-600/50 hover:shadow-md'
            : 'bg-amber-50/40 border-amber-200 hover:border-amber-400/60 hover:shadow-md'
          : isDark
            ? 'bg-slate-900/60 border-slate-850 hover:bg-slate-900/80 hover:border-slate-700 hover:shadow-lg'
            : 'bg-white border-slate-205 hover:border-slate-350 hover:shadow-lg'
      }`}
    >
      {/* Image Container */}
      <div className="h-28 w-full relative rounded-lg overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-955">
        <img
          src={imgSrc}
          alt={item.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            e.currentTarget.src = fallbackImages[idx % fallbackImages.length];
          }}
        />
        {/* Source Provenance Badge */}
        <div className="absolute top-2 left-2 flex items-center">
          {(item.is_llm_recommended || item.source_type === 'llm_recommendation') ? (
            <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500 text-white shadow-md uppercase tracking-wider backdrop-blur-sm bg-opacity-95">
              💡 AI Rec
            </span>
          ) : item.source_type === 'hotelbeds_api' ? (
            <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-blue-600 text-white shadow-md uppercase tracking-wider backdrop-blur-sm bg-opacity-95">
              🏨 Hotelbeds
            </span>
          ) : (
            <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-600 text-white shadow-md uppercase tracking-wider backdrop-blur-sm bg-opacity-95">
              🗺️ Geoapify
            </span>
          )}
        </div>
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Google Maps"
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
          <h5
            className={`font-bold text-[11.5px] leading-tight line-clamp-1 group-hover:text-primary transition-colors ${
              isDark ? 'text-slate-100' : 'text-slate-900'
            }`}
            title={item.name}
          >
            {item.name}
          </h5>
          {item.vicinity && (
            <p
              className={`text-[9.5px] line-clamp-1 mt-0.5 flex items-center gap-0.5 ${
                isDark ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              {item.vicinity}
            </p>
          )}
          {item.description && (
            <p
              className={`text-[10px] leading-snug line-clamp-2 mt-1 italic ${
                isDark ? 'text-slate-400' : 'text-slate-600'
              }`}
            >
              "{item.description}"
            </p>
          )}
        </div>

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

          {/* Price per person if available */}
          {item.price_per_person_inr ? (
            <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded border leading-none ${
              isDark ? 'bg-emerald-950/30 border-emerald-800/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}>
              ₹{item.price_per_person_inr.toLocaleString()}/person
            </span>
          ) : item.user_ratings_total !== undefined && item.user_ratings_total > 0 ? (
            <span
              className={`text-[8.5px] font-semibold font-mono ${
                isDark ? 'text-slate-500' : 'text-slate-455'
              }`}
            >
              ({item.user_ratings_total.toLocaleString()} reviews)
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};
