import React from 'react';

interface AdminStatCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  iconBgClass: string;
  iconTextClass: string;
  subtextContent?: React.ReactNode;
  isDark: boolean;
}

export const AdminStatCard: React.FC<AdminStatCardProps> = ({
  title,
  value,
  icon: Icon,
  iconBgClass,
  iconTextClass,
  subtextContent,
  isDark,
}) => {
  return (
    <div className="premium-card rounded-xl p-5 flex items-center gap-4">
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg border ${iconBgClass} ${iconTextClass}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</span>
        <span className={`text-2xl font-extrabold transition-colors ${isDark ? 'text-white' : 'text-slate-900'}`}>
          {value}
        </span>
        {subtextContent && <span className="block text-[10px] text-slate-500 mt-0.5">{subtextContent}</span>}
      </div>
    </div>
  );
};
