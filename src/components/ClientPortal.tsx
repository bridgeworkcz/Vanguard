import React, { useEffect, useState } from 'react';
import {
  RefreshCw, Download, Upload, Clock, AlertTriangle, CheckCircle2,
  FileText, CreditCard, UserRound, Timer, Shield, Info, Eye
} from 'lucide-react';
import { applicationsApi, dossiersApi, vacanciesApi, documentsApi, paymentsApi, contentApi } from '../services/api';
import type { Application, ApplicantData, DocumentCategory, Dossier, DossierDocument, PaymentTransaction, Vacancy } from '../types';
import { downloadInvoice, downloadContract, downloadJobOffer, downloadWatermarkedPreview } from '../utils/pdf';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';

const stages = ['Application', 'Approved', 'Processing', 'Final payment'];

const processLabels: Record<string, string> = {
  IN_PROCESS: '1. В обробці / In process',
  EMPLOYER_SUBMITTED: '2. Подано до роботодавця / Submitted to employer',
  EMPLOYER_APPROVED_FOR_MINISTRY: '3. Роботодавець ухвалив подачу документів до міністерства',
  LEGAL_SERVICE: '4. Подано на юридичне обслуговування / Legal service',
  MINISTRY_SUBMITTED: '5. Подано до міністерства / Submitted to ministry',
  MINISTRY_REVIEW: '6. На розгляді міністерства / Ministry review',
  MINISTRY_APPROVED: '7. Схвалено міністерством / Ministry approved',
  FINAL_LEGAL_SERVICE: '8. На фінальному юридичному обслуговуванні / Final legal service'
};

const docs: { cat: DocumentCategory; label: string }[] = [
  { cat: 'POLICE_CLEARANCE', label: 'Довідка про несудимість / Police Clearance Certificate' },
  { cat: 'PASSPORT', label: 'Закордонний паспорт / Passport Scan' },
  { cat: 'EDUCATION_DIPLOMA', label: 'Диплом або кваліфікація / Diploma' },
  { cat: 'MEDICAL_CLEARANCE', label: 'Медична довідка / Medical Clearance' },
  { cat: 'PHOTO', label: 'Фото 3.5 x 4.5 см / Photo' },
  { cat: 'OTHER', label: 'Інші додаткові документи / Other' }
];

const countdownDays = (iso?: string) => {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Термін закінчився / Expired';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return `${d} днів ${h} год (${d}d ${h}h)`;
};

export const ClientPortal: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [apps, setApps] = useState<Application[]>([]);
  const [vacs, setVacs] = useState<Vacancy[]>([]);
  const [sel, setSel] = useState<Application | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [documents, setDocuments] = useState<DossierDocument[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [tab, setTabState] = useState<'overview' | 'application' | 'documents' | 'payments'>('overview');
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(Date.now());
  const [docCat, setDocCat] = useState<DocumentCategory>('POLICE_CLEARANCE');
  const [proof, setProof] = useState<File | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [txHash, setTxHash] = useState('');
  const [form, setForm] = useState<ApplicantData>({
    firstName: '',
    lastName: '',
    middleName: '',
    middleNameAbsent: false,
    birthDate: '',
    gender: '',
    citizenship: user?.email ? '' : '',
    criminalRecord: '',
    phone: user?.phone || '',
    previousVisa: '',
    travelWithFamily: ''
  });

  const setTab = (newTab: 'overview' | 'application' | 'documents' | 'payments') => {
    setTabState(newTab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', newTab);
    window.history.pushState({ tab: newTab }, '', url.toString());
  };

  useEffect(() => {
    const onPop = () => {
      const url = new URL(window.location.href);
      const t = url.searchParams.get('tab') as any;
      if (['overview', 'application', 'documents', 'payments'].includes(t)) {
        setTabState(t);
      } else {
        setTabState('overview');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [a, d, v] = await Promise.all([
        applicationsApi.list(),
        dossiersApi.list(),
        vacanciesApi.list()
      ]);
      setApps(a.applications);
      setVacs(v.vacancies);
      const active = sel ? a.applications.find(x => x.id === sel.id) || a.applications[0] : a.applications[0];
      setSel(active || null);

      if (active) {
        let parsed: any = {};
        try {
          parsed = JSON.parse(active.applicantData || '{}');
        } catch {}
        setForm(f => ({ ...f, ...parsed, phone: parsed.phone || user?.phone || f.phone }));
        const dd = d.dossiers.find(x => x.userId === active.userId && x.vacancyId === active.vacancyId && x.totalCost === active.totalCost);
        setDossier(dd || null);
        if (dd) {
          const [x, y] = await Promise.all([
            documentsApi.list(dd.id),
            paymentsApi.list(dd.id)
          ]);
          setDocuments(x.documents);
          setPayments(y.payments);
        }
      } else {
        setDossier(null);
        setDocuments([]);
        setPayments([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    contentApi.get().then(x => setSettings(x.settings)).catch(() => {});
  }, []);

  useEffect(() => {
    const i = setInterval(() => setTick(Date.now()), 60000);
    return () => clearInterval(i);
  }, []);

  const stage = sel?.stage ?? 0;
  const vacancy = vacs.find(v => v.id === sel?.vacancyId);

  const duePct =
    stage === 2
      ? 30
      : stage === 3 && sel?.processStage === 'EMPLOYER_APPROVED_FOR_MINISTRY'
      ? 40
      : stage === 4
      ? 30
      : 0;

  const dueAmount = dossier && duePct ? Math.round(dossier.totalCost * duePct) / 100 : 0;
  const finalDocs = documents.filter(x => x.category === 'FINAL_DOCUMENT');

  const hasStage2Receipt = payments.some(
    p => (p.tranchePercent === 30 || p.trancheKey === 'FIRST_30') && p.status !== 'REJECTED'
  );

  const saveApplicant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sel || !user) return;
    try {
      const r = await applicationsApi.update({
        action: 'updateApplicant',
        applicationId: sel.id,
        userId: user.id,
        applicantData: form
      });
      setSel(r.application);
      alert('Дані анкети успішно збережено.');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Помилка збереження');
    }
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !dossier) return;
    try {
      const b = await new Promise<string>((ok, no) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).split(',')[1]);
        r.onerror = no;
        r.readAsDataURL(f);
      });
      await documentsApi.upload({
        dossierId: dossier.id,
        category: docCat,
        fileName: f.name,
        mimeType: f.type,
        fileBase64: b
      });
      setDocuments((await documentsApi.list(dossier.id)).documents);
      alert('Документ успішно завантажено!');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Помилка завантаження');
    } finally {
      e.target.value = '';
    }
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dossier || !duePct) return;
    try {
      if (!proof) throw new Error('Будь ласка, прикріпіть файл квитанції або скріншот оплати.');
      const b = await new Promise<string>((ok, no) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).split(',')[1]);
        r.onerror = no;
        r.readAsDataURL(proof);
      });
      await paymentsApi.submit({
        dossierId: dossier.id,
        amount: dueAmount,
        currency: dossier.currency,
        network: 'TRC-20',
        txHash,
        stage,
        tranchePercent: duePct,
        proofBase64: b,
        proofFileName: proof.name,
        proofMimeType: proof.type
      });
      alert('Квитанцію про оплату успішно надіслано на перевірку адміністратору!');
      setProof(null);
      setTxHash('');
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Помилка надсилання оплати');
    }
  };

  if (loading) {
    return (
      <div className="page-wrap">
        <div className="skeleton-card glass">Завантаження безпечного кабінету клієнта…</div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="portal-hero glass">
        <div>
          <p className="eyebrow">ОСОБИСТИЙ КАБІНЕТ КЛІЄНТА</p>
          <h1>{user?.fullName}</h1>
          <p>Керування заявками, завантаження документів, генерація інвойсів та відстеження етапів виготовлення.</p>
        </div>
        <button className="icon-btn" onClick={() => void load()} title="Оновити">
          <RefreshCw />
        </button>
      </div>

      {apps.length > 1 && (
        <div className="application-switcher">
          {apps.map(a => (
            <button
              key={a.id}
              className={sel?.id === a.id ? 'active' : ''}
              onClick={() => setSel(a)}
            >
              {a.id}
              <small>{a.country} • Статус {a.stage}</small>
            </button>
          ))}
        </div>
      )}

      {sel && (
        <div className="stage-track">
          {stages.map((x, i) => (
            <div className={stage >= i + 1 ? 'stage-node active' : 'stage-node'} key={x}>
              <span>Статус {i + 1}</span>
              <b>{x}</b>
            </div>
          ))}
        </div>
      )}

      <div className="portal-tabs">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
          {t('status')}
        </button>
        <button className={tab === 'application' ? 'active' : ''} onClick={() => setTab('application')}>
          <UserRound size={15} /> {t('application')}
        </button>
        <button className={tab === 'documents' ? 'active' : ''} onClick={() => setTab('documents')}>
          <FileText size={15} /> {t('documents')}
        </button>
        <button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>
          <CreditCard size={15} /> {t('payments')}
        </button>
      </div>

      {!sel && (
        <section className="panel glass empty-state">
          У вас ще немає активних заявок. Скористайтеся калькулятором на головній сторінці для вибору візової послуги.
        </section>
      )}

      {sel && tab === 'overview' && (
        <div className="portal-grid">
          <section className="panel glass">
            <h2>Поточний статус заявки</h2>
            <div className="status-big">
              Статус {stage}
              <small>{sel.status}</small>
            </div>

            <div className="detail-list">
              <span>Номер заявки: <b>{sel.id}</b></span>
              <span>Позиція / вакансія: <b>{vacancy?.title || sel.vacancyId}</b></span>
              <span>Країна: <b>{sel.country}</b></span>
              <span>Загальна вартість: <b>{sel.totalCost} {sel.currency}</b></span>
              <span>Швидкість обробки: <b>{sel.processingOption || 'STANDARD'}</b></span>
              {sel.processStage && (
                <span>Етап оформлення: <b>{processLabels[sel.processStage]}</b></span>
              )}
            </div>

            {stage === 2 && (
              <div className="countdown-card warning-box">
                <Clock className="pulsing" />
                <div>
                  <b>Відлік до анулювання заявки</b>
                  <strong>{countdownDays(sel.paymentDeadlineAt)}</strong>
                  <small>
                    {hasStage2Receipt
                      ? '✓ Квитанцію про оплату завантажено! Очікується схвалення адміністратором.'
                      : '⚠️ Якщо не завантажено квитанцію/скріншот про оплату 30%, заявка буде автоматично анульована (термін: 5 днів з моменту схвалення).'}
                  </small>
                </div>
              </div>
            )}

            {stage === 3 && (
              <div className="status-3-box">
                <div className="countdown-card">
                  <Timer />
                  <div>
                    <b>Кількість днів до завершення виготовлення:</b>
                    <strong>{countdownDays(sel.documentDeadlineAt)}</strong>
                    <small>Поточний етап: {processLabels[sel.processStage || 'IN_PROCESS']}</small>
                  </div>
                </div>

                <div className="process-stepper">
                  <h4>Етапи обробки ваших документів:</h4>
                  <ol className="stepper-list">
                    {Object.entries(processLabels).map(([key, label], idx) => {
                      const stagesArr = Object.keys(processLabels);
                      const currentIdx = stagesArr.indexOf(sel.processStage || 'IN_PROCESS');
                      const isDone = currentIdx > idx;
                      const isCurrent = currentIdx === idx;
                      return (
                        <li key={key} className={isCurrent ? 'active' : isDone ? 'done' : ''}>
                          <span className="step-num">{idx + 1}</span>
                          <span className="step-text">{label}</span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            )}

            {stage === 4 && (
              <div className="final-notice glass-card">
                <CheckCircle2 size={24} color="#4ade80" />
                <div>
                  <b>Фінальний етап оплати — 30% від вартості послуги</b>
                  <p>
                    Вітаємо! Ваші візові документи виготовлено. Настав фінальний етап оплати 30%, який передбачає відправку оригіналів документів курʼєрською поштою по всьому світу (DHL тощо) або надання логінів та паролів до державних вебпорталів для авторизації та перевірки отримання візи.
                  </p>
                  <p className="highlight-text">
                    ⚠️ Клієнт зобовʼязаний сплатити фінальний інвойс до моменту закінчення терміну дії візи!
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="panel glass">
            <h2>Доступні дії та документи</h2>
            <div className="action-grid">
              {stage === 2 && dossier && (
                <>
                  <button onClick={() => downloadInvoice(dossier, 2, settings)}>
                    <Download /> Завантажити Інвойс №1 • 30%
                  </button>
                  <button onClick={() => user && downloadContract(dossier, user, settings)}>
                    <Download /> Завантажити Договір на обслуговування
                  </button>
                  <button onClick={() => user && downloadJobOffer(user, dossier, vacancy, settings)}>
                    <Download /> Шаблон робочої пропозиції (Job offer)
                  </button>
                </>
              )}

              {stage === 3 && sel.processStage === 'EMPLOYER_APPROVED_FOR_MINISTRY' && dossier && (
                <div className="invoice-2-card">
                  <div className="info-banner">
                    <Info size={16} /> Роботодавець ухвалив документи! Доступна оплата другого етапу (40%). На оплату надається 14 днів.
                  </div>
                  <button className="primary-btn pulse" onClick={() => downloadInvoice(dossier, 3, settings)}>
                    <Download /> Сформувати Інвойс №2 • 40% (термін 14 днів)
                  </button>
                </div>
              )}

              {stage === 4 && dossier && (
                <div className="invoice-3-card">
                  <button className="primary-btn" onClick={() => downloadInvoice(dossier, 4, settings)}>
                    <Download /> Сформувати Фінальний Інвойс №3 • 30%
                  </button>
                </div>
              )}

              {stage >= 3 && finalDocs.length > 0 && (
                <div className="final-download-box">
                  <b>Фінальні документи з водяним знаком (Watermark):</b>
                  <p className="small-muted">
                    Перевірте копії документів. Оригінали без водяного знаку надсилаються після завершення Статусу 4.
                  </p>
                  {finalDocs.map(d => (
                    <div key={d.id} className="doc-row-action">
                      <button className="secondary-btn" onClick={() => user && downloadWatermarkedPreview(d.fileName, user.fullName, dossier?.id || sel.id)}>
                        <Eye size={15} /> Переглянути з водяним знаком
                      </button>
                      <button onClick={() => void documentsApi.download(d.id)}>
                        <Download size={15} /> {d.fileName}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {sel && tab === 'application' && (
        <section className="panel glass">
          <h2>Дані заявника для подачі на візу</h2>
          <p className="muted">Всі поля мають точно збігатися з закордонним паспортом.</p>
          <form onSubmit={saveApplicant} className="form-grid three">
            <input required placeholder="Ім'я (First name)" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
            <input required placeholder="Прізвище (Last name)" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
            <input disabled={form.middleNameAbsent} placeholder="По батькові (Middle name)" value={form.middleName || ''} onChange={e => setForm({ ...form, middleName: e.target.value })} />
            <label className="check">
              <input type="checkbox" checked={form.middleNameAbsent} onChange={e => setForm({ ...form, middleNameAbsent: e.target.checked, middleName: e.target.checked ? '' : form.middleName })} />
              Відсутнє в закордонному паспорті
            </label>
            <label>
              Дата народження
              <input required type="date" value={form.birthDate} onChange={e => setForm({ ...form, birthDate: e.target.value })} />
            </label>
            <label>
              Стать
              <select required value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                <option value="">Оберіть</option>
                <option>Чоловіча (Male)</option>
                <option>Жіноча (Female)</option>
                <option>Інша</option>
              </select>
            </label>
            <input required placeholder="Громадянство" value={form.citizenship} onChange={e => setForm({ ...form, citizenship: e.target.value })} />
            <select required value={form.criminalRecord} onChange={e => setForm({ ...form, criminalRecord: e.target.value })}>
              <option value="">Чи є судимість?</option>
              <option value="No">Ні (Відсутня)</option>
              <option value="Yes">Так</option>
            </select>
            <input required placeholder="Контактний телефон" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <select required value={form.previousVisa} onChange={e => setForm({ ...form, previousVisa: e.target.value })}>
              <option value="">Чи були візи до обраної країни?</option>
              <option value="No">Ні</option>
              <option value="Yes">Так</option>
            </select>
            <select required value={form.travelWithFamily} onChange={e => setForm({ ...form, travelWithFamily: e.target.value })}>
              <option value="">Виїзд сам чи з сім'єю?</option>
              <option value="Alone">Самостійно</option>
              <option value="Family">З сім'єю</option>
            </select>
            <button className="primary-btn" type="submit">{t('save')}</button>
          </form>
        </section>
      )}

      {sel && tab === 'documents' && (
        <section className="panel glass">
          <h2>Сховище документів клієнта</h2>
          {stage < 2 ? (
            <div className="notice">
              <AlertTriangle /> Завантаження документів стає доступним на Статусі 2 після первинного схвалення заявки.
            </div>
          ) : !dossier ? (
            <p className="muted">Ваше досьє формується…</p>
          ) : (
            <>
              <div className="upload-instruction">
                <Shield size={18} />
                <span>
                  На цій стадії необхідно завантажити якісні фото або скани всіх документів для відкриття візи, <b>обовʼязково включаючи довідку про несудимість</b>.
                </span>
              </div>

              <div className="upload-bar">
                <select value={docCat} onChange={e => setDocCat(e.target.value as DocumentCategory)}>
                  {docs.map(x => (
                    <option key={x.cat} value={x.cat}>{x.label}</option>
                  ))}
                </select>

                <label className="primary-btn">
                  <Upload /> Завантажити скан / фото
                  <input hidden type="file" accept="image/*,.pdf" onChange={upload} />
                </label>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Назва документа</th>
                      <th>Категорія</th>
                      <th>Статус перевірки</th>
                      <th>Дата завантаження</th>
                      <th>Дія</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map(d => (
                      <tr key={d.id}>
                        <td>{d.fileName}</td>
                        <td><small>{d.category}</small></td>
                        <td>
                          <span className={`status-pill ${d.status.toLowerCase()}`}>
                            {d.status === 'APPROVED' ? 'Схвалено' : d.status === 'REJECTED' ? 'Відхилено' : 'На перевірці'}
                          </span>
                        </td>
                        <td>{new Date(d.uploadedAt).toLocaleDateString()}</td>
                        <td>
                          {d.status === 'APPROVED' && (
                            <button className="small-btn" onClick={() => void documentsApi.download(d.id)}>
                              Завантажити
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {documents.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center muted">Ще не завантажено жодного документа.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {sel && tab === 'payments' && (
        <div className="portal-grid">
          <section className="panel glass">
            <h2>Графік та історія платежів (30% / 40% / 30%)</h2>
            <div className="payment-steps">
              <div className={`step-box ${stage >= 2 ? 'active' : ''}`}>
                <b>30%</b>
                <small>Статус 2 (Аванс)</small>
              </div>
              <div className={`step-box ${stage >= 3 && sel.processStage === 'EMPLOYER_APPROVED_FOR_MINISTRY' ? 'active' : ''}`}>
                <b>40%</b>
                <small>Схвалення роботодавцем</small>
              </div>
              <div className={`step-box ${stage >= 4 ? 'active' : ''}`}>
                <b>30%</b>
                <small>Фінальна відправка візи</small>
              </div>
            </div>

            <p className="total-due">Загальна вартість послуги: <b>{dossier?.totalCost || sel.totalCost} EUR</b></p>

            <div className="payment-history">
              {payments.map(p => (
                <div className="list-row" key={p.id}>
                  <span>{p.trancheKey || `${p.tranchePercent}%`} • {p.amount} {p.currency}</span>
                  <b className={`status-text ${p.status.toLowerCase()}`}>{p.status}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="panel glass">
            <h2>Завантаження квитанції / скріншота оплати</h2>
            {!duePct ? (
              <p className="muted">Наразі немає активних платежів до оплати.</p>
            ) : (
              <form className="form-grid" onSubmit={submitPayment}>
                <div className="payment-due">
                  <span>До сплати на цьому етапі:</span>
                  <strong>{duePct}% • {dueAmount.toFixed(2)} EUR</strong>
                </div>

                <input
                  required
                  placeholder="Хеш транзакції або коментар до переказу"
                  value={txHash}
                  onChange={e => setTxHash(e.target.value)}
                />

                <label className="secondary-btn file-label">
                  <Upload /> {proof ? proof.name : 'Прикріпити квитанцію / скріншот оплати'}
                  <input hidden type="file" accept="image/*,.pdf" onChange={e => setProof(e.target.files?.[0] || null)} />
                </label>

                <button className="primary-btn" type="submit">
                  Надіслати підтвердження на перевірку
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
