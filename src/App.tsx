import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar, AppRoute } from './components/Navbar';
import { HomeCalculator, VacanciesPage, AboutPage } from './components/PublicPages';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { ClientPortal } from './components/ClientPortal';
import { AdminConsole } from './components/AdminConsole';
import { contentApi } from './services/api';
import { ArrowRight, ShieldCheck, LockKeyhole, Globe2, Eye, LayoutDashboard } from 'lucide-react';

const PublicHome: React.FC<{ go: (r: AppRoute) => void }> = ({ go }) => {
  const [content, setContent] = useState<{ settings: Record<string, string>; gallery: any[] }>({
    settings: {},
    gallery: []
  });
  const { t } = useLanguage();

  useEffect(() => {
    contentApi.get().then(setContent).catch(() => {});
  }, []);

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
              <button className="primary-btn" onClick={() => go('vacancies')}>
                {t('explore')} <ArrowRight size={16} />
              </button>
              <button className="secondary-btn" onClick={() => go('about')}>
                {t('about')}
              </button>
            </div>
            <div className="trust-row">
              <span><ShieldCheck /> Ліцензований супровід</span>
              <span><LockKeyhole /> Безпечні контракти</span>
              <span><Globe2 /> 14 країн світу</span>
            </div>
          </div>

          <div className="hero-card glass">
            <div className="hero-card-top">
              <span>ПРОЦЕС ВИГОТОВЛЕННЯ</span>
              <span className="live-dot">LIVE</span>
            </div>
            <div className="hero-card-line">
              <b>Статус 1</b>
              <span>Анкета → Перевірка</span>
            </div>
            <div className="hero-card-line">
              <b>Статус 2</b>
              <span>Скани документів + 5 днів на оплату 30%</span>
            </div>
            <div className="hero-card-line">
              <b>Статус 3</b>
              <span>8 етапів обробки + Інвойс 40% + Водяні знаки</span>
            </div>
            <div className="hero-card-line">
              <b>Статус 4</b>
              <span>Фінал 30% + Доставка DHL по всьому світу</span>
            </div>
          </div>
        </div>
      </section>

      <section className="page-wrap">
        <HomeCalculator onResults={() => {}} />
      </section>
    </div>
  );
};

const MainRouter: React.FC = () => {
  const { user, loading, logout } = useAuth();
  const [publicRoute, setPublicRoute] = useState<AppRoute>(() => {
    const p = window.location.pathname.replace(/^\//, '');
    return (['home', 'vacancies', 'about'] as string[]).includes(p) ? (p as AppRoute) : 'home';
  });

  const [previewPublicSite, setPreviewPublicSite] = useState(false);

  useEffect(() => {
    const onPop = () => {
      const p = window.location.pathname.replace(/^\//, '');
      if (['home', 'vacancies', 'about'].includes(p)) {
        setPublicRoute(p as AppRoute);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigatePublic = (r: AppRoute) => {
    setPublicRoute(r);
    const path = r === 'home' ? '/' : `/${r}`;
    if (window.location.pathname !== path) {
      window.history.pushState({ route: r }, '', path);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return <div className="app-loading">Завантаження Vanguard…</div>;
  }

  const isAdmin = !!user?.roles.includes('ADMIN');
  const isManager = !!user?.roles.includes('MANAGER');
  const isStaff = isAdmin || isManager;

  // 1. АДМІНІСТРАТОР ТА МЕНЕДЖЕР -> Операційна консоль
  if (isStaff && !previewPublicSite) {
    return (
      <div className="staff-workspace">
        <div className="staff-top-strip">
          <span>
            {isAdmin ? '🛡️ РЕЖИМ АДМІНІСТРАТОРА (EXECUTIVE CONSOLE)' : '💼 РЕЖИМ МЕНЕДЖЕРА (OPERATIONAL CONSOLE)'}
          </span>
          <div className="strip-actions">
            <button className="preview-btn" onClick={() => setPreviewPublicSite(true)}>
              <Eye size={14} /> Переглянути публічний сайт
            </button>
            <span className="user-email">{user?.email}</span>
            <button className="logout-btn" onClick={logout}>Вийти</button>
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
          <span>👁️ Ви переглядаєте публічний сайт у режимі персоналу</span>
          <button className="primary-btn compact-btn" onClick={() => setPreviewPublicSite(false)}>
            <LayoutDashboard size={14} /> Повернутися до Консолі керування
          </button>
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

  // 2. КЛІЄНТ -> Client Portal
  if (user) {
    return (
      <div className="app-shell">
        <header className="client-top-bar glass">
          <div className="brand">
            <span className="brand-mark">V</span>
            <div>
              <b>VANGUARD</b>
              <small>CLIENT WORKSPACE</small>
            </div>
          </div>
          <div className="client-nav-actions">
            <button
              className={publicRoute === 'vacancies' ? 'active text-btn' : 'text-btn'}
              onClick={() => navigatePublic(publicRoute === 'vacancies' ? 'home' : 'vacancies')}
            >
              {publicRoute === 'vacancies' ? '← Мій кабінет' : 'Каталог вакансій'}
            </button>
            <span className="user-badge">{user.fullName}</span>
            <button className="icon-btn" onClick={logout} title="Вийти">Вийти</button>
          </div>
        </header>

        <main>
          {publicRoute === 'vacancies' ? (
            <VacanciesPage onApply={() => navigatePublic('home')} />
          ) : (
            <ClientPortal />
          )}
        </main>

        <footer className="footer">
          <div>
            <b>VANGUARD GLOBAL MOBILITY</b>
            <span>Official Client Portal</span>
          </div>
          <span>© 2026 Vanguard. All rights reserved.</span>
        </footer>
      </div>
    );
  }

  // 3. ГІСТЬ -> Тільки публічний сайт
  return (
    <div className="app-shell">
      <Navbar route={publicRoute} setRoute={navigatePublic} />
      <main>
        {publicRoute === 'home' && <PublicHome go={navigatePublic} />}
        {publicRoute === 'vacancies' && <VacanciesPage onApply={() => {}} />}
        {publicRoute === 'about' && <AboutPage />}
      </main>
      <footer className="footer">
        <div>
          <b>VANGUARD GLOBAL MOBILITY</b>
          <span>Official European Corporate Mobility Platform</span>
        </div>
        <span>© 2026 Vanguard</span>
      </footer>
    </div>
  );
};

export const App = () => (
  <LanguageProvider>
    <AuthProvider>
      <MainRouter />
    </AuthProvider>
  </LanguageProvider>
);

export default App;
