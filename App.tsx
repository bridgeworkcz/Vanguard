import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { ClientDashboard } from './components/ClientDashboard';
import { ManagerDashboard } from './components/ManagerDashboard';
import { Shield, Globe, Award, Users, ArrowRight } from 'lucide-react';

const MainContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'home' | 'vacancies' | 'team' | 'dashboard'>('home');
  const { user } = useAuth();
  const isStaff = user?.roles.includes('ADMIN') || user?.roles.includes('MANAGER');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1">
        {activeTab === 'home' && (
          <div className="space-y-20 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
            <section className="text-center space-y-6 pt-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold">
                <Shield className="w-3.5 h-3.5" /> Premium EU Relocation & Legalization
              </div>
              <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-amber-100 via-white to-amber-400 bg-clip-text text-transparent">
                Vanguard Global Mobility
              </h1>
              <p className="max-w-2xl mx-auto text-slate-400 text-base sm:text-lg">
                Official European residency, work permits, and turnkey legal support for international professionals and families.
              </p>
              <div className="flex justify-center gap-4 pt-4">
                <button
                  onClick={() => setActiveTab('vacancies')}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-6 py-3 rounded-xl text-sm transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20"
                >
                  Explore Vacancies <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-3">
                <Globe className="w-8 h-8 text-amber-500" />
                <h3 className="text-lg font-bold">100% Legal EU Processing</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Direct submission to government migration registries with guaranteed verification and dossier transparency.
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-3">
                <Award className="w-8 h-8 text-amber-500" />
                <h3 className="text-lg font-bold">Milestone Payment Model</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Tranche payments via USDT TRC-20 linked directly to official legal progress stages.
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-3">
                <Users className="w-8 h-8 text-amber-500" />
                <h3 className="text-lg font-bold">Dedicated Legal Advisors</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Personal manager assigned to every dossier with real-time status updates and document vaulting.
                </p>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'vacancies' && (
          <div className="max-w-7xl mx-auto px-4 py-12 text-center space-y-4">
            <h2 className="text-2xl font-bold">Current European Vacancies</h2>
            <p className="text-sm text-slate-400">Official employment offers with guaranteed residence permit sponsorship.</p>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-slate-400 text-sm">
              Vacancies catalog is available. Sign in to apply for official positions.
            </div>
          </div>
        )}

        {activeTab === 'team' && (
          <div className="max-w-7xl mx-auto px-4 py-12 text-center space-y-4">
            <h2 className="text-2xl font-bold">Our Legal & Mobility Experts</h2>
            <p className="text-sm text-slate-400">Certified lawyers and international migration consultants.</p>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-slate-400 text-sm">
              Team profiles loaded dynamically via secure API.
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          isStaff ? <ManagerDashboard /> : <ClientDashboard />
        )}
      </main>

      <footer className="bg-slate-900 border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        © 2026 Vanguard Global Mobility EU. All rights reserved. Zero-Trust Security Active.
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
};

export default App;
