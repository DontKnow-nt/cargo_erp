'use client';
import { Shield, Users, Plus, X, CheckCircle } from 'lucide-react';
import { useState, useEffect, useTransition } from 'react';
import toast from 'react-hot-toast';
import { getUsers, createUser, updateUser } from '@/lib/actions/admin';

const ROLES = ['SUPER_ADMIN','OPERATIONS_MANAGER','ACCOUNTS_EXECUTIVE','VIEWER'] as const;
const ROLE_LABELS: Record<string,string> = { SUPER_ADMIN:'Super Admin', OPERATIONS_MANAGER:'Operations Manager', ACCOUNTS_EXECUTIVE:'Accounts Executive', VIEWER:'Viewer' };
const ROLE_COLORS: Record<string,string> = { SUPER_ADMIN:'#7c3aed', OPERATIONS_MANAGER:'#2563eb', ACCOUNTS_EXECUTIVE:'#059669', VIEWER:'#64748b' };
const PERMISSIONS: Record<string,string[]> = {
  SUPER_ADMIN: ['All Modules','User Management','Settings','Audit Log','Delete Records'],
  OPERATIONS_MANAGER: ['AWB Bookings','Docket Bookings','Freight Rates','Import Wizard','View Invoices'],
  ACCOUNTS_EXECUTIVE: ['Invoices','Payment Receipts','Outstanding','Reports','View Bookings'],
  VIEWER: ['View All (Read Only)'],
};

type User = { id: string; name: string; email: string; role: string; status: string };

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name:'', email:'', password:'', role: ROLES[2] as string });
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getUsers().then(u => setUsers(u as User[])).catch(() => toast.error('Failed to load users'));
  }, []);

  function addUser() {
    if (!form.name || !form.email || !form.password) { toast.error('All fields required'); return; }
    startTransition(async () => {
      const res = await createUser(form);
      if ('error' in res) { toast.error(typeof res.error === 'string' ? res.error : 'Validation error'); return; }
      toast.success(`${form.name} added`);
      setShowForm(false);
      setForm({ name:'', email:'', password:'', role: ROLES[2] });
      getUsers().then(u => setUsers(u as User[]));
    });
  }

  function toggleStatus(u: User) {
    startTransition(async () => {
      const newStatus = u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const res = await updateUser(u.id, { status: newStatus });
      if ('error' in res) { toast.error(typeof res.error === 'string' ? res.error : 'Error'); return; }
      toast(`${u.name} ${newStatus === 'ACTIVE' ? 'activated' : 'deactivated'}`, { icon: newStatus === 'ACTIVE' ? '🟢' : '🔴' });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: newStatus } : x));
    });
  }

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{display:'flex',alignItems:'center',gap:8}}><Shield size={20} color="var(--accent-dark)"/> Admin & RBAC</h1>
          <p className="page-subtitle">Manage users, roles and access permissions.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={()=>setShowForm(true)}><Plus size={12}/> Add User</button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:20}}>
        <div className="card" style={{overflow:'hidden'}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',fontSize:13,fontWeight:700,display:'flex',alignItems:'center',gap:8}}><Users size={14}/> System Users</div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'var(--surface-page)',borderBottom:'1px solid var(--border)'}}>
                {['Name','Email','Role','Status',''].map(h=><th key={h} style={{padding:'9px 14px',textAlign:'left',fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.1em'}}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {users.map(u=>{
                const c = ROLE_COLORS[u.role]||'#64748b';
                return (
                  <tr key={u.id} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'11px 14px',fontWeight:600,fontSize:13}}>{u.name}</td>
                    <td style={{padding:'11px 14px',fontSize:12,color:'var(--text-muted)'}}>{u.email}</td>
                    <td style={{padding:'11px 14px'}}>
                      <span style={{fontSize:11,fontWeight:600,color:c,background:c+'15',border:`1px solid ${c}30`,padding:'2px 9px',borderRadius:99,fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.06em'}}>{ROLE_LABELS[u.role]||u.role}</span>
                    </td>
                    <td style={{padding:'11px 14px'}}>
                      <span style={{fontSize:11,color:u.status==='ACTIVE'?'#059669':'#dc2626',fontWeight:600}}>{u.status}</span>
                    </td>
                    <td style={{padding:'11px 14px'}}>
                      <button className="btn btn-ghost btn-sm" style={{fontSize:11}} disabled={isPending} onClick={()=>toggleStatus(u)}>
                        {u.status==='ACTIVE'?'Deactivate':'Activate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div style={{fontSize:13,fontWeight:700,color:'var(--text-secondary)'}}>Role Permissions</div>
          {ROLES.map(role=>{
            const c = ROLE_COLORS[role];
            return (
              <div key={role} style={{background:'var(--surface-base)',border:`1px solid ${c}30`,borderRadius:10,padding:'12px 14px'}}>
                <div style={{fontSize:12,fontWeight:700,color:c,marginBottom:8}}>{ROLE_LABELS[role]}</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                  {PERMISSIONS[role].map(p=>(
                    <span key={p} style={{fontSize:10,background:'var(--surface-sunken)',border:'1px solid var(--border)',padding:'2px 7px',borderRadius:5,color:'var(--text-secondary)'}}>{p}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:440}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h2 style={{fontSize:16,fontWeight:800}}>Add User</h2>
              <button className="btn btn-ghost btn-icon" onClick={()=>setShowForm(false)}><X size={16}/></button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div className="form-group"><label className="label">Full Name *</label><input className="input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
              <div className="form-group"><label className="label">Email *</label><input className="input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
              <div className="form-group"><label className="label">Password *</label><input className="input" type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="Min 8 chars, uppercase + number"/></div>
              <div className="form-group"><label className="label">Role</label>
                <select className="input" value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
                  {ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
              <button className="btn btn-secondary" onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={isPending} onClick={addUser}><CheckCircle size={13}/> Add User</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
