// Admin dashboard uses Chart.js via react-chartjs-2 to visualize:
// - Trip status distribution (doughnut chart)
// - Top destinations (bar chart)
// - All trips statistics metrics

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import api from '../lib/axios';
import { useAuthStore } from '../store/authStore';

ChartJS.register(ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

export default function AdminPage() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  // TanStack Query: auto-fetches, caches, and re-fetches on window focus
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => api.get('/admin/analytics').then((r) => r.data),
  });

  const statusChartData = {
    labels: analytics?.statusCounts?.map((s: any) => s._id) || [],
    datasets: [{
      data: analytics?.statusCounts?.map((s: any) => s.count) || [],
      backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444'],
      borderColor: 'rgba(255,255,255,0.05)',
      borderWidth: 1,
    }],
  };

  const destChartData = {
    labels: analytics?.topDestinations?.slice(0, 8).map((d: any) => d._id || 'Unknown') || [],
    datasets: [{
      label: 'Trip Count',
      data: analytics?.topDestinations?.slice(0, 8).map((d: any) => d.count) || [],
      backgroundColor: '#6366f1',
      borderRadius: 6,
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#94a3b8',
          font: { family: 'Inter' }
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#94a3b8' }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#94a3b8' }
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0e15] text-[#c5c6c7] p-6 font-sans relative overflow-hidden">
      {/* Decorative blurred background shapes */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-white/5">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-wide">🛡️ Admin Dashboard</h1>
          <p className="text-slate-500 text-xs mt-1">Cross-system platform orchestration metrics</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-[#1f2833]/50 hover:bg-[#1f2833]/80 text-white font-medium rounded-xl border border-white/5 transition"
          >
            ← Return to Chat
          </button>
          <button
            onClick={logout}
            className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-medium rounded-xl border border-rose-500/20 transition"
          >
            Sign Out
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="max-w-7xl mx-auto flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-400 text-sm font-semibold">Aggregating platform metrics...</p>
          </div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { label: 'Registered Swarm Users', value: analytics?.totalUsers || 0, icon: '👥' },
              { label: 'Total Trips Logged', value: analytics?.totalTrips || 0, icon: '🗺️' },
              { label: 'Average Budget Request', value: `₹${Math.round(analytics?.avgBudget || 0).toLocaleString()}`, icon: '💰' },
              { label: 'Administrator Role', value: user?.name || 'Admin', icon: '🛡️' }
            ].map((stat, i) => (
              <div key={i} className="bg-[#151622]/60 backdrop-blur-xl border border-white/5 rounded-2xl p-6 flex items-center justify-between transition hover:border-indigo-500/20">
                <div>
                  <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">{stat.label}</p>
                  <p className="text-2xl font-bold text-white mt-1.5">{stat.value}</p>
                </div>
                <div className="text-3xl p-3 bg-white/5 rounded-xl border border-white/5">{stat.icon}</div>
              </div>
            ))}
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Doughnut Chart */}
            <div className="bg-[#151622]/60 backdrop-blur-xl border border-white/5 rounded-2xl p-6 flex flex-col">
              <h2 className="text-white font-bold text-base mb-6 tracking-wide">Itinerary Lifecycle States</h2>
              <div className="flex-1 min-h-[300px] flex items-center justify-center">
                <div className="w-full max-w-[280px]">
                  <Doughnut
                    data={statusChartData}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: {
                          position: 'bottom',
                          labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
                        }
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Bar Chart */}
            <div className="bg-[#151622]/60 backdrop-blur-xl border border-white/5 rounded-2xl p-6 flex flex-col">
              <h2 className="text-white font-bold text-base mb-6 tracking-wide">Top Destination Requests</h2>
              <div className="flex-1 min-h-[300px]">
                <Bar data={destChartData} options={chartOptions} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
