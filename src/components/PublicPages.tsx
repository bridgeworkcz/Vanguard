import React, { useEffect, useState } from 'react';
import { MapPin, Clock, Home, ArrowRight, ShieldCheck, Building2, Briefcase } from 'lucide-react';
import { vacanciesApi, teamApi, contentApi } from '../services/api';
import { countries, visaProducts, processingLabels, priceFor } from '../config/catalog';
import type { Vacancy, TeamMember } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

export const defaultPartnersByCountry: Record<string, { name: string; sector: string; city: string }[]> = {
  Slovakia: [
    { name: 'Volkswagen Slovakia', sector: 'Автомобільне виробництво', city: 'Bratislava' },
    { name: 'Kia Slovakia s.r.o.', sector: 'Машинобудування та збірка', city: 'Žilina' },
    { name: 'Amazon Fulfillment SVK', sector: 'Логістика та склади', city: 'Sereď' }
  ],
  'Czech Republic': [
    { name: 'Škoda Auto a.s.', sector: 'Автомобільний сектор', city: 'Mladá Boleslav' },
    { name: 'Foxconn CZ', sector: 'Електроніка та збірка', city: 'Pardubice' },
    { name: 'Rohlík Group CZ', sector: 'Дистрибуція та логістика', city: 'Praha / Brno' }
  ],
  Germany: [
    { name: 'Siemens AG', sector: 'Промислові технології', city: 'München' },
    { name: 'DHL Supply Chain Hub', sector: 'Міжнародна логістика', city: 'Leipzig' },
    { name: 'Robert Bosch GmbH', sector: 'Виробництво автокомпонентів', city: 'Stuttgart' }
  ],
  Portugal: [
    { name: 'Volkswagen Autoeuropa', sector: 'Автомобілебудування', city: 'Palmela' },
    { name: 'Continental Mabor', sector: 'Шинна промисловість', city: 'Lousado' },
    { name: 'Jerónimo Martins SGPS', sector: 'Складська логістика', city: 'Lisboa' }
  ],
  Bulgaria: [
    { name: 'Sensata Technologies', sector: 'Електронне обладнання', city: 'Plovdiv' },
    { name: 'Yazaki Bulgaria', sector: 'Електропроводка для авто', city: 'Yambol' },
    { name: 'Gebrüder Weiss Bulgaria', sector: 'Складські комплекси', city: 'Sofia' }
  ],
  Italy: [
    { name: 'Barilla G. e R. Fratelli', sector: 'Харчова промисловість', city: 'Parma' },
    { name: 'Stellantis Italia', sector: 'Автомобільний концерн', city: 'Torino' },
    { name: 'BCube Global Logistics', sector: 'Промислова логістика', city: 'Casale Monferrato' }
  ],
  Norway: [
    { name: 'SalMar ASA', sector: 'Переробка морепродуктів', city: 'Frøya' },
    { name: 'Lerøy Seafood Group', sector: 'Аквакультура та експорт', city: 'Bergen' },
    { name: 'Posten Bring AS', sector: 'Поштова дистрибуція', city: 'Oslo' }
  ],
  Serbia: [
    { name: 'Linglong Tire Europe', sector: 'Шинне виробництво', city: 'Zrenjanin' },
    { name: 'Leoni Wiring Systems', sector: 'Кабельні мережі', city: 'Niš' },
    { name: 'Aptiv Mobility Services', sector: 'Автомобільна електроніка', city: 'Novi Sad' }
  ],
  Canada: [
    { name: 'Magna International', sector: 'Автомобільні компоненти', city: 'Aurora, ON' },
    { name: 'Maple Leaf Foods Inc.', sector: 'Харчове виробництво', city: 'Mississauga, ON' },
    { name: 'Amazon Canada Fulfillment', sector: 'Складська логістика', city: 'Vancouver / Toronto' }
  ],
  Hungary: [
    { name: 'Audi Hungaria Zrt.', sector: 'Автомобілебудування', city: 'Győr' },
    { name: 'Samsung SDI Hungary', sector: 'Акумуляторні батареї', city: 'Göd' },
    { name: 'Continental Hungary', sector: 'Автоматизовані системи', city: 'Budapest' }
  ],
  Poland: [
    { name: 'Amazon Fulfillment Polska', sector: 'Логістичні хаби', city: 'Wrocław / Poznań' },
    { name: 'LG Energy Solution', sector: 'Виробництво батарей для EV', city: 'Wrocław' },
    { name: 'Biedronka / Jerónimo Martins', sector: 'Розподільчі центри', city: 'Warszawa' }
  ],
  'New Zealand': [
    { name: 'Silver Fern Farms Ltd', sector: 'Харчова переробка', city: 'Dunedin' },
    { name: 'T&G Global Limited', sector: 'Сільськогосподарський експорт', city: 'Auckland' },
    { name: 'Fonterra Co-operative', sector: 'Агропромисловість', city: 'Hamilton' }
  ],
  Belarus: [
    { name: 'BelAZ / БЕЛАЗ', sector: 'Важке машинобудування', city: 'Zhodino' },
    { name: 'Santa Bremor / Санта Бремор', sector: 'Харчовий комплекс', city: 'Brest' },
    { name: 'MAZ / МАЗ', sector: 'Вантажне автомобілебудування', city: 'Minsk' }
  ]
};

export const HomeCalculator: React.FC<{ onResults?: (items: Vacancy[], selection: any) => void }> = () => {
  const [country, setCountry] = useState('Slovakia');
  const [proc, setProc] = useState<any>('STANDARD');
  const prod = visaProducts.find(x => x.country === country) || visaProducts[0];
  const price = priceFor(prod, proc);

  return (
    <section className="calculator glass">
      <div className="calculator-head">
        <div>
          <p className="eyebrow">ОФІЦІЙНИЙ РОЗРАХУНОК ВАРТОСТІ</p>
          <h2>Розрахуйте вартість візового супроводу</h2>
          <p className="muted">Всі тарифи фіксовані, включають юридичну підготовку документів та координацію з роботодавцем.</p>
        </div>
        <div className="calc-badge">
          <ShieldCheck size={16} /> Гарантія прозорості
        </div>
      </div>

      <div className="calc-grid">
        <label>
          Оберіть країну призначення
          <select value={country} onChange={e => setCountry(e.target.value)}>
            {countries.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <label>
          Тип візи / дозволу
          <input readOnly value={`${prod.name} (${prod.duration})`} />
        </label>

        <label>
          Терміновість виготовлення
          <select value={proc} onChange={e => setProc(e.target.value)}>
            {prod.allowedProcessing.map(p => (
              <option key={p} value={p}>{processingLabels[p]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="calc-result">
        <div>
          <span>Орієнтовний термін:</span>
          <b>{prod.productionMinWeeks}–{prod.productionMaxWeeks} тижнів</b>
        </div>
        <div>
          <span>Загальна вартість під ключ:</span>
          <strong>{price} EUR</strong>
        </div>
      </div>
    </section>
  );
};

export const VacanciesPage: React.FC<{ onApply?: () => void }> = () => {
  const [items, setItems] = useState<Vacancy[]>([]);
  const [country, setCountry] = useState('ALL');

  useEffect(() => {
    vacanciesApi.list().then(r => setItems(r.vacancies)).catch(() => {});
  }, []);

  const filtered = country === 'ALL' ? items : items.filter(x => x.country === country);

  return (
    <div className="page-wrap">
      <div className="section-hero">
        <p className="eyebrow">АКТИВНІ ВАКАНСІЇ</p>
        <h1>Гарячі пропозиції від роботодавців</h1>
        <p>Прямі контракти з європейськими заводами, складами та логістичними центрами.</p>
      </div>

      <div className="country-pills">
        <button className={country === 'ALL' ? 'active' : ''} onClick={() => setCountry('ALL')}>
          Всі країни
        </button>
        {countries.map(c => (
          <button key={c} className={country === c ? 'active' : ''} onClick={() => setCountry(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="vacancy-grid">
        {filtered.map(v => (
          <article className="vacancy-card glass" key={v.id}>
            <div className="vacancy-top">
              <span>{v.country}</span>
              <b>Квота: {v.quotaRemaining} місць</b>
            </div>
            <h2>{v.title}</h2>
            <p>{v.description}</p>
            <div className="vacancy-meta">
              <span><MapPin size={14} /> {v.country}</span>
              <span><Clock size={14} /> {v.workingHours || '40 год/тиждень'}</span>
              <span><Home size={14} /> {v.accommodation || 'Надається'}</span>
            </div>
            <div className="salary">{v.salaryNet || 'За домовленістю'}</div>
          </article>
        ))}
      </div>
    </div>
  );
};

export const AboutPage: React.FC = () => {
  const [c, setC] = useState<any>({ settings: {}, gallery: [] });
  const [team, setTeam] = useState<TeamMember[]>([]);

  useEffect(() => {
    Promise.all([contentApi.get(), teamApi.list()]).then(([x, t]) => {
      setC(x);
      setTeam(t.team.filter(m => m.isActive !== false));
    }).catch(() => {});
  }, []);

  const s = c.settings || {};

  return (
    <div className="page-wrap">
      <div className="section-hero">
        <p className="eyebrow">VANGUARD GLOBAL MOBILITY</p>
        <h1>{s.about_title || 'Про компанію Vanguard'}</h1>
        <p className="about-history">
          {s.about_history ||
            'Vanguard — провідна європейська компанія з легальної міжнародної трудової міграції. Ми забезпечуємо повний супровід: від контракту з акредитованим роботодавцем до отримання дозволів на роботу, віз та фізичної доставки документів.'}
        </p>
      </div>

      <div className="about-grid">
        <section className="panel glass">
          <Building2 size={24} />
          <h2>Юридична інформація</h2>
          <div className="detail-list">
            <span>Юридична особа: <b>{s.legal_entity || 'Vanguard Mobility Solutions s.r.o.'}</b></span>
            <span>Реєстраційний номер: <b>{s.registration_number || 'CZ-28941092'}</b></span>
            <span>Адреса реєстрації: <b>{s.legal_address || 'Na Poříčí 1047/26, 110 00 Praha 1, Czech Republic'}</b></span>
            <span>Гаряча лінія: <b>{s.support_phone || '+420 228 886 410'}</b></span>
            <span>Email: <b>{s.support_email || 'ops@vanguard-mobility.com'}</b></span>
          </div>
        </section>

        <section className="panel glass">
          <ShieldCheck size={24} />
          <h2>Ліцензія та сертифікація</h2>
          {s.license_image_url ? (
            <img className="license-image" src={s.license_image_url} alt="Ліцензія Vanguard" />
          ) : (
            <p className="muted">Офіційна ліцензія агентства зайнятості та сертифікати відповідності ЄС розміщені в офіційному реєстрі.</p>
          )}
        </section>
      </div>

      {team.length > 0 && (
        <section className="panel glass">
          <h2>Наша команда</h2>
          <div className="team-grid">
            {team.map(m => (
              <article className="team-card" key={m.id}>
                {m.photoUrl ? (
                  <img src={m.photoUrl} alt={m.fullName} />
                ) : (
                  <div className="team-avatar">V</div>
                )}
                <h3>{m.fullName}</h3>
                <b>{m.position}</b>
                <p>{m.bio}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* РОЗДІЛ: ЛОГОТИПИ ТА КАРТКИ ПАРТНЕРІВ ПО ВСІХ КРАЇНАХ */}
      <section className="panel glass partners-section">
        <h2>Партнери по країнах</h2>
        <p className="muted">
          Компанії-роботодавці в кожній країні, які мають ліцензовані квоти та регулярно працевлаштовують працівників з-за кордону:
        </p>

        <div className="partner-countries-grid">
          {Object.entries(defaultPartnersByCountry).map(([country, partnersList]) => (
            <div className="partner-country-card glass" key={country}>
              <div className="country-header">
                <h3>{country}</h3>
                <span className="badge">{partnersList.length} партнери</span>
              </div>
              <div className="partner-chips-list">
                {partnersList.map(p => (
                  <div className="partner-chip" key={p.name}>
                    <div className="partner-icon">
                      <Briefcase size={14} />
                    </div>
                    <div>
                      <b>{p.name}</b>
                      <small>{p.sector} • {p.city}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
