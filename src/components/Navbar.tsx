import React, { useState } from 'react';
import { Menu, X, Home, Briefcase, Info, Globe2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AuthModal } from './AuthModal';
import { useLanguage, Lang } from '../i18n/LanguageContext';

export type AppRoute = 'home' | 'vacancies' | 'about';

export const Navbar: React.FC<{
  route: AppRoute;
  setRoute: (r: AppRoute) => void;
}> = ({ route, setRoute }) => {
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [auth, setAuth] = useState(false);

  const links: [AppRoute, string, any][] = [
    ['home', t('home'), Home],
    ['vacancies', t('vacancies'), Briefcase],
    ['about', t('about'), Info]
  ];

  const go = (r: AppRoute) => {
    setRoute(r);
    setOpen(false);
  };

  return (
    <>
      <header className="top-nav glass">
        <div className="nav-inner">
          <button className="hamburger" onClick={() => setOpen(true)}>
            <Menu />
          </button>

          <button className="brand" onClick={() => go('home')}>
            <span className="brand-mark">V</span>
            <span>
              <b>VANGUARD</b>
              <small>GLOBAL MOBILITY</small>
            </span>
          </button>

          <nav className="desktop-nav">
            {links.map(([id, n, I]) => (
              <button
                key={id}
                className={route === id ? 'active' : ''}
                onClick={() => go(id)}
              >
                <I size={15} />
                {n}
              </button>
            ))}
          </nav>

          <div className="nav-right">
            <label className="lang-btn">
              <Globe2 size={14} />
              <select value={lang} onChange={e => setLang(e.target.value as Lang)}>
                <option value="EN">EN</option>
                <option value="CZ">CZ</option>
                <option value="UR">UR</option>
              </select>
            </label>

            {user ? (
              <button className="secondary-btn compact" onClick={logout}>
                {t('signOut')}
              </button>
            ) : (
              <button className="primary-btn compact" onClick={() => setAuth(true)}>
                {t('signIn')} / {t('register')}
              </button>
            )}
          </div>
        </div>
      </header>

      {open && (
        <div className="drawer-backdrop" onClick={() => setOpen(false)}>
          <aside className="drawer glass" onClick={e => e.stopPropagation()}>
            <div className="drawer-head">
              <button className="brand" onClick={() => go('home')}>
                <span className="brand-mark">V</span>
                <span>
                  <b>VANGUARD</b>
                  <small>GLOBAL MOBILITY</small>
                </span>
              </button>
              <button className="icon-btn" onClick={() => setOpen(false)}>
                <X />
              </button>
            </div>

            <nav className="drawer-nav">
              {links.map(([id, n, I]) => (
                <button key={id} onClick={() => go(id)}>
                  <I size={16} />
                  {n}
                </button>
              ))}
            </nav>

            <div className="drawer-bottom">
              {!user && (
                <button
                  className="primary-btn"
                  onClick={() => {
                    setAuth(true);
                    setOpen(false);
                  }}
                >
                  {t('signIn')}
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {auth && <AuthModal onClose={() => setAuth(false)} />}
    </>
  );
};
