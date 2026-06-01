import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'blue' | 'green' | 'red' | 'amber' | 'slate';
}

export function StatCard({ title, value, subtitle, icon, trend, color = 'blue' }: StatCardProps) {
  const colors = {
    blue: {
      bg: 'bg-primary-50 dark:bg-primary-900/20',
      icon: 'text-primary-600 dark:text-primary-400',
      border: 'border-primary-100 dark:border-primary-800/50',
    },
    green: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      icon: 'text-emerald-600 dark:text-emerald-400',
      border: 'border-emerald-100 dark:border-emerald-800/50',
    },
    red: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      icon: 'text-red-600 dark:text-red-400',
      border: 'border-red-100 dark:border-red-800/50',
    },
    amber: {
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      icon: 'text-amber-600 dark:text-amber-400',
      border: 'border-amber-100 dark:border-amber-800/50',
    },
    slate: {
      bg: 'bg-slate-50 dark:bg-slate-900/20',
      icon: 'text-slate-600 dark:text-slate-400',
      border: 'border-slate-100 dark:border-slate-700',
    },
  };

  return (
    <div className={`rounded-xl border ${colors[color].border} bg-white dark:bg-slate-800 p-5 shadow-card transition-all duration-300 hover:shadow-card-hover`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{value}</p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          )}
          {trend && (
            <div className="mt-2 flex items-center gap-1">
              {trend.isPositive ? (
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-red-500" />
              )}
              <span className={`text-xs font-medium ${trend.isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                {trend.value}%
              </span>
            </div>
          )}
        </div>
        {icon && (
          <div className={`p-2.5 rounded-lg ${colors[color].bg} ${colors[color].icon} shrink-0`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
