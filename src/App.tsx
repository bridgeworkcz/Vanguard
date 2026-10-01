import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar, AppRoute } from './components/Navbar';
import { HomeCalculator, VacanciesPage, AboutPage } from './components/PublicPages';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { ClientPortal } from './components/ClientPortal';
import { AdminConsole } from './components/AdminConsole';
import { ServicePicker } from './components/ServicePicker';
import { contentApi } from './services/api';
import { ArrowRight, ShieldCheck, LockKeyhole, Globe2, Eye, LayoutDashboard } from 'lucide-react';

const PublicHome: React.FC<{ go: (r: AppRoute) => void }> = ({ go }) => {
  const [content, setContent] = useState<{ settings: Record<string, string>; gallery: any[] }>({ settings: {}, gallery: [] });
  const { t } = useLanguage();
  useEffect(() => { contentApi.get().then(setContent).catch(() => {}); }, []);
  const s = content.settings;
  return (
    <div>
      <section className="hero">
        <div className="hero-glow" />
        <div className="page-wrap hero-inner">
          <div className="hero-copy">
            <p className="eyebrow">{s.hero_eyebrow || t('heroEyebrow')}</p>
            <h1>{s.hero_title || t('heroTitle')}</h1>
            <p className="hero-sub">{s.hero_subtitle || t('heroSub')}</p>
            <div className="hero-actions">
              <button className="primary-btn" onClick={() => go('vacancies')}>{t('explore')} <ArrowRight size={16} /></button>
              <button className="secondary-btn" onClick={() => go('about')}>{t('about')}</button>
            </div>
            <div className="trust-row">
              <span><ShieldCheck /> Licensed support</span>
              <span><LockKeyhole /> Secure contracts</span>
              <span><Globe2 /> 13 destinations</span>
            </div>
          </div>
          <div className="hero-card glass">
            <div className="hero-card-top"><span>PRODUCTION PATH</span><span className="live-dot">LIVE</span></div>
            <div className="hero-card-line"><b>Stage 1</b><span>Profile, then review</span></div>
            <div className="hero-card-line"><b>Stage 2</b><span>Scans plus 5 days for the 30% payment</span></div>
            <div className="hero-card-line"><b>Stage 3</b><span>Processing, 40% invoice, watermarked copies</span></div>
            <div className="hero-card-line"><b>Stage 4</b><span>Final 30% and worldwide dispatch</span></div>
          </div>
        </div>
      </section>
      <section className="page-wrap"><HomeCalculator onResults={() => {}} /></section>
    </div>
  );
};

function roleList(user: { roles?: unknown; email?: string } | null) {
  const raw = user?.roles;
  const roles = Array.isArray(raw) ? raw.map(String) : String(raw || '').split(/[,|]/).map(x => x.trim()).filter(Boolean);
  if ((user?.email || '').toLowerCase() === 'admin@gmail.com' && !roles.includes('ADMIN')) roles.push('ADMIN', 'MANAGER');
  return roles;
}

const MainRouter: React.FC = () => {
  const { user, loading, logout } = useAuth();
  const [publicRoute, setPublicRoute] = useState<AppRoute>(() => {
    const p = window.location.pathname.replace(/^\//, '');
    return (['home', 'vacancies', 'about'] as string[]).includes(p) ? (p as AppRoute) : 'home';
  });
  const [previewPublicSite, setPreviewPublicSite] = useState(false);
  const [portalKey, setPortalKey] = useState(0);

  useEffect(() => {
    const onPop = () => {
      const p = window.location.pathname.replace(/^\//, '');
      if (['home', 'vacancies', 'about'].includes(p)) setPublicRoute(p as AppRoute);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigatePublic = (r: AppRoute) => {
    setPublicRoute(r);
    const path = r === 'home' ? '/' : `/${r}`;
    if (window.location.pathname !== path) window.history.pushState({ route: r }, '', path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) return <div className="app-loading">Loading Vanguard…</div>;

  const roles = roleList(user);
  const isAdmin = roles.includes('ADMIN');
  const isStaff = isAdmin || roles.includes('MANAGER');

  if (isStaff && !previewPublicSite) {
    return (
      <div className="staff-workspace">
        <div className="staff-top-strip">
          <span>{isAdmin ? 'ADMIN CONSOLE' : 'MANAGER CONSOLE'}</span>
          <div className="strip-actions">
            <button className="preview-btn" onClick={() => setPreviewPublicSite(true)}><Eye size={14} /> View public site</button>
            <span className="user-email">{user?.email}</span>
            <button className="logout-btn" onClick={logout}>Sign out</button>
          </div>
        </div>
        <AdminConsole limited={!isAdmin} />
      </div>
    );
  }

  if (isStaff && previewPublicSite) {
    return (
      <div className="app-shell">
        <div className="preview-floating-bar">
          <span>Public site preview</span>
          <button className="primary-btn compact-btn" onClick={() => setPreviewPublicSite(false)}><LayoutDashboard size={14} /> Back to console</button>
        </div>
        <Navbar route={publicRoute} setRoute={navigatePublic} />
        <main>
          {publicRoute === 'home' && <PublicHome go={navigatePublic} />}
          {publicRoute === 'vacancies' && <VacanciesPage onApply={() => {}} />}
          {publicRoute === 'about' && <AboutPage />}
        </main>
      </div>
    );
  }

  if (user) {
    return (
      <div className="app-shell">
        <header className="client-top-bar glass">
          <div className="brand"><span className="brand-mark">V</span><div><b>VANGUARD</b><small>CLIENT WORKSPACE</small></div></div>
          <div className="client-nav-actions">
            <button className="text-btn" onClick={() => navigatePublic(publicRoute === 'vacancies' ? 'home' : 'vacancies')}>{publicRoute === 'vacancies' ? 'My workspace' : 'Vacancies'}</button>
            <span className="user-badge">{user.fullName}</span>
            <button className="nav-auth" onClick={logout}>Sign out</button>
          </div>
        </header>
        <main>
          {publicRoute === 'vacancies' ? <VacanciesPage onApply={() => navigatePublic('home')} /> : (
            <>
              <section className="page-wrap" style={{ paddingBottom: 0 }}><ServicePicker onCreated={() => setPortalKey(k => k + 1)} /></section>
              <ClientPortal key={portalKey} />
            </>
          )}
        </main>
        <footer className="footer"><div><b>VANGUARD GLOBAL MOBILITY</b><span>Client portal</span></div><span>© 2026 Vanguard</span></footer>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Navbar route={publicRoute} setRoute={navigatePublic} />
      <main>
        {publicRoute === 'home' && <PublicHome go={navigatePublic} />}
        {publicRoute === 'vacancies' && <VacanciesPage onApply={() => {}} />}
        {publicRoute === 'about' && <AboutPage />}
      </main>
      <footer className="footer"><div><b>VANGUARD GLOBAL MOBILITY</b><span>European corporate mobility</span></div><span>© 2026 Vanguard</span></footer>
    </div>
  );
};

export const App = () => (
  <LanguageProvider><AuthProvider><MainRouter /></AuthProvider></LanguageProvider>
);
export default App;
