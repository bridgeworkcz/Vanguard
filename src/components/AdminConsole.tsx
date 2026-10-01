import React, { useEffect, useState } from 'react';
import {
  RefreshCw, Plus, Save, Archive, Check, X, Upload, Shield,
  FileText, Users, Briefcase, CreditCard, Settings, History,
  ClipboardList, Download, Tag, DollarSign, Database, AlertCircle, MessageSquare
} from 'lucide-react';
import {
  adminApi, applicationsApi, contentApi, teamApi, vacanciesApi,
  paymentsApi, documentsApi, pricingApi
} from '../services/api';
import { visaProducts } from '../config/catalog';
import type {
  Application, Vacancy, TeamMember, PaymentTransaction,
  DossierDocument, User, PricingItem, SystemSetting
} from '../types';

export type AdminSection =
  | 'dashboard'
  | 'applications'
  | 'clients'
  | 'vacancies'
  | 'documents'
  | 'payments'
  | 'team'
  | 'content'
  | 'pricing'
  | 'settings'
  | 'audit';

const processStages = [
  'IN_PROCESS',
  'EMPLOYER_SUBMITTED',
  'EMPLOYER_APPROVED_FOR_MINISTRY',
  'LEGAL_SERVICE',
  'MINISTRY_SUBMITTED',
  'MINISTRY_REVIEW',
  'MINISTRY_APPROVED',
  'FINAL_LEGAL_SERVICE'
];

export const AdminConsole: React.FC<{ limited?: boolean }> = ({ limited = false }) => {
  const [tab, setTab] = useState<AdminSection>('dashboard');
  const [apps, setApps] = useState<Application[]>([]);
  const [vacs, setVacs] = useState<Vacancy[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [pays, setPays] = useState<PaymentTransaction[]>([]);
  const [docs, setDocs] = useState<DossierDocument[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [pricing, setPricing] = useState<PricingItem[]>([]);
  const [sysSettings, setSysSettings] = useState<SystemSetting[]>([]);
  const [content, setContent] = useState<any>({ settings: {}, gallery: [] });

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editVac, setEditVac] = useState<Partial<Vacancy> | null>(null);
  const [editTeam, setEditTeam] = useState<Partial<TeamMember> | null>(null);
  const [manualApp, setManualApp] = useState<{ userId: string; vacancyId: string; processingOption: string } | null>(null);
  const [newPrice, setNewPrice] = useState<Partial<PricingItem> | null>(null);
  const [dashStats, setDashStats] = useState<any>({});

  const loadAll = async () => {
    setLoading(true);
    try {
      const [a, v, t, c, p, d, allDocs, dash] = await Promise.all([
        applicationsApi.list(),
        vacanciesApi.list(),
        teamApi.list(),
        contentApi.get(),
        paymentsApi.list(),
        dossiersApiListSafe(),
        documentsApi.list(),
        adminApi.dashboard()
      ]);
      setApps(a.applications);
      setVacs(v.vacancies);
      setTeam(t.team);
      setContent(c);
      setPays(p.payments);
      setDocs(allDocs.documents);
      setDashStats(dash);

      if (!limited) {
        const [u, l, pr, st] = await Promise.all([
          adminApi.users(),
          adminApi.audit(),
          pricingApi.list(),
          adminApi.settings()
        ]);
        setUsers(u.users);
        setLogs(l.logs);
        setPricing(pr.items);
        setSysSettings(st.settings);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  async function dossiersApiListSafe() {
    try {
      const r = await fetch('/api/dossiers', {
        headers: { Authorization: `Bearer ${localStorage.getItem('vanguard_token')}` }
      });
      return await r.json();
    } catch {
      return { dossiers: [] };
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const handleRoleToggle = async (u: User, role: 'CLIENT' | 'MANAGER' | 'ADMIN') => {
    const has = u.roles.includes(role);
    const newRoles = has ? u.roles.filter(r => r !== role) : [...u.roles, role];
    if (newRoles.length === 0) return alert('У користувача має бути хоча б одна роль');
    await adminApi.updateUser({ userId: u.id, roles: newRoles });
    await loadAll();
  };

  const handleUserStatusToggle = async (u: User) => {
    await adminApi.updateUser({ userId: u.id, isActive: !(u as any).isActive });
    await loadAll();
  };

  const updateStage = async (a: Application, stage: number, status?: string) => {
    await applicationsApi.update({ action: 'updateStage', applicationId: a.id, stage, status, override: true });
    await loadAll();
  };

  const updateProcess = async (a: Application, ps: string) => {
    await applicationsApi.update({ action: 'updateProcessStage', applicationId: a.id, processStage: ps });
    await loadAll();
  };

  const uploadFinalDocument = async (app: Application, file: File) => {
    const b = await new Promise<string>((ok, no) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(',')[1] || '');
      r.onerror = no;
      r.readAsDataURL(file);
    });
    const dRes = await dossiersApiListSafe();
    const d = (dRes.dossiers || []).find((x: any) => x.userId === app.userId && x.vacancyId === app.vacancyId);
    if (!d) return alert('Досьє не знайдено');
    await documentsApi.upload({
      dossierId: d.id,
      category: 'FINAL_DOCUMENT',
      fileName: file.name,
      mimeType: file.type,
      fileBase64: b
    });
    alert('Фінальний документ клієнта успішно завантажено!');
    await loadAll();
  };

  const triggerDriveBackup = async () => {
    if (!confirm('Створити повну резервну копію всіх таблиць у захищеній папці Google Drive?')) return;
    try {
      await adminApi.backup();
      alert('Резервну копію успішно збережено в Google Drive!');
      await loadAll();
    } catch (e: any) {
      alert(`Помилка: ${e.message}`);
    }
  };

  const savePriceItem = async () => {
    if (!newPrice?.name || newPrice?.amount === undefined) return;
    await adminApi.savePricing(newPrice);
    setNewPrice(null);
    await loadAll();
  };

  const saveSettingKey = async (k: string, v: string) => {
    await contentApi.saveSetting(k, v);
    await loadAll();
  };

  const navItems: { id: AdminSection; label: string; icon: any }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Shield },
    { id: 'applications', label: 'Applications', icon: ClipboardList },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'vacancies', label: 'Vacancies', icon: Briefcase },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'content', label: 'Content', icon: Settings },
    { id: 'pricing', label: 'Pricing', icon: DollarSign },
    { id: 'settings', label: 'Settings', icon: Database },
    { id: 'audit', label: 'Audit Log', icon: History }
  ];

  const visibleNav = limited
    ? navItems.filter(x => ['dashboard', 'applications', 'clients', 'vacancies', 'documents', 'payments'].includes(x.id))
    : navItems;

  return (
    <div className="admin-shell">
      <aside className="admin-side glass">
        <div className="admin-brand">
          <span className="brand-mark">V</span>
          <div>
            <b>VANGUARD</b>
            <small>{limited ? 'MANAGEMENT' : 'ADMIN CONSOLE'}</small>
          </div>
        </div>

        <nav className="console-menu">
          {visibleNav.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={tab === item.id ? 'active' : ''}
                onClick={() => setTab(item.id)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="admin-side-foot">
          <span className="role-tag">{limited ? 'MANAGER' : 'ADMIN'}</span>
        </div>
      </aside>

      <main className="admin-main">
        <div className="admin-top">
          <div>
            <p className="eyebrow">OPERATIONAL CONSOLE</p>
            <h1>{navItems.find(x => x.id === tab)?.label}</h1>
          </div>
          <button className="icon-btn" onClick={() => void loadAll()} title="Оновити дані">
            <RefreshCw className={loading ? 'spin' : ''} />
          </button>
        </div>

        {tab === 'dashboard' && (
          <div className="tab-dashboard">
            <div className="stat-grid">
              <div className="stat-card glass">
                <span>Всього заявок</span>
                <strong>{apps.length}</strong>
              </div>
              <div className="stat-card glass highlight-green">
                <span>Активні у процесі</span>
                <strong>{dashStats.openApplications || apps.filter(x => !['REJECTED', 'CANCELLED'].includes(x.status)).length}</strong>
              </div>
              <div className="stat-card glass highlight-yellow">
                <span>Очікують перевірки оплати</span>
                <strong>{dashStats.pendingPayments || pays.filter(x => x.status === 'PENDING_REVIEW').length}</strong>
              </div>
              <div className="stat-card glass highlight-blue">
                <span>Документи на модерації</span>
                <strong>{dashStats.pendingDocuments || docs.filter(x => x.status === 'UPLOADED').length}</strong>
              </div>
            </div>

            <div className="dashboard-columns">
              <section className="panel glass">
                <h2>Термінові задачі</h2>
                <div className="task-queue">
                  {pays.filter(x => x.status === 'PENDING_REVIEW').map(p => (
                    <div className="task-item" key={p.id}>
                      <CreditCard size={18} />
                      <div>
                        <b>Новий платіж {p.amount} {p.currency} ({p.tranchePercent}%)</b>
                        <small>Хеш: {p.txHash} • Досьє: {p.dossierId}</small>
                      </div>
                      <button className="small-btn" onClick={() => setTab('payments')}>Перевірити</button>
                    </div>
                  ))}
                  {docs.filter(x => x.status === 'UPLOADED').map(d => (
                    <div className="task-item" key={d.id}>
                      <FileText size={18} />
                      <div>
                        <b>Новий документ: {d.fileName}</b>
                        <small>Категорія: {d.category} • {d.dossierId}</small>
                      </div>
                      <button className="small-btn" onClick={() => setTab('documents')}>Переглянути</button>
                    </div>
                  ))}
                  {pays.filter(x => x.status === 'PENDING_REVIEW').length === 0 &&
                    docs.filter(x => x.status === 'UPLOADED').length === 0 && (
                      <p className="muted">Всі оплати та документи перевірені. Черга порожня.</p>
                    )}
                </div>
              </section>

              <section className="panel glass">
                <h2>Розподіл за статусами</h2>
                <div className="stage-distribution">
                  <div className="dist-row">
                    <span>Статус 1 (Подання анкети):</span>
                    <b>{apps.filter(x => x.stage === 1).length}</b>
                  </div>
                  <div className="dist-row">
                    <span>Статус 2 (Схвалено, збір сканів + 30%):</span>
                    <b>{apps.filter(x => x.stage === 2).length}</b>
                  </div>
                  <div className="dist-row">
                    <span>Статус 3 (Виготовлення + 8 етапів):</span>
                    <b>{apps.filter(x => x.stage === 3).length}</b>
                  </div>
                  <div className="dist-row">
                    <span>Статус 4 (Фінал 30% + Доставка):</span>
                    <b>{apps.filter(x => x.stage === 4).length}</b>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {tab === 'applications' && (
          <section className="panel glass">
            <div className="panel-head">
              <h2>Керування заявками</h2>
              <button
                className="primary-btn"
                onClick={() => setManualApp({ userId: users[0]?.id || '', vacancyId: vacs[0]?.id || '', processingOption: 'STANDARD' })}
              >
                <Plus size={16} /> Створити заявку вручну
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID заявки / Клієнт</th>
                    <th>Країна / Послуга</th>
                    <th>Статус</th>
                    <th>8 Етапів (для Статусу 3)</th>
                    <th>Дії / Фінальні файли</th>
                  </tr>
                </thead>
                <tbody>
                  {apps.map(a => (
                    <tr key={a.id}>
                      <td>
                        <b>{a.id}</b>
                        <small>{a.userId}</small>
                      </td>
                      <td>
                        {a.country}
                        <small>{a.totalCost} {a.currency}</small>
                      </td>
                      <td>
                        <select value={a.stage} onChange={e => void updateStage(a, Number(e.target.value))}>
                          <option value={1}>Статус 1: Подано</option>
                          <option value={2}>Статус 2: Схвалено (Скани + 30%)</option>
                          <option value={3}>Статус 3: Виготовлення</option>
                          <option value={4}>Статус 4: Фінал 30% (DHL)</option>
                        </select>
                      </td>
                      <td>
                        {a.stage === 3 ? (
                          <select
                            value={a.processStage || 'IN_PROCESS'}
                            onChange={e => void updateProcess(a, e.target.value)}
                          >
                            {processStages.map((ps, idx) => (
                              <option key={ps} value={ps}>
                                {idx + 1}. {ps}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {a.stage === 3 && a.processStage === 'FINAL_LEGAL_SERVICE' ? (
                          <label className="primary-btn compact-btn">
                            <Upload size={14} /> Завантажити фінальний документ
                            <input
                              hidden
                              type="file"
                              accept="image/*,.pdf"
                              onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) void uploadFinalDocument(a, f);
                              }}
                            />
                          </label>
                        ) : (
                          <span className="muted">В роботі</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {manualApp && (
              <div className="modal-card glass">
                <h3>Створити нову заявку клієнту</h3>
                <div className="form-grid three">
                  <label>
                    Клієнт
                    <select
                      value={manualApp.userId}
                      onChange={e => setManualApp({ ...manualApp, userId: e.target.value })}
                    >
                      {users.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.fullName} ({u.email})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Вакансія / Країна
                    <select
                      value={manualApp.vacancyId}
                      onChange={e => setManualApp({ ...manualApp, vacancyId: e.target.value })}
                    >
                      {vacs.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.title} ({v.country})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Терміновість
                    <select
                      value={manualApp.processingOption}
                      onChange={e => setManualApp({ ...manualApp, processingOption: e.target.value })}
                    >
                      <option value="STANDARD">Standard</option>
                      <option value="PRIORITY">Priority</option>
                      <option value="EXPRESS">Express</option>
                    </select>
                  </label>
                </div>
                <div className="row-actions">
                  <button
                    className="primary-btn"
                    onClick={async () => {
                      await applicationsApi.create({ ...manualApp, applicantData: {} });
                      setManualApp(null);
                      await loadAll();
                    }}
                  >
                    Створити
                  </button>
                  <button className="secondary-btn" onClick={() => setManualApp(null)}>Скасувати</button>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === 'clients' && (
          <section className="panel glass">
            <h2>Клієнти та керування ролями</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Користувач / Email</th>
                    <th>Телефон</th>
                    <th>Ролі (CLIENT / MANAGER / ADMIN)</th>
                    <th>Статус</th>
                    <th>Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>
                        <b>{u.fullName}</b>
                        <small>{u.email}</small>
                      </td>
                      <td>{u.phone || '—'}</td>
                      <td>
                        <div className="role-checkboxes">
                          {(['CLIENT', 'MANAGER', 'ADMIN'] as const).map(r => (
                            <label key={r} className="check-chip">
                              <input
                                type="checkbox"
                                checked={u.roles.includes(r)}
                                onChange={() => void handleRoleToggle(u, r)}
                              />
                              {r}
                            </label>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={`status-pill ${(u as any).isActive !== false ? 'active' : 'blocked'}`}>
                          {(u as any).isActive !== false ? 'Активний' : 'Заблокований'}
                        </span>
                      </td>
                      <td>
                        <button className="small-btn" onClick={() => void handleUserStatusToggle(u)}>
                          {(u as any).isActive !== false ? 'Заблокувати' : 'Розблокувати'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'vacancies' && (
          <section className="panel glass">
            <div className="panel-head">
              <h2>Каталог вакансій</h2>
              <div className="row-actions">
                <button
                  className="secondary-btn"
                  onClick={async () => {
                    await vacanciesApi.seedCatalog();
                    await loadAll();
                  }}
                >
                  Засіяти 14 країн
                </button>
                <button
                  className="primary-btn"
                  onClick={() => setEditVac({ isActive: true, quotaRemaining: 5, processingOptions: ['STANDARD'] })}
                >
                  <Plus size={16} /> Додати вакансію
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Країна / Назва</th>
                    <th>Категорія</th>
                    <th>Квота</th>
                    <th>Зарплата Net</th>
                    <th>Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {vacs.map(v => (
                    <tr key={v.id}>
                      <td>
                        <b>{v.title}</b>
                        <small>{v.country}</small>
                      </td>
                      <td>{v.category}</td>
                      <td>{v.quotaRemaining}</td>
                      <td>{v.salaryNet}</td>
                      <td>
                        <button className="small-btn" onClick={() => setEditVac(v)}>Редагувати</button>
                        <button
                          className="small-btn danger"
                          onClick={async () => {
                            await vacanciesApi.archive(v.id);
                            await loadAll();
                          }}
                        >
                          Архів
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {editVac && (
              <div className="modal-card glass">
                <h3>{editVac.id ? 'Редагувати вакансію' : 'Створити вакансію'}</h3>
                <div className="form-grid three">
                  <input placeholder="Назва" value={editVac.title || ''} onChange={e => setEditVac({ ...editVac, title: e.target.value })} />
                  <input placeholder="Країна" value={editVac.country || ''} onChange={e => setEditVac({ ...editVac, country: e.target.value })} />
                  <input placeholder="Категорія" value={editVac.category || ''} onChange={e => setEditVac({ ...editVac, category: e.target.value })} />
                  <input placeholder="Зарплата Net" value={editVac.salaryNet || ''} onChange={e => setEditVac({ ...editVac, salaryNet: e.target.value })} />
                  <input type="number" placeholder="Квота" value={editVac.quotaRemaining ?? 5} onChange={e => setEditVac({ ...editVac, quotaRemaining: Number(e.target.value) })} />
                </div>
                <div className="row-actions">
                  <button
                    className="primary-btn"
                    onClick={async () => {
                      if (editVac.id) await vacanciesApi.update({ ...editVac, vacancyId: editVac.id });
                      else await vacanciesApi.create(editVac);
                      setEditVac(null);
                      await loadAll();
                    }}
                  >
                    Зберегти
                  </button>
                  <button className="secondary-btn" onClick={() => setEditVac(null)}>Скасувати</button>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === 'documents' && (
          <section className="panel glass">
            <h2>Черга перевірки документів клієнтів</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Файл</th>
                    <th>Категорія</th>
                    <th>Досьє</th>
                    <th>Статус</th>
                    <th>Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map(d => (
                    <tr key={d.id}>
                      <td>
                        <b>{d.fileName}</b>
                        <small>{new Date(d.uploadedAt).toLocaleString()}</small>
                      </td>
                      <td><span className="badge">{d.category}</span></td>
                      <td>{d.dossierId}</td>
                      <td>
                        <span className={`status-pill ${d.status.toLowerCase()}`}>{d.status}</span>
                      </td>
                      <td>
                        <button className="small-btn" onClick={() => void documentsApi.download(d.id)}>
                          <Download size={14} /> Завантажити
                        </button>
                        {d.status === 'UPLOADED' && (
                          <>
                            <button
                              className="small-btn success"
                              onClick={async () => {
                                await documentsApi.review({ documentId: d.id, status: 'APPROVED' });
                                await loadAll();
                              }}
                            >
                              <Check size={14} /> Схвалити
                            </button>
                            <button
                              className="small-btn danger"
                              onClick={async () => {
                                const r = prompt('Вкажіть причину відхилення документа:');
                                if (r) {
                                  await documentsApi.review({ documentId: d.id, status: 'REJECTED', rejectionReason: r });
                                  await loadAll();
                                }
                              }}
                            >
                              <X size={14} /> Відхилити
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'payments' && (
          <section className="panel glass">
            <h2>Верифікація оплат (30% / 40% / 30%)</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID / Транзакція</th>
                    <th>Досьє</th>
                    <th>Етап</th>
                    <th>Сума</th>
                    <th>Статус</th>
                    <th>Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {pays.map(p => (
                    <tr key={p.id}>
                      <td>
                        <b>{p.id}</b>
                        <small>{p.txHash}</small>
                      </td>
                      <td>{p.dossierId}</td>
                      <td>{p.trancheKey || `${p.tranchePercent}%`}</td>
                      <td>{p.amount} {p.currency}</td>
                      <td>
                        <span className={`status-pill ${p.status.toLowerCase()}`}>{p.status}</span>
                      </td>
                      <td>
                        {p.status === 'PENDING_REVIEW' && (
                          <div className="row-actions">
                            <button
                              className="small-btn success"
                              onClick={async () => {
                                await paymentsApi.review({ paymentId: p.id, status: 'CONFIRMED' });
                                await loadAll();
                              }}
                            >
                              <Check size={14} /> Схвалити
                            </button>
                            <button
                              className="small-btn danger"
                              onClick={async () => {
                                await paymentsApi.review({ paymentId: p.id, status: 'REJECTED' });
                                await loadAll();
                              }}
                            >
                              <X size={14} /> Відхилити
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'team' && (
          <section className="panel glass">
            <div className="panel-head">
              <h2>Керування командою</h2>
              <button
                className="primary-btn"
                onClick={() => setEditTeam({ fullName: '', position: '', bio: '', isActive: true })}
              >
                <Plus size={16} /> Додати члена команди
              </button>
            </div>
            <div className="team-grid">
              {team.map(m => (
                <div className="team-card glass" key={m.id}>
                  <h3>{m.fullName}</h3>
                  <b>{m.position}</b>
                  <p>{m.bio}</p>
                  <div className="row-actions">
                    <button className="small-btn" onClick={() => setEditTeam(m)}>Редагувати</button>
                    <button
                      className="small-btn danger"
                      onClick={async () => {
                        await teamApi.remove(m.id);
                        await loadAll();
                      }}
                    >
                      Видалити
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {editTeam && (
              <div className="modal-card glass">
                <h3>{editTeam.id ? 'Редагувати члена команди' : 'Новий співробітник'}</h3>
                <div className="form-grid three">
                  <input placeholder="ПІБ" value={editTeam.fullName || ''} onChange={e => setEditTeam({ ...editTeam, fullName: e.target.value })} />
                  <input placeholder="Посада" value={editTeam.position || ''} onChange={e => setEditTeam({ ...editTeam, position: e.target.value })} />
                  <input placeholder="Телефон" value={editTeam.contactPhone || ''} onChange={e => setEditTeam({ ...editTeam, contactPhone: e.target.value })} />
                </div>
                <textarea placeholder="Біографія" value={editTeam.bio || ''} onChange={e => setEditTeam({ ...editTeam, bio: e.target.value })} />
                <div className="row-actions">
                  <button
                    className="primary-btn"
                    onClick={async () => {
                      if (editTeam.id) await teamApi.update({ ...editTeam, memberId: editTeam.id });
                      else await teamApi.create(editTeam);
                      setEditTeam(null);
                      await loadAll();
                    }}
                  >
                    Зберегти
                  </button>
                  <button className="secondary-btn" onClick={() => setEditTeam(null)}>Скасувати</button>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === 'content' && (
          <section className="panel glass">
            <h2>Публічний контент, юридичні дані та партнери</h2>
            <div className="form-grid three">
              {[
                ['hero_title', 'Головний заголовок сайту'],
                ['hero_subtitle', 'Підзаголовок сайту'],
                ['legal_entity', 'Юридична особа'],
                ['registration_number', 'Реєстраційний номер (IČO)'],
                ['legal_address', 'Адреса реєстрації'],
                ['support_email', 'Служба підтримки (Email)'],
                ['support_phone', 'Гаряча лінія (Телефон)'],
                ['crypto_wallet', 'USDT TRC-20 депозитний гаманець']
              ].map(([k, label]) => (
                <div key={k} className="field-group">
                  <label>{label}</label>
                  <div className="save-input-row">
                    <input
                      defaultValue={content.settings?.[k] || ''}
                      id={`inp-${k}`}
                    />
                    <button
                      className="small-btn"
                      onClick={() => {
                        const val = (document.getElementById(`inp-${k}`) as HTMLInputElement)?.value;
                        void saveSettingKey(k, val);
                      }}
                    >
                      <Save size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'pricing' && (
          <section className="panel glass">
            <div className="panel-head">
              <h2>Ціноутворення та додаткові послуги</h2>
              <button
                className="primary-btn"
                onClick={() => setNewPrice({ name: '', amount: 100, currency: 'EUR', active: true })}
              >
                <Plus size={16} /> Додати послугу
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Назва послуги</th>
                    <th>Опис</th>
                    <th>Вартість</th>
                    <th>Статус</th>
                    <th>Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {pricing.map(item => (
                    <tr key={item.id}>
                      <td><b>{item.name}</b></td>
                      <td>{item.description}</td>
                      <td>{item.amount} {item.currency}</td>
                      <td>
                        <span className={`status-pill ${item.active ? 'active' : 'blocked'}`}>
                          {item.active ? 'Активна' : 'Вимкнено'}
                        </span>
                      </td>
                      <td>
                        <button className="small-btn" onClick={() => setNewPrice(item)}>Редагувати</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {newPrice && (
              <div className="modal-card glass">
                <h3>{newPrice.id ? 'Редагувати тариф' : 'Створити тариф'}</h3>
                <div className="form-grid three">
                  <input placeholder="Назва" value={newPrice.name || ''} onChange={e => setNewPrice({ ...newPrice, name: e.target.value })} />
                  <input type="number" placeholder="Сума" value={newPrice.amount || 0} onChange={e => setNewPrice({ ...newPrice, amount: Number(e.target.value) })} />
                  <input placeholder="Валюта" value={newPrice.currency || 'EUR'} onChange={e => setNewPrice({ ...newPrice, currency: e.target.value })} />
                </div>
                <div className="row-actions">
                  <button className="primary-btn" onClick={savePriceItem}>Зберегти</button>
                  <button className="secondary-btn" onClick={() => setNewPrice(null)}>Скасувати</button>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === 'settings' && (
          <section className="panel glass">
            <h2>Системні налаштування та Google Drive Backups</h2>
            <p className="muted">
              Google Sheets та Google Drive залишаються невидимим сховищем Vanguard. Ви можете будь-коли ініціювати моментальний бекап всієї системи в захищену папку.
            </p>

            <div className="backup-box">
              <Database size={28} />
              <div>
                <b>Резервне копіювання Google Drive</b>
                <p>Знімок бази даних користувачів, досьє, заявок, оплат та аудиту.</p>
              </div>
              <button className="primary-btn" onClick={triggerDriveBackup}>
                <Save size={16} /> Створити резервну копію зараз
              </button>
            </div>
          </section>
        )}

        {tab === 'audit' && (
          <section className="panel glass">
            <h2>Журнал аудиту та дій персоналу</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Час</th>
                    <th>Співробітник (User ID)</th>
                    <th>Дія</th>
                    <th>Сутність</th>
                    <th>Деталі</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l, i) => (
                    <tr key={l.id || i}>
                      <td><small>{new Date(l.timestamp).toLocaleString()}</small></td>
                      <td><b>{l.actorUserId}</b></td>
                      <td><span className="badge">{l.action}</span></td>
                      <td>{l.targetEntity}:{l.targetEntityId}</td>
                      <td>{l.details || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
