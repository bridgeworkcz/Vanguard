import React from 'react';
import { APP_CONFIG } from './config/appConfig';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-200 via-emerald-400 to-cyan-400 bg-clip-text text-transparent mb-4">
          {APP_CONFIG.brandName}
        </h1>
        <p className="text-slate-400 mb-6 text-sm">
          System Initialization Phase 1 — Structural Foundation
        </p>
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-left text-xs font-mono text-slate-300 space-y-2">
          <div><span className="text-emerald-400">System:</span> {APP_CONFIG.brandName}</div>
          <div><span className="text-emerald-400">Version:</span> {APP_CONFIG.version}</div>
          <div><span className="text-emerald-400">Build Baseline:</span> Phase 1 Structure Ready</div>
        </div>
      </div>
    </div>
  );
};

export default App;
