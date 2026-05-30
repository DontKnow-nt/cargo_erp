'use client';
import { useState, useTransition } from 'react';
import { X, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { createParty } from '@/lib/actions/parties';

type PartyForm = {
  partyName: string;
  gstin: string;
  pan: string;
  contactPerson: string;
  phone: string;
  email: string;
  billingAddress: string;
  creditLimit: number;
  creditDays: number;
  status: 'ACTIVE' | 'INACTIVE';
};

export function AddPartyModal({ 
  onCreated, 
  onClose 
}: { 
  onCreated: (party: { id: string; partyName: string }) => void;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<PartyForm>({
    partyName: '',
    gstin: '',
    pan: '',
    contactPerson: '',
    phone: '',
    email: '',
    billingAddress: '',
    creditLimit: 0,
    creditDays: 30,
    status: 'ACTIVE',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.partyName.trim()) {
      toast.error('Party name is required');
      return;
    }
    startTransition(async () => {
      const res = await createParty(form);
      if (res && 'error' in res) {
        toast.error(res.error as string);
        return;
      }
      toast.success(`${form.partyName} added`);
      if (res && 'id' in res) {
        onCreated({ id: res.id, partyName: form.partyName });
      }
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 500 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800 }}>Add New Party</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="label">Party Name *</label>
            <input
              className="input"
              placeholder="Company or individual name"
              value={form.partyName}
              onChange={e => setForm(f => ({ ...f, partyName: e.target.value }))}
              required
              autoFocus
            />
          </div>
          <div className="form-row form-row-2" style={{ marginBottom: 12 }}>
            <div className="form-group">
              <label className="label">GSTIN</label>
              <input
                className="input"
                placeholder="15-digit GSTIN"
                maxLength={15}
                value={form.gstin}
                onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}
              />
            </div>
            <div className="form-group">
              <label className="label">PAN Card</label>
              <input
                className="input"
                placeholder="10-digit PAN"
                maxLength={10}
                value={form.pan}
                onChange={e => setForm(f => ({ ...f, pan: e.target.value.toUpperCase() }))}
                style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}
              />
            </div>
          </div>
          <div className="form-row form-row-2" style={{ marginBottom: 12 }}>
            <div className="form-group">
              <label className="label">Contact Person</label>
              <input
                className="input"
                value={form.contactPerson}
                onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="label">Phone</label>
              <input
                className="input"
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="label">Billing Address</label>
            <input
              className="input"
              value={form.billingAddress}
              onChange={e => setForm(f => ({ ...f, billingAddress: e.target.value }))}
            />
          </div>
          <div className="form-row form-row-2" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label className="label">Credit Limit (₹)</label>
              <input
                className="input"
                type="number"
                min="0"
                value={form.creditLimit || ''}
                onChange={e => setForm(f => ({ ...f, creditLimit: parseFloat(e.target.value) || 0 }))}
                style={{ fontFamily: 'var(--font-mono)' }}
              />
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>Set 0 for unlimited</div>
            </div>
            <div className="form-group">
              <label className="label">Credit Days</label>
              <input
                className="input"
                type="number"
                min="0"
                value={form.creditDays}
                onChange={e => setForm(f => ({ ...f, creditDays: parseInt(e.target.value) || 30 }))}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              <CheckCircle size={13} /> Add Party
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
