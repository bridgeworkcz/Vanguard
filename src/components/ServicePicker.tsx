import React, { useMemo, useState } from 'react';
import { citizenships, priceFor, processingLabels, productsFor, countries } from '../config/catalog';
import type { ProcessingOption } from '../types';

export const ServicePicker: React.FC<{ onCreated: () => void }> = ({ onCreated }) => {
  const [citizenship, setCitizenship] = useState(citizenships[0]);
  const [country, setCountry] = useState(countries[0]);
  const products = useMemo(() => productsFor(country), [country]);
  const [productId, setProductId] = useState(products[0]?.id || '');
  const product = products.find(x => x.id === productId) || products[0];
  const [processing, setProcessing] = useState<ProcessingOption>(product?.allowedProcessing[0] || 'STANDARD');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const chooseCountry = (value: string) => {
    setCountry(value);
    const next = productsFor(value)[0];
    setProductId(next?.id || '');
    setProcessing(next?.allowedProcessing[0] || 'STANDARD');
  };

  const submit = async () => {
    if (!product) return;
    setBusy(true);
    setNote('');
    try {
      const token = localStorage.getItem('vanguard_token');
      const res = await fetch('/api/start-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({ citizenship, country, visaProductId: product.id, processingOption: processing })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create the application.');
      setNote(`Application ${data.application.id} created. Existing applications stay unchanged.`);
      onCreated();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not create the application.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="calculator glass">
      <div className="calculator-head">
        <div>
          <p className="eyebrow">NEW SERVICE</p>
          <h2>Choose another service</h2>
          <p className="muted">Each selection creates a separate application under your name.</p>
        </div>
      </div>
      <div className="calc-grid">
        <label>Citizenship<select value={citizenship} onChange={e => setCitizenship(e.target.value)}>{citizenships.map(c => <option key={c}>{c}</option>)}</select></label>
        <label>Destination<select value={country} onChange={e => chooseCountry(e.target.value)}>{countries.map(c => <option key={c}>{c}</option>)}</select></label>
        <label>Visa type and term<select value={product?.id || ''} onChange={e => { const next = products.find(x => x.id === e.target.value); setProductId(e.target.value); setProcessing(next?.allowedProcessing[0] || 'STANDARD'); }}>{products.map(p => <option key={p.id} value={p.id}>{p.name} · {p.duration}</option>)}</select></label>
        <label>Processing<select value={processing} onChange={e => setProcessing(e.target.value as ProcessingOption)}>{(product?.allowedProcessing || []).map(p => <option key={p} value={p}>{processingLabels[p]}</option>)}</select></label>
      </div>
      <div className="calc-result">
        <div><span>Production window</span><b>{product?.productionMinWeeks}–{product?.productionMaxWeeks} weeks</b></div>
        <div><span>Service price</span><strong>{product ? priceFor(product, processing) : 0} EUR</strong></div>
        <button className="primary-btn" disabled={busy || !product} onClick={() => void submit()}>{busy ? 'Creating…' : 'Create application'}</button>
      </div>
      {note && <p className="muted">{note}</p>}
    </section>
  );
};
