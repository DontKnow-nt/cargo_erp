'use client';
import { useState, useTransition, useEffect } from 'react';
import { Building2, Plus, Star, Trash2, X, CheckCircle } from 'lucide-react';
import { addBank, setDefaultBank, deleteBank, type BankDetail } from '@/lib/actions/banks';
import toast from 'react-hot-toast';

export default function BankDetailsPanel() {
  const [banks, setBanks] = useState<BankDetail[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ accountName: 'TRIVENI CARGO EXPRESS INDIA PVT LTD', bankName: '', branch: '', accountNumber: '', ifsc: '' });
  const [err, setErr] = useState('');

  function refresh() {
    fetch('/api/banks').then(r => r.json()).then(setBanks).catch(() => {});
  }

  useEffect(() => { refresh(); }, []);

  function handleAdd() {
    setErr('');
    startTransition(async () => {
      const res = await addBank(form);
      if (res && 'error' in res) { setErr(JSON.stringify(res.error)); return; }
      toast.success('Bank added');
      setShowForm(false);
      setForm({ accountName: 'TRIVENI CARGO EXPRESS INDIA PVT LTD', bankName: '', branch: '', accountNumber: '', ifsc: '' });
      refresh();
    });
  }

  function handleSetDefault(id: string) {
    startTransition(async () => {
      await setDefaultBank(id);
      setBanks(prev => prev.map(b => ({ ...b, is_default: b.id === id ? 1 : 0 })));
      toast.success('Default bank updated');
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteBank(id);
      setBanks(prev => prev.filter(b => b.id !== id));
      toast.success('Bank removed');
    });
  }

  return (
    <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
          <Building2 size={15} color="var(--accent-dark)" /> Bank Details
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}><Plus size={12} /> Add Bank</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {banks.map(b => (
          <div key={b.id} style={{
            border: `1.5px solid ${b.is_default ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 10, padding: '12px 14px', minWidth: 260, flex: '1 1 260px', maxWidth: 340,
            background: b.is_default ? 'var(--accent-subtle)' : 'var(--surface-base)',
            position: 'relative',
          }}>
            {b.is_default === 1 && (
              <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-subtle)', padding: '2px 7px', borderRadius: 99, border: '1px solid var(--accent)' }}>DEFAULT</span>
            )}
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>{b.bank_name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <div><span style={{ color: 'var(--text-muted)' }}>A/c Name:</span> {b.account_name}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>A/c No:</span> <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{b.account_number}</span></div>
              <div><span style={{ color: 'var(--text-muted)' }}>IFSC:</span> <span style={{ fontFamily: 'var(--font-mono)' }}>{b.ifsc}</span></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Branch:</span> {b.branch}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              {b.is_default !== 1 && (
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} disabled={isPending} onClick={() => handleSetDefault(b.id)}>
                  <Star size={11} /> Set Default
                </button>
              )}
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, color: '#dc2626' }} disabled={isPending} onClick={() => handleDelete(b.id)}>
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800 }}>Add Bank Account</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {[
                { label: 'Account Holder Name', key: 'accountName' },
                { label: 'Bank Name', key: 'bankName' },
                { label: 'Branch', key: 'branch' },
                { label: 'Account Number', key: 'accountNumber' },
                { label: 'IFSC Code', key: 'ifsc' },
              ].map(f => (
                <div className="form-group" key={f.key}>
                  <label className="label">{f.label}</label>
                  <input className="input" value={(form as Record<string,string>)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={f.key === 'accountNumber' || f.key === 'ifsc' ? { fontFamily: 'var(--font-mono)' } : {}} />
                </div>
              ))}
            </div>
            {err && <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>{err}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={isPending} onClick={handleAdd}><CheckCircle size={13} /> Save Bank</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
