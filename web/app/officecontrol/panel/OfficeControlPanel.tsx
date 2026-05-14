'use client';
import { useState, useTransition } from 'react';
import { Shield, LogOut, CheckCircle, XCircle, Users, UserPlus, X, Key } from 'lucide-react';
import { grantPermission, revokePermission, type UserWithPermissions } from '@/lib/actions/officecontrol';
import { createUser, changeUserPassword } from '@/lib/actions/admin';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

const PAGE_LABELS: Record<string, string> = {
  'bookings/awb':    'AWB Bookings',
  'bookings/dockets':'Docket Bookings',
  'invoices':        'Invoices',
  'payments':        'Payments',
  'outstanding':     'Outstanding & Aging',
  'parties':         'Parties / Customers',
  'rates':           'Freight Rates',
  'import':          'Import Wizard',
  'reports':         'Reports',
  'analytics':       'Analytics',
  'audit':           'Audit Log',
  'notifications':   'Notifications',
  'settings':        'Settings',
};

export default function OfficeControlPanel({
  users: initialUsers,
  grantablePages,
}: {
  users: UserWithPermissions[];
  grantablePages: string[];
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [isPending, startTransition] = useTransition();
  const [selectedUser, setSelectedUser] = useState<UserWithPermissions | null>(initialUsers[0] ?? null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'VIEWER' as const });
  const [addError, setAddError] = useState('');
  const [changePwdUserId, setChangePwdUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwdError, setPwdError] = useState('');

  function handleChangePassword() {
    setPwdError('');
    startTransition(async () => {
      const res = await changeUserPassword(changePwdUserId!, { newPassword });
      if (res && 'error' in res) { setPwdError(res.error as string); return; }
      toast.success('Password changed');
      setChangePwdUserId(null); setNewPassword('');
    });
  }

  function handleAddUser() {
    setAddError('');
    startTransition(async () => {
      const res = await createUser(newUser);
      if (res && 'error' in res) {
        setAddError(typeof res.error === 'string' ? res.error : JSON.stringify(res.error));
        return;
      }
      toast.success(`User ${newUser.name} created`);
      setShowAddUser(false);
      setNewUser({ name: '', email: '', password: '', role: 'VIEWER' });
      // Refresh page to show new user
      router.refresh();
    });
  }

  function toggle(userId: string, page: string, currentlyGranted: boolean) {
    startTransition(async () => {
      const res = currentlyGranted
        ? await revokePermission(userId, page, 'officecontrol')
        : await grantPermission(userId, page, 'officecontrol');

      if (res && 'error' in res) { toast.error(res.error as string); return; }

      // Update local state
      setUsers(prev => prev.map(u => {
        if (u.id !== userId) return u;
        const perms = currentlyGranted
          ? u.permissions.filter(p => p !== page)
          : [...u.permissions, page];
        return { ...u, permissions: perms };
      }));
      // Keep selectedUser in sync
      setSelectedUser(prev => {
        if (!prev || prev.id !== userId) return prev;
        const perms = currentlyGranted
          ? prev.permissions.filter(p => p !== page)
          : [...prev.permissions, page];
        return { ...prev, permissions: perms };
      });

      toast.success(currentlyGranted ? `Revoked: ${PAGE_LABELS[page]}` : `Granted: ${PAGE_LABELS[page]}`);
    });
  }

  async function handleLogout() {
    await fetch('/api/officecontrol', { method: 'DELETE' });
    router.push('/officecontrol');
  }

  return (
    <>
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#f59e0b,#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(245,158,11,0.3)' }}>
            <Shield size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', letterSpacing: '-0.03em' }}>Office Control</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Manage per-user page access</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowAddUser(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f59e0b', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 6px rgba(245,158,11,0.25)' }}>
            <UserPlus size={14} /> Add User
          </button>
          <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#64748b', cursor: 'pointer', fontSize: 13 }}>
            <LogOut size={14} /> Logout
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 0, height: 'calc(100vh - 65px)' }}>
        {/* User list */}
        <div style={{ borderRight: '1px solid #e2e8f0', overflowY: 'auto', padding: '12px 0', background: '#fff' }}>
          <div style={{ padding: '6px 16px 10px', fontSize: 10, color: '#94a3b8', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={11} /> Users
          </div>
          {users.map(u => (
            <div
              key={u.id}
              onClick={() => setSelectedUser(u)}
              style={{
                padding: '10px 16px', cursor: 'pointer',
                background: selectedUser?.id === u.id ? '#fffbeb' : 'transparent',
                borderLeft: selectedUser?.id === u.id ? '3px solid #f59e0b' : '3px solid transparent',
                transition: 'background 120ms',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{u.name}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{u.email}</div>
              <div style={{ fontSize: 10, color: '#b45309', marginTop: 2 }}>{u.permissions.length} pages granted</div>
              <button onClick={e => { e.stopPropagation(); setChangePwdUserId(u.id); setNewPassword(''); setPwdError(''); }}
                style={{ marginTop: 4, fontSize: 10, color: '#64748b', background: 'none', border: '1px solid #e2e8f0', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Key size={10} /> Change Password
              </button>
            </div>
          ))}
        </div>

        {/* Permission grid */}
        <div style={{ overflowY: 'auto', padding: '24px 28px', background: '#f8fafc' }}>
          {!selectedUser ? (
            <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: 60 }}>Select a user</div>
          ) : (
            <>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>{selectedUser.name}</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>{selectedUser.email} · {selectedUser.role}</div>
              </div>

              {/* Default pages (always on) */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Default Access (always on)</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['dashboard', 'analytics'].map(p => (
                    <div key={p} style={{ padding: '6px 14px', borderRadius: 8, background: '#ecfdf5', border: '1px solid #6ee7b7', fontSize: 12, color: '#059669', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle size={12} /> {PAGE_LABELS[p] ?? p}
                    </div>
                  ))}
                </div>
              </div>

              {/* Grantable pages */}
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Controlled Access</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                  {grantablePages.filter(p => p !== 'analytics').map(page => {
                    const granted = selectedUser.permissions.includes(page);
                    return (
                      <button
                        key={page}
                        disabled={isPending}
                        onClick={() => toggle(selectedUser.id, page, granted)}
                        style={{
                          padding: '11px 14px', borderRadius: 10, cursor: isPending ? 'not-allowed' : 'pointer',
                          background: granted ? '#fffbeb' : '#fff',
                          border: `1.5px solid ${granted ? '#f59e0b' : '#e2e8f0'}`,
                          color: granted ? '#b45309' : '#64748b',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          fontSize: 13, fontWeight: granted ? 600 : 400, transition: 'all 120ms',
                          textAlign: 'left', boxShadow: granted ? '0 1px 4px rgba(245,158,11,0.15)' : 'none',
                        }}
                      >
                        <span>{PAGE_LABELS[page] ?? page}</span>
                        {granted
                          ? <CheckCircle size={15} color="#f59e0b" />
                          : <XCircle size={15} color="#cbd5e1" />
                        }
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>

    {/* Add User Modal */}
    {showAddUser && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '28px 28px', width: '100%', maxWidth: 420, boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}><UserPlus size={16} color="#f59e0b" /> Add New User</div>
            <button onClick={() => { setShowAddUser(false); setAddError(''); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={18} /></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Full Name', key: 'name', type: 'text', placeholder: 'e.g. Ravi Sharma' },
              { label: 'Email', key: 'email', type: 'email', placeholder: 'user@cargo.in' },
              { label: 'Password', key: 'password', type: 'password', placeholder: 'Min 8 chars, uppercase + number' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{f.label}</label>
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={(newUser as Record<string,string>)[f.key]}
                  onChange={e => setNewUser(u => ({ ...u, [f.key]: e.target.value }))}
                  autoComplete="off"
                  style={{ width: '100%', padding: '9px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, color: '#0f172a', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Role</label>
              <select
                value={newUser.role}
                onChange={e => setNewUser(u => ({ ...u, role: e.target.value as typeof newUser.role }))}
                style={{ width: '100%', padding: '9px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, color: '#0f172a', fontSize: 13 }}
              >
                <option value="VIEWER">Viewer</option>
                <option value="ACCOUNTS_EXECUTIVE">Accounts Executive</option>
                <option value="OPERATIONS_MANAGER">Operations Manager</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>
          </div>
          {addError && <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>{addError}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => { setShowAddUser(false); setAddError(''); }} style={{ padding: '8px 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#64748b', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={handleAddUser} disabled={isPending || !newUser.name || !newUser.email || !newUser.password} style={{ padding: '8px 16px', background: isPending ? '#d97706' : '#f59e0b', border: 'none', borderRadius: 8, color: '#fff', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, boxShadow: '0 2px 6px rgba(245,158,11,0.25)' }}>
              {isPending ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Change Password Modal */}
    {changePwdUserId && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '28px', width: '100%', maxWidth: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}><Key size={15} color="#f59e0b" /> Change Password</div>
            <button onClick={() => setChangePwdUserId(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={18} /></button>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
            For: <strong>{users.find(u => u.id === changePwdUserId)?.email}</strong>
          </div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 5 }}>New Password</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password"
            placeholder="Min 8 chars, uppercase + number"
            style={{ width: '100%', padding: '9px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, color: '#0f172a', fontSize: 13, boxSizing: 'border-box', marginBottom: 8 }} />
          {pwdError && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>{pwdError}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setChangePwdUserId(null)} style={{ padding: '8px 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#64748b', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={handleChangePassword} disabled={isPending || !newPassword}
              style={{ padding: '8px 16px', background: '#f59e0b', border: 'none', borderRadius: 8, color: '#fff', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
              {isPending ? 'Saving…' : 'Save Password'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
