import React, { useState, useEffect, useCallback } from 'react';
import { Dossier, DossierDocument, PaymentTransaction, DocumentCategory } from '../types';
import { dossiersApi, documentsApi, paymentsApi } from '../services/api';
import { FileText, Upload, CreditCard, Plus } from 'lucide-react';

export const ClientDashboard: React.FC = () => {
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [selectedDossier, setSelectedDossier] = useState<Dossier | null>(null);
  const [documents, setDocuments] = useState<DossierDocument[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // New Dossier Form
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [fullName, setFullName] = useState('');
  const [passportNumber, setPassportNumber] = useState('');
  const [citizenship, setCitizenship] = useState('');
  const [targetCountry, setTargetCountry] = useState('Czech Republic');
  const [totalCost] = useState(2500);

  // Document Upload Form
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>('PASSPORT');
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Payment Submit Form
  const [payAmount, setPayAmount] = useState<number>(500);
  const [payTranche, setPayTranche] = useState<20 | 30 | 50>(20);
  const [txHash, setTxHash] = useState('');
  const [submittingPay, setSubmittingPay] = useState(false);

  const loadDossiers = async () => {
    try {
      setLoading(true);
      const res = await dossiersApi.list();
      const list = res.dossiers || [];
      setDossiers(list);
      if (list.length > 0 && !selectedDossier) {
        setSelectedDossier(list[0]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading dossiers');
    } finally {
      setLoading(false);
    }
  };

  const loadDossierDetails = useCallback(async (dossierId: string) => {
    try {
      const [docRes, payRes] = await Promise.all([
        documentsApi.list(dossierId),
        paymentsApi.list(dossierId),
      ]);
      setDocuments(docRes.documents || []);
      setPayments(payRes.payments || []);
    } catch (err: unknown) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadDossiers();
  }, []);

  useEffect(() => {
    if (selectedDossier) {
      loadDossierDetails(selectedDossier.id);
    }
  }, [selectedDossier, loadDossierDetails]);

  const handleCreateDossier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await dossiersApi.create({
        fullName,
        passportNumber,
        citizenship,
        targetCountry,
        totalCost,
        currency: 'EUR',
      });
      setShowCreateModal(false);
      await loadDossiers();
      setSelectedDossier(res.dossier);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error creating dossier');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !selectedDossier) return;
    const file = e.target.files[0];
    setUploadingDoc(true);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        await documentsApi.upload({
          dossierId: selectedDossier.id,
          category: selectedCategory,
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
          fileBase64: base64,
        });
        await loadDossierDetails(selectedDossier.id);
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Error uploading file');
      } finally {
        setUploadingDoc(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDossier) return;
    setSubmittingPay(true);

    try {
      await paymentsApi.submit({
        dossierId: selectedDossier.id,
        amount: payAmount,
        currency: 'USDT',
        network: 'TRC-20',
        txHash,
        tranchePercent: payTranche,
      });
      setTxHash('');
      await loadDossierDetails(selectedDossier.id);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error submitting transaction');
    } finally {
      setSubmittingPay(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading Client Portal...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent">
            Client Portal
          </h1>
          <p className="text-sm text-slate-400">Track your EU legalization process and upload documents</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" /> Submit New Dossier
        </button>
      </div>

      {error && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>}

      {/* Dossier List */}
      {dossiers.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
          <FileText className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-lg font-semibold text-slate-300">No active dossiers found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Click "Submit New Dossier" to initiate your EU relocation application.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Dossier Selection */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Dossiers</h3>
            {dossiers.map(d => (
              <div
                key={d.id}
                onClick={() => setSelectedDossier(d)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedDossier?.id === d.id
                    ? 'bg-slate-800 border-amber-500/50 shadow-lg shadow-amber-500/5'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-mono text-amber-400">{d.id}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700">
                    {d.processStatus}
                  </span>
                </div>
                <div className="text-sm font-semibold">{d.targetCountry}</div>
                <div className="text-xs text-slate-400 mt-1">Paid: {d.paidAmount} / {d.totalCost} {d.currency}</div>
              </div>
            ))}
          </div>

          {/* Dossier Details */}
          {selectedDossier && (
            <div className="lg:col-span-2 space-y-6">
              {/* Status Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs text-amber-400 font-mono">{selectedDossier.id}</span>
                    <h2 className="text-xl font-bold">{selectedDossier.fullName}</h2>
                    <span className="text-xs text-slate-400">Passport: {selectedDossier.passportNumber} ({selectedDossier.citizenship})</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400">Payment Status</div>
                    <span className="inline-block text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 mt-1">
                      {selectedDossier.paymentStatus}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-800 text-center">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase">Total Cost</div>
                    <div className="text-sm font-bold">{selectedDossier.totalCost} {selectedDossier.currency}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase">Paid Amount</div>
                    <div className="text-sm font-bold text-emerald-400">{selectedDossier.paidAmount} {selectedDossier.currency}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase">Remaining</div>
                    <div className="text-sm font-bold text-amber-400">{selectedDossier.remainingAmount} {selectedDossier.currency}</div>
                  </div>
                </div>
              </div>

              {/* Documents Section */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-500" /> Dossier Documents
                </h3>

                <div className="flex flex-col sm:flex-row gap-3">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value as DocumentCategory)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="PASSPORT">Passport</option>
                    <option value="POLICE_CLEARANCE">Police Clearance</option>
                    <option value="EDUCATION_DIPLOMA">Education Diploma</option>
                    <option value="MEDICAL_CLEARANCE">Medical Clearance</option>
                    <option value="CONTRACT">Contract</option>
                  </select>

                  <label className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-all">
                    <Upload className="w-4 h-4" />
                    {uploadingDoc ? 'Uploading...' : 'Upload Document'}
                    <input type="file" onChange={handleFileUpload} disabled={uploadingDoc} className="hidden" />
                  </label>
                </div>

                <div className="space-y-2 pt-2">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex justify-between items-center p-3 bg-slate-950 border border-slate-800/80 rounded-xl text-xs">
                      <div className="space-y-0.5">
                        <div className="font-semibold">{doc.fileName}</div>
                        <div className="text-[10px] text-slate-500">{doc.category} • {doc.uploadedAt.substring(0, 10)}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                        doc.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        doc.status === 'REJECTED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                        'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {doc.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Section */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-amber-500" /> Tranche Payment (USDT TRC-20)
                </h3>

                <form onSubmit={handlePaymentSubmit} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Tranche %</label>
                      <select
                        value={payTranche}
                        onChange={(e) => setPayTranche(Number(e.target.value) as 20 | 30 | 50)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      >
                        <option value={20}>20% (Advance)</option>
                        <option value={50}>50% (Filing)</option>
                        <option value={30}>30% (Final)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Amount (USDT)</label>
                      <input
                        type="number"
                        value={payAmount}
                        onChange={(e) => setPayAmount(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Transaction Hash (txHash)</label>
                    <input
                      type="text"
                      required
                      value={txHash}
                      onChange={(e) => setTxHash(e.target.value)}
                      placeholder="e.g. 7f3b8c..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submittingPay}
                    className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 rounded-xl text-xs transition-all disabled:opacity-50"
                  >
                    {submittingPay ? 'Submitting...' : 'Confirm Payment Submission'}
                  </button>
                </form>

                {/* Payment History */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  {payments.map(p => (
                    <div key={p.id} className="flex justify-between items-center p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs">
                      <div>
                        <div className="font-bold">{p.amount} {p.currency} ({p.tranchePercent}%)</div>
                        <div className="text-[10px] font-mono text-slate-500">{p.txHash.substring(0, 16)}...</div>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Dossier Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-bold">New Relocation Dossier</h3>
            <form onSubmit={handleCreateDossier} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Passport Number</label>
                <input
                  type="text"
                  required
                  value={passportNumber}
                  onChange={(e) => setPassportNumber(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Citizenship</label>
                  <input
                    type="text"
                    required
                    value={citizenship}
                    onChange={(e) => setCitizenship(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Target Country</label>
                  <input
                    type="text"
                    required
                    value={targetCountry}
                    onChange={(e) => setTargetCountry(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 py-2 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 py-2 rounded-xl font-bold"
                >
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
