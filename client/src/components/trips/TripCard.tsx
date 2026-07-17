import React from 'react';
import { Calendar, Users, IndianRupee, Eye, ArrowRight, Sparkles, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TripSummary } from '../../types';

interface TripCardProps {
  trip: TripSummary;
  isDark: boolean;
  cancelPending: boolean;
  handleCancelTrip: (tripId: string, destination: string) => void;
  getStatusBadgeClass: (status: string) => string;
}

export const TripCard: React.FC<TripCardProps> = ({
  trip,
  isDark,
  cancelPending,
  handleCancelTrip,
  getStatusBadgeClass,
}) => {
  return (
    <div className={`premium-card rounded-xl overflow-hidden flex flex-col justify-between border ${isDark ? 'border-card-border/60' : 'border-slate-205'}`}>
      {/* Card top */}
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${isDark ? 'text-slate-500 bg-slate-900 border-slate-800' : 'text-slate-655 bg-slate-50 border-slate-200'}`}>
            #{trip.sessionId.substring(0, 8)}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${getStatusBadgeClass(trip.status)}`}>
            {trip.status}
          </span>
        </div>

        <div>
          <h3 className={`text-xl font-bold flex items-center gap-1.5 ${isDark ? 'text-slate-100' : 'text-slate-850'}`}>
            ✈️ {trip.input.destination || <span className="text-slate-500 italic">Exploring Options</span>}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Created: {new Date(trip.createdAt).toLocaleDateString()}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3.5 pt-2">
          <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            <Calendar className="h-4 w-4 text-primary shrink-0" />
            <span>
              {trip.input.start_date
                ? `${new Date(trip.input.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${trip.input.end_date ? ` - ${new Date(trip.input.end_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}`
                : 'Dates pending'}
            </span>
          </div>

          <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            <Users className="h-4 w-4 text-primary shrink-0" />
            <span>{trip.input.travelers ? `${trip.input.travelers} Travelers` : 'No traveler info'}</span>
          </div>

          <div className={`flex items-center gap-1.5 text-xs col-span-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            <IndianRupee className="h-4 w-4 text-emerald-500 shrink-0" />
            <span className="font-semibold">
              Budget Cap: {trip.input.budget_inr ? `₹${trip.input.budget_inr.toLocaleString()}` : 'Budget pending'}
            </span>
          </div>
        </div>
      </div>

      {/* Action footer */}
      <div className={`p-4 border-t flex items-center justify-between ${isDark ? 'bg-slate-900/40 border-card-border' : 'bg-slate-100 border-slate-205'}`}>
        <div>
          {trip.status !== 'CANCELLED' && trip.status !== 'CONFIRMED' && (
            <button
              onClick={() => handleCancelTrip(trip.sessionId, trip.input.destination || '')}
              disabled={cancelPending}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-red-405 transition cursor-pointer disabled:opacity-50"
              title="Cancel Booking"
            >
              <Trash2 className="h-4 w-4" />
              Cancel Plan
            </button>
          )}
        </div>

        <Link
          to={`/dashboard/plan?tripId=${trip.sessionId}`}
          className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-indigo-400 transition"
        >
          {trip.status === 'CONFIRMED' ? (
            <>
              <Eye className="h-4 w-4" />
              View Confirmation
            </>
          ) : trip.status === 'PLANNED' ? (
            <>
              <Sparkles className="h-4 w-4" />
              Review & Approve
            </>
          ) : (
            <>
              <ArrowRight className="h-4 w-4" />
              Resume Planning
            </>
          )}
        </Link>
      </div>
    </div>
  );
};
