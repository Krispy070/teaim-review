import { useEffect, useState } from 'react';
import { useRequiredProjectId } from '@/hooks/useProjectId';
import { apiGet, apiPost } from '../lib/api';
import RoleMatrixCard from '@/components/RoleMatrixCard';
import { useToast } from '@/hooks/use-toast';

type Member = { user_id: string; role: string; can_sign: boolean; created_at: string };

export default function AdminMembers() {
  const projectId = useRequiredProjectId();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [newUser, setNewUser] = useState('');
  const [newRole, setNewRole] = useState('member');
  const [newSign, setNewSign] = useState(false);
  const [loading, setLoading] = useState(true);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState<any[]>([]);

  async function load() {
    try {
      setLoading(true);
      const data = await apiGet<{members: Member[]}>('/members/list', { project_id: projectId! });
      setMembers(data.members);
    } catch (error) {
      console.error('Failed to load members:', error);
      // Set empty array as fallback for development
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [projectId]);

  async function upsert(u: string, role: string, can_sign: boolean) {
    try {
      await apiPost('/members/upsert', { user_id: u, role, can_sign }, { project_id: projectId! });
      await load();
      // Clear form after successful add
      if (u === newUser) {
        setNewUser('');
        setNewRole('member');
        setNewSign(false);
      }
    } catch (error) {
      console.error('Failed to upsert member:', error);
      alert('Failed to update member. Please try again.');
    }
  }

  async function remove(u: string) {
    if (!confirm(`Remove user ${u} from this project?`)) return;
    try {
      await apiPost('/members/remove', undefined, { project_id: projectId!, user_id: u });
      await load();
    } catch (error) {
      console.error('Failed to remove member:', error);
      alert('Failed to remove member. Please try again.');
    }
  }

  function parseCsvLine(line: string): string[] {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  async function handleBulkInvite() {
    if (!csvFile) return;
    
    setBulkLoading(true);
    setBulkResults([]);
    
    try {
      const text = await csvFile.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        toast({ title: "Error", description: "CSV must have header row and at least one data row", variant: "destructive" });
        return;
      }
      
      const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, ''));
      const emailIndex = headers.findIndex(h => h.includes('email'));
      const roleIndex = headers.findIndex(h => h.includes('role'));
      const canSignIndex = headers.findIndex(h => h.includes('sign'));
      const sendEmailIndex = headers.findIndex(h => h.includes('send'));
      
      if (emailIndex === -1) {
        toast({ title: "Error", description: "CSV must have an 'email' column", variant: "destructive" });
        return;
      }
      
      const invites = [];
      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        if (values[emailIndex]?.trim()) {
          invites.push({
            email: values[emailIndex].replace(/['"]/g, '').trim(),
            role: roleIndex >= 0 ? (values[roleIndex]?.replace(/['"]/g, '').trim() || 'member') : 'member',
            can_sign: canSignIndex >= 0 ? (values[canSignIndex]?.toLowerCase().includes('true') || values[canSignIndex]?.toLowerCase().includes('yes')) : false,
            send_email: sendEmailIndex >= 0 ? (values[sendEmailIndex]?.toLowerCase().includes('true') || values[sendEmailIndex]?.toLowerCase().includes('yes')) : true
          });
        }
      }
      
      if (invites.length === 0) {
        toast({ title: "Error", description: "No valid email addresses found in CSV", variant: "destructive" });
        return;
      }
      
      const response = await apiPost('/invite/bulk', { invites }, { project_id: projectId! });
      setBulkResults(response.results || []);
      
      const successful = response.results?.filter((r: any) => r.status === 'sent').length || 0;
      const failed = (response.results?.length || 0) - successful;
      
      toast({ 
        title: "Bulk Invite Complete", 
        description: `${successful} invites sent successfully${failed > 0 ? `, ${failed} failed` : ''}` 
      });
      
      setCsvFile(null);
      if (successful > 0) await load();
      
    } catch (error) {
      console.error('Bulk invite failed:', error);
      toast({ title: "Error", description: "Failed to process bulk invites", variant: "destructive" });
    } finally {
      setBulkLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-4">Project Members</h1>
        <div className="flex items-center justify-center p-8">
          <div className="text-gray-500">Loading members...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="admin-members-page">
      <div>
        <h1 className="text-xl font-semibold" data-testid="page-title">Project Members</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage project team members, roles, and signing permissions
        </p>
      </div>

      {/* Add New Member Form */}
      <div className="bg-card border rounded-lg p-4">
        <h2 className="font-medium mb-3">Add New Member</h2>
        <div className="flex gap-3 items-center flex-wrap">
          <input
            type="text"
            placeholder="User UUID"
            value={newUser}
            onChange={e => setNewUser(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-w-[250px]"
            data-testid="input-user-uuid"
          />
          
          <select
            value={newRole}
            onChange={e => setNewRole(e.target.value)}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 w-32"
            data-testid="select-role"
          >
            {['owner', 'admin', 'pm', 'lead', 'member', 'guest'].map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={newSign}
                onChange={e => setNewSign(e.target.checked)}
                className="rounded border border-input"
                data-testid="switch-signer"
              />
              <span className="text-sm">Signer</span>
            </label>
          </div>
          
          <button
            onClick={() => upsert(newUser, newRole, newSign)}
            disabled={!newUser.trim()}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            data-testid="button-add-member"
          >
            Add/Update
          </button>
        </div>
      </div>

      {/* CSV Bulk Invite */}
      <div className="bg-card border rounded-lg p-4">
        <h2 className="font-medium mb-3">Bulk Invite from CSV</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Upload a CSV file with columns: email (required), role (optional, defaults to 'member'), can_sign (optional, true/false), send_email (optional, true/false)
        </p>
        
        <div className="space-y-4">
          <div className="flex gap-3 items-center flex-wrap">
            <input
              type="file"
              accept=".csv"
              onChange={e => setCsvFile(e.target.files?.[0] || null)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 max-w-md"
              data-testid="input-csv-file"
            />
            
            <button
              onClick={handleBulkInvite}
              disabled={!csvFile || bulkLoading}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
              data-testid="button-bulk-invite"
            >
              {bulkLoading ? "Processing..." : "Send Bulk Invites"}
            </button>
          </div>

          {/* Sample CSV format */}
          <div className="text-sm">
            <details className="cursor-pointer">
              <summary className="font-medium text-muted-foreground hover:text-foreground">
                Show sample CSV format
              </summary>
              <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-x-auto">
{`email,role,can_sign,send_email
john@example.com,member,false,true
jane@example.com,admin,true,true
bob@company.org,pm,false,false`}
              </pre>
            </details>
          </div>

          {/* Bulk Results */}
          {bulkResults.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium">Bulk Invite Results:</h3>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {bulkResults.map((result: any, index: number) => (
                  <div 
                    key={index} 
                    className={`flex items-center justify-between p-2 rounded text-sm ${
                      result.status === 'sent' 
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' 
                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                    }`}
                    data-testid={`bulk-result-${index}`}
                  >
                    <span>{result.email}</span>
                    <span className="font-medium">
                      {result.status === 'sent' ? '✓ Sent' : `✗ ${result.error || 'Failed'}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Members List */}
      <div className="space-y-3">
        {members.length === 0 ? (
          <div className="text-center p-8 text-gray-500" data-testid="no-members">
            No members found. Add the first member to get started.
          </div>
        ) : (
          members.map(m => (
            <div key={m.user_id} className="flex items-center justify-between border rounded-lg p-4 bg-card" data-testid={`member-${m.user_id}`}>
              <div className="flex-1">
                <div className="font-medium" data-testid={`text-user-id-${m.user_id}`}>{m.user_id}</div>
                <div className="text-sm text-muted-foreground" data-testid={`text-member-info-${m.user_id}`}>
                  {m.role} {m.can_sign ? '• signer' : ''}
                </div>
                {m.created_at && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Added {new Date(m.created_at).toLocaleDateString()}
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-3">
                <select
                  value={m.role}
                  onChange={e => upsert(m.user_id, e.target.value, m.can_sign)}
                  className="flex h-9 rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 w-28"
                  data-testid={`select-role-${m.user_id}`}
                >
                  {['owner', 'admin', 'pm', 'lead', 'member', 'guest'].map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={m.can_sign}
                      onChange={e => upsert(m.user_id, m.role, e.target.checked)}
                      className="rounded border border-input"
                      data-testid={`switch-signer-${m.user_id}`}
                    />
                    <span className="text-sm">Signer</span>
                  </label>
                </div>
                
                <button
                  onClick={() => remove(m.user_id)}
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-9 px-3 py-1"
                  data-testid={`button-remove-${m.user_id}`}
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Comprehensive Role Matrix */}
      <RoleMatrixCard />
    </div>
  );
}