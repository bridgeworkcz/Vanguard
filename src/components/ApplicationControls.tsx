import React, { useEffect, useState } from 'react';
import type { Application } from '../types';
import { applicationsApi } from '../services/api';

async function cancel(id: string) {
  const token = localStorage.getItem('vanguard_token');
  const res = await fetch('/api/cancel-application', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
    body: JSON.stringify({ applicationId: id, reason: 'Cancelled from workspace' })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not cancel.');
  return data.application as Application;
}

export const ApplicationControls: React.FC<{ staff?: boolean; onChange?: () => void }> = ({ staff = false, onChange }) => {
  const [apps, setApps] = useState<Application[]>([]);
  const [note, setNote] = useState('');

  const load = () => applicationsApi.list().then(r => setApps(r.applications)).catch(() => setApps([]));
  useEffect(() => { void load(); }, []);

  const run = async (id: string) => {
    if (!window.confirm('Cancel this application?')) return;
    try {
      await cancel(id);
      setNote(`${id} cancelled.`);
      await load();
      onChange?.();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not cancel.');
    }
  };

  return (
    <section className="panel glass">
      <div className="panel-head"><h2>{staff ? 'Application status' : 'Your applications'}</h2></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Country</th><th>Stage</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {apps.map(a => (
              <tr key={a.id}>
                <td><b>{a.id}</b><small>{a.userId}</small></td>
                <td>{a.country}<small>{a.totalCost} {a.currency}</small></td>
                <td>{a.stage}</td>
                <td>{a.status}</td>
                <td>{a.status === 'CANCELLED' ? <span className="muted">Cancelled</span> : <button className="small-btn danger" onClick={() => void run(a.id)}>Cancel</button>}</td>
              </tr>
            ))}
            {apps.length === 0 && <tr><td colSpan={5}>No applications yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {note && <p className="muted">{note}</p>}
    </section>
  );
};
