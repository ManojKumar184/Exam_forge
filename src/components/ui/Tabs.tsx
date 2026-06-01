import React, { useState } from 'react';

interface TabsProps {
  tabs: { id: string; label: string; icon?: React.ReactNode }[];
  defaultTab?: string;
  onChange?: (tabId: string) => void;
  children: (activeTab: string) => React.ReactNode;
}

export function Tabs({ tabs, defaultTab, onChange, children }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    onChange?.(tabId);
  };

  return (
    <div>
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="flex gap-1 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-200 rounded-t-md
                ${activeTab === tab.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400 bg-primary-50/50 dark:bg-primary-900/10'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-300 dark:hover:bg-slate-800/50'
                }
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="mt-4">
        {children(activeTab)}
      </div>
    </div>
  );
}
