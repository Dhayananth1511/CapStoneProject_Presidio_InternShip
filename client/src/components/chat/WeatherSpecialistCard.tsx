import React from 'react';
import { CloudSun, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface WeatherSpecialistCardProps {
  context: any;
  isDark: boolean;
}

export const WeatherSpecialistCard: React.FC<WeatherSpecialistCardProps> = ({ context, isDark }) => {
  if (!context.weather) return null;

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

  return (
    <div className="premium-card rounded-xl p-4 space-y-2">
      <h4 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 ${
        isDark ? 'text-sky-400' : 'text-sky-700'
      }`}>
        <CloudSun className="h-4.5 w-4.5" /> Weather Specialist Agent
      </h4>
      <div className={`p-3 rounded-lg border text-xs space-y-3 transition-colors ${
        isDark ? 'bg-indigo-955/20 border-slate-800' : 'bg-slate-50 border-slate-200'
      }`}>
        <div className={`font-bold ${isDark ? 'text-slate-205' : 'text-slate-805'}`}>
          🌤️ Climate Summary ({context.input?.destination || 'Destination'}):
        </div>
        
        {/* Horizontal daily weather forecast cards */}
        {Array.isArray(context.weather.forecast) && context.weather.forecast.length > 0 && (
          <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-thin">
            {context.weather.forecast.map((day: any, idx: number) => {
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
  );
};
