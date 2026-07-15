import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface TripItem {
  sessionId: string;
  status: string;
  createdAt: string;
  userId?: {
    name: string;
    email: string;
  };
  input: {
    destination?: string;
    origin?: string;
    start_date?: string;
    end_date?: string;
    travelers?: number;
    budget_inr?: number;
    interests?: string[];
  };
  budget?: {
    total_cost_inr?: number;
    total_estimated_cost?: number;
    transport?: number;
    accommodation?: number;
    food?: number;
    activities?: number;
    local_transport?: number;
    emergency_fund?: number;
  };
  formattedPlan?: string;
}

interface TripDetailModalProps {
  selectedTrip: TripItem;
  isDark: boolean;
  onClose: () => void;
}

export const TripDetailModal: React.FC<TripDetailModalProps> = ({
  selectedTrip,
  isDark,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className={`relative w-full max-w-4xl max-h-[85vh] overflow-y-auto border rounded-2xl p-6 shadow-2xl space-y-6 transition-colors ${
        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>

        {/* Modal Close Button */}
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-lg transition active:scale-95 focus:outline-none cursor-pointer ${
            isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-205 text-slate-600 hover:text-slate-900 border border-slate-200'
          }`}
        >
          <span className="text-xl font-bold">&times;</span>
        </button>

        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`text-2xl font-extrabold transition-colors ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Trip Plan Detailed View
            </h2>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${selectedTrip.status === 'CONFIRMED'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                  : selectedTrip.status === 'PLANNED'
                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/25'
                    : selectedTrip.status === 'CANCELLED'
                      ? 'bg-red-500/10 text-red-550 border border-red-550/25'
                      : 'bg-amber-500/10 text-amber-500 border border-amber-500/25'
                }`}
            >
              {selectedTrip.status}
            </span>
          </div>
          <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Session ID: <strong>{selectedTrip.sessionId}</strong> | Created by: <strong>{selectedTrip.userId?.name || 'Anonymous'}</strong> ({selectedTrip.userId?.email || 'no email'})
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Left Side: Parameters & Budget Details */}
          <div className="md:col-span-1 space-y-4">
            <div className={`p-4 border rounded-xl space-y-3 transition-colors ${
              isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-indigo-400' : 'text-indigo-655'}`}>
                Trip Details
              </h3>
              <div className={`space-y-2 text-xs ${isDark ? 'text-slate-350' : 'text-slate-600'}`}>
                <div>
                  <span className={`block text-[10px] uppercase font-bold ${isDark ? 'text-slate-550' : 'text-slate-400'}`}>Destination</span>
                  <span className="font-semibold">{selectedTrip.input.destination || 'N/A'}</span>
                </div>
                <div>
                  <span className={`block text-[10px] uppercase font-bold ${isDark ? 'text-slate-550' : 'text-slate-400'}`}>Origin</span>
                  <span className="font-semibold">{selectedTrip.input.origin || 'N/A'}</span>
                </div>
                <div>
                  <span className={`block text-[10px] uppercase font-bold ${isDark ? 'text-slate-550' : 'text-slate-400'}`}>Dates</span>
                  <span className="font-semibold">
                    {selectedTrip.input.start_date || 'YYYY-MM-DD'} – {selectedTrip.input.end_date || 'YYYY-MM-DD'}
                  </span>
                </div>
                <div>
                  <span className={`block text-[10px] uppercase font-bold ${isDark ? 'text-slate-550' : 'text-slate-400'}`}>Travelers</span>
                  <span className="font-semibold">{selectedTrip.input.travelers || 0}</span>
                </div>
                <div>
                  <span className={`block text-[10px] uppercase font-bold ${isDark ? 'text-slate-550' : 'text-slate-400'}`}>Interests</span>
                  <span className="font-semibold">
                    {selectedTrip.input.interests?.join(', ') || 'General'}
                  </span>
                </div>
              </div>
            </div>

            {/* Budget assessment */}
            {selectedTrip.budget && (
              <div className={`p-4 border rounded-xl space-y-3 transition-colors ${
                isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-emerald-450' : 'text-emerald-700'}`}>
                  Cost Breakdown (INR)
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className={`border-b text-[10px] uppercase font-bold transition-colors ${
                        isDark ? 'border-slate-800 text-slate-500' : 'border-slate-250 text-slate-400'
                      }`}>
                        <th className="pb-1.5 font-bold">Category</th>
                        <th className="pb-1.5 text-right font-bold">Cost (INR)</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y font-medium transition-colors ${
                      isDark ? 'divide-slate-855' : 'divide-slate-200'
                    }`}>
                      <tr>
                        <td className={`${isDark ? 'py-2 text-slate-400' : 'py-2 text-slate-650'}`}>✈️ Transit</td>
                        <td className={`py-2 text-right ${isDark ? 'text-slate-200' : 'text-slate-850'}`}>
                          ₹{(selectedTrip.budget.transport || 0).toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td className={`${isDark ? 'py-2 text-slate-400' : 'py-2 text-slate-650'}`}>🏨 Lodging</td>
                        <td className={`py-2 text-right ${isDark ? 'text-slate-200' : 'text-slate-850'}`}>
                          ₹{(selectedTrip.budget.accommodation || 0).toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td className={`${isDark ? 'py-2 text-slate-400' : 'py-2 text-slate-650'}`}>🍔 Food & Meals</td>
                        <td className={`py-2 text-right ${isDark ? 'text-slate-200' : 'text-slate-850'}`}>
                          ₹{(selectedTrip.budget.food || 0).toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td className={`${isDark ? 'py-2 text-slate-400' : 'py-2 text-slate-650'}`}>🎟️ Sightseeing / Entrance</td>
                        <td className={`py-2 text-right ${isDark ? 'text-slate-200' : 'text-slate-850'}`}>
                          ₹{(selectedTrip.budget.activities || 0).toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td className={`${isDark ? 'py-2 text-slate-400' : 'py-2 text-slate-650'}`}>🚕 Local Transport</td>
                        <td className={`py-2 text-right ${isDark ? 'text-slate-200' : 'text-slate-850'}`}>
                          ₹{(selectedTrip.budget.local_transport || 0).toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td className={`${isDark ? 'py-2 text-slate-400' : 'py-2 text-slate-650'}`}>🚨 Emergency Fund (10%)</td>
                        <td className={`py-2 text-right ${isDark ? 'text-slate-200' : 'text-slate-850'}`}>
                          ₹{(selectedTrip.budget.emergency_fund || 0).toLocaleString()}
                        </td>
                      </tr>
                      <tr className={`border-t font-bold transition-colors ${
                        isDark ? 'border-slate-800 text-slate-200' : 'border-slate-250 text-slate-805'
                      }`}>
                        <td className="py-2.5 font-semibold">Total Cost</td>
                        <td className={`py-2.5 text-right font-bold ${isDark ? 'text-emerald-450' : 'text-emerald-700'}`}>
                          ₹{(selectedTrip.budget.total_cost_inr ?? selectedTrip.budget.total_estimated_cost ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Right Side: Full generated markdown plan */}
          <div className="md:col-span-2 flex flex-col">
            <div className={`p-5 border rounded-xl space-y-4 overflow-y-auto flex-1 md:min-h-[450px] transition-colors ${
              isDark ? 'bg-slate-950/45 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-indigo-400' : 'text-indigo-650'}`}>
                Formatted Travel Itinerary
              </h3>
              {selectedTrip.formattedPlan ? (
                <div className={`prose max-w-none text-xs leading-relaxed animate-fadeIn ${
                  isDark ? 'prose-invert text-slate-350' : 'text-slate-700'
                }`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedTrip.formattedPlan}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-xs text-slate-550 italic">No formatted plan or itinerary has been generated for this session yet.</p>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
