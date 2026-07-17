import React from 'react';
import { MapPin, Users, IndianRupee, CalendarDays } from 'lucide-react';

interface CheckedParametersCardProps {
  context: any;
  isDark: boolean;
}

export const CheckedParametersCard: React.FC<CheckedParametersCardProps> = ({ context, isDark }) => {
  if (!context.input) return null;

  return (
    <div className="premium-card rounded-xl p-5 space-y-3.5">
      <h4 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1 ${
        isDark ? 'text-indigo-400' : 'text-indigo-700'
      }`}>
        <MapPin className="h-4.5 w-4.5 text-primary" /> Checked Parameters
      </h4>
      <div className="grid grid-cols-2 gap-3.5">
        <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-55 border-slate-200'}`}>
          <span className={`text-[10px] block font-bold uppercase mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Destination</span>
          <span className={`text-xs font-semibold ${isDark ? 'text-slate-205' : 'text-slate-850'}`}>
            {context.input.destination || <em className={isDark ? 'text-slate-600' : 'text-slate-400'}>Pending...</em>}
          </span>
        </div>
        <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-55 border-slate-200'}`}>
          <span className={`text-[10px] block font-bold uppercase mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Origin</span>
          <span className={`text-xs font-semibold ${isDark ? 'text-slate-205' : 'text-slate-850'}`}>
            {context.input.origin || <em className={isDark ? 'text-slate-600' : 'text-slate-400'}>Not selected</em>}
          </span>
        </div>
        <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-55 border-slate-200'}`}>
          <span className={`text-[10px] block font-bold uppercase mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Travelers</span>
          <span className={`text-xs font-semibold flex items-center gap-1 ${isDark ? 'text-slate-205' : 'text-slate-850'}`}>
            <Users className="h-3.5 w-3.5 text-primary" />
            {context.input.travelers || 0}
          </span>
        </div>
        <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-55 border-slate-200'}`}>
          <span className={`text-[10px] block font-bold uppercase mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Cap Limit</span>
          <span className="text-xs font-semibold text-emerald-500 flex items-center gap-0.5">
            <IndianRupee className="h-3.5 w-3.5 text-emerald-500" />
            {context.input.budget_inr ? context.input.budget_inr.toLocaleString() : 0}
          </span>
        </div>
        <div className={`col-span-2 p-2.5 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-55 border-slate-200'}`}>
          <span className={`text-[10px] block font-bold uppercase mb-0.5 font-sans ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Dates</span>
          <span className={`text-xs font-semibold flex items-center gap-1.5 ${isDark ? 'text-slate-205' : 'text-slate-850'}`}>
            <CalendarDays className="h-4.5 w-4.5 text-primary" />
            {context.input.start_date || 'YYYY-MM-DD'} – {context.input.end_date || 'YYYY-MM-DD'}
          </span>
        </div>
      </div>
    </div>
  );
};
