import { AlertTriangle, FileCode, Server } from 'lucide-react';
import { apiConfig } from '../config/api';

const ENV_TEMPLATE = `VITE_API_URL=http://localhost:5000`;

export function ApiConfigError() {
  const isDev = import.meta.env.DEV;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-white dark:bg-slate-900 shadow-xl p-8">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Server className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
              Backend API not configured
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              ExamForge now uses a MERN backend (Express + MongoDB).
              {isDev
                ? ' Start the API server and point the frontend to it.'
                : ' Set the production API URL in your deployment environment.'}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            <FileCode className="w-4 h-4" />
            Add to project root <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">.env</code>
          </div>
          <pre className="mt-3 p-4 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono">{ENV_TEMPLATE}</pre>
        </div>

        <div className="mt-6 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4 text-sm text-slate-600 dark:text-slate-400 space-y-2">
          <p className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Dev quick start
          </p>
          <ol className="list-decimal list-inside space-y-1 text-xs">
            <li>
              <code>cd backend && npm install && cp .env.example .env</code>
            </li>
            <li>Start MongoDB locally</li>
            <li>
              <code>npm run seed && npm run dev</code> (API on port 5000)
            </li>
            <li>
              <code>npm run dev</code> in project root (frontend)
            </li>
          </ol>
        </div>

        {!apiConfig.isConfigured && (
          <p className="mt-4 text-xs text-slate-500">
            Current <code>VITE_API_URL</code> is empty.
          </p>
        )}
      </div>
    </div>
  );
}
