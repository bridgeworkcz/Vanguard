import React, { useState, useEffect } from 'react';
import { Dossier, ProcessStatus, DossierPaymentStatus } from '../types';
import { dossiersApi } from '../services/api';
import { Shield, RefreshCw } from 'lucide-react';

export const ManagerDashboard: React.FC = () => {
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDossier, setSelectedDossier] = useState<Dossier | null>(null);

  const [procStatus, setProcStatus] = useState<ProcessStatus>('NEW');
  const [payStatus, setPayStatus] = useState<DossierPaymentStatus>('NOT_DUE');
  const [updating, setUpdating] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const res = await dossiersApi.list();
      setDossiers(res.dossiers || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDossier) return;
    setUpdating(true);

    try {
      await dossiersApi.updateStatus({
        dossierId: selectedDossier.id,
        processStatus: procStatus,
        paymentStatus: payStatus,
      });
      await loadAll();
      setSelectedDossier(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Помилка оновлення');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Завантаження CRM...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-amber-500" /> CRM Менеджера
          </h1>
          <p className="text-xs text-slate-400">Управління досьє клієнтів та зміна статусів</p>
        </div>
        <button
          onClick={loadAll}
          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
            <tr>
              <th className="p-4">ID</th>
              <th className="p-4">ПІБ Клієнта</th>
              <th className="p-4">Країна</th>
              <th className="p-4">Процес</th>
              <th className="p-4">Оплата</th>
              <th className="p-4">Баланс</th>
              <th className="p-4 text-right">Дії</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {dossiers.map(d => (
              <tr key={d.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="p-4 font-mono text-amber-400">{d.id}</td>
                <td className="p-4 font-semibold">{d.fullName}</td>
                <td className="p-4">{d.targetCountry}</td>
                <td className="p-4">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700 font-mono">
                    {d.processStatus}
                  </span>
                </td>
                <td className="p-4">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700 font-mono">
                    {d.paymentStatus}
                  </span>
                </td>
                <td className="p-4">{d.paidAmount} / {d.totalCost} {d.currency}</td>
                <td className="p-4 text-right">
                  <button
                    onClick={() => {
                      setSelectedDossier(d);
                      setProcStatus(d.processStatus);
                      setPayStatus(d.paymentStatus);
                    }}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1 rounded-lg font-bold"
                  >
                    Змінити
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedDossier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-bold">Оновлення статусу {selectedDossier.id}</h3>
            <form onSubmit={handleUpdate} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Процесуальний статус</label>
                <select
                  value={procStatus}
                  onChange={(e) => setProcStatus(e.target.value as ProcessStatus)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                >
                  <option value="NEW">NEW</option>
                  <option value="DOCUMENTS_REQUIRED">DOCUMENTS_REQUIRED</option>
                  <option value="DOCUMENTS_REVIEW">DOCUMENTS_REVIEW</option>
                  <option value="LEGAL_REVIEW">LEGAL_REVIEW</option>
                  <option value="READY_FOR_FILING">READY_FOR_FILING</option>
                  <option value="FILED">FILED</option>
                  <option value="PROCESSING">PROCESSING</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Фінансовий статус</label>
                <select
                  value={payStatus}
                  onChange={(e) => setPayStatus(e.target.value as DossierPaymentStatus)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                >
                  <option value="NOT_DUE">NOT_DUE</option>
                  <option value="PARTIALLY_PAID">PARTIALLY_PAID</option>
                  <option value="PAID">PAID</option>
                  <option value="OVERDUE">OVERDUE</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedDossier(null)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 py-2 rounded-xl font-semibold"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 py-2 rounded-xl font-bold"
                >
                  Зберегти
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

