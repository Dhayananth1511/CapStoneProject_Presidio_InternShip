import React, { useState } from 'react';

interface LogConsoleItemProps {
  log: any;
  isDark: boolean;
}

export const LogConsoleItem: React.FC<LogConsoleItemProps> = ({ log, isDark }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const level = (log.level || 'info').toLowerCase();
  const time = log.timestamp || new Date().toLocaleString();
  const msg = log.message || '';
  const service = log.service || 'unknown';

  let levelColorClass = 'text-sky-400 bg-sky-950/40 border-sky-900/30';
  if (level === 'error') {
    levelColorClass = 'text-rose-400 bg-rose-950/40 border-rose-900/30 font-bold';
  } else if (level === 'warn' || level === 'warning') {
    levelColorClass = 'text-amber-400 bg-amber-950/40 border-amber-900/30 font-semibold';
  } else if (level === 'debug') {
    levelColorClass = 'text-slate-400 bg-slate-800/40 border-slate-700/30';
  }

  // Strip service and timestamp, get key-value options
  const { timestamp, message, level: l, service: s, ...meta } = log;
  const hasMeta = Object.keys(meta).length > 0;

  return (
    <div
      onClick={() => hasMeta && setIsExpanded(!isExpanded)}
      className={`p-2.5 rounded-lg border transition-all ${
        level === 'error'
          ? 'border-red-955 bg-red-955/10 hover:bg-red-955/20'
          : level === 'warn'
          ? 'border-amber-955 bg-amber-955/10 hover:bg-amber-955/20'
          : 'border-slate-800/60 hover:bg-slate-850/40'
      } ${hasMeta ? 'cursor-pointer' : ''}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 font-mono text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${levelColorClass}`}>
            {level}
          </span>
          <span className="text-slate-505 text-[10px]">{time}</span>
          <span className="text-slate-600 text-[10px]">[{service}]</span>
          <span className={`text-slate-200 flex-1 break-all ${level === 'error' ? 'text-red-400' : ''}`}>
            {msg}
          </span>
        </div>
        {hasMeta && (
          <span className="text-[10px] text-indigo-400 hover:text-indigo-305 font-bold select-none whitespace-nowrap">
            {isExpanded ? 'Collapse [-]' : 'Payload [+]'}
          </span>
        )}
      </div>

      {isExpanded && hasMeta && (
        <div className={`mt-2.5 p-3 rounded-lg text-[11px] overflow-x-auto border ${
          isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-950 border-slate-800'
        }`}>
          <pre className="text-pink-400">{JSON.stringify(meta, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};
