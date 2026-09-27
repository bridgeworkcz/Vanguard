import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, User, LogOut, LayoutDashboard } from 'lucide-react';
import { AuthModal } from './AuthModal';

interface NavbarProps {
  activeTab: 'home' | 'vacancies' | 'team' | 'dashboard';
  setActiveTab: (tab: 'home' | 'vacancies' | 'team' | 'dashboard') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const { user, logout } = useAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const isStaff = user?.roles.includes('ADMIN') || user?.roles.includes('MANAGER');

  return (
    <>
      <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => setActiveTab('home')}
          >
            <div className="bg-amber-500 p-2 rounded-lg text-slate-950 font-bold">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-wide bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent">
                VANGUARD
              </span>
              <span className="text-xs text-slate-400 block -mt-1 font-medium">
                GLOBAL MOBILITY EU
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            <button
              onClick={() => setActiveTab('home')}
              className={`text-sm font-medium transition-colors ${
                activeTab === 'home' ? 'text-amber-400' : 'text-slate-300 hover:text-white'
              }`}
            >
              Home
            </button>
            <button
              onClick={() => setActiveTab('vacancies')}
              className={`text-sm font-medium transition-colors ${
                activeTab === 'vacancies' ? 'text-amber-400' : 'text-slate-300 hover:text-white'
              }`}
            >
              Vacancies
            </button>
            <button
              onClick={() => setActiveTab('team')}
              className={`text-sm font-medium transition-colors ${
                activeTab === 'team' ? 'text-amber-400' : 'text-slate-300 hover:text-white'
              }`}
            >
              Our Team
            </button>
            {user && (
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === 'dashboard' ? 'text-amber-400' : 'text-slate-300 hover:text-white'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                {isStaff ? 'CRM Panel' : 'Client Portal'}
              </button>
            )}
          </nav>

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-semibold text-amber-400">{user.fullName}</div>
                  <div className="text-[10px] text-slate-400">{user.roles.join(', ')}</div>
                </div>
                <button
                  onClick={logout}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthOpen(true)}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-4 py-2 rounded-lg text-sm transition-all flex items-center gap-2 shadow-lg shadow-amber-500/10"
              >
                <User className="w-4 h-4" />
                Sign In / Register
              </button>
            )}
          </div>
        </div>
      </header>

      {isAuthOpen && <AuthModal onClose={() => setIsAuthOpen(false)} />}
    </>
  );
};


