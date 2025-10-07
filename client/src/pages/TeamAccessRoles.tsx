import { useQuery } from "@tanstack/react-query";

interface User {
  id: string;
  email: string;
  role: string;
  full_name?: string;
}

export default function TeamAccessRoles({ projectId }: { projectId?: string }) {
  // For now, we'll create a skeleton UI that can be extended later
  const mockUsers: User[] = [
    { id: "1", email: "admin@example.com", role: "admin", full_name: "System Admin" },
    { id: "2", email: "pm@example.com", role: "pm", full_name: "Project Manager" },
    { id: "3", email: "lead@example.com", role: "lead", full_name: "Functional Lead" },
    { id: "4", email: "member@example.com", role: "member", full_name: "Team Member" },
  ];

  const updateRole = async (userId: string, newRole: string) => {
    // Placeholder for future backend integration
    console.log(`Updating user ${userId} to role ${newRole}`);
  };

  return (
    <div className="mx-auto max-w-[1200px] card p-4">
      <h3 className="text-xl font-semibold mb-3">Team Access & Roles</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left py-2">User</th>
              <th className="text-left">Email</th>
              <th className="text-left">Current Role</th>
              <th className="text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {mockUsers.map((user) => (
              <tr key={user.id} className="border-t border-border align-top">
                <td className="py-2 font-medium">{user.full_name || user.email}</td>
                <td className="py-2 text-muted-foreground">{user.email}</td>
                <td className="py-2">
                  <select 
                    defaultValue={user.role} 
                    className="border border-border rounded px-2 py-1 text-sm"
                    onChange={(e) => updateRole(user.id, e.target.value)}
                    data-testid={`select-role-${user.id}`}
                  >
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="pm">Project Manager</option>
                    <option value="lead">Functional Lead</option>
                    <option value="member">Team Member</option>
                    <option value="guest">Guest</option>
                  </select>
                </td>
                <td className="py-2">
                  <button 
                    className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/80"
                    onClick={() => updateRole(user.id, user.role)}
                    data-testid={`button-save-${user.id}`}
                  >
                    Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 p-3 bg-muted rounded text-sm">
        <p className="font-medium">Role Definitions:</p>
        <ul className="mt-2 space-y-1 text-muted-foreground">
          <li><strong>Owner:</strong> Full system access and billing control</li>
          <li><strong>Admin:</strong> System administration and user management</li>
          <li><strong>PM:</strong> Project management and oversight</li>
          <li><strong>Lead:</strong> Functional area leadership</li>
          <li><strong>Member:</strong> Standard team member access</li>
          <li><strong>Guest:</strong> Limited read-only access</li>
        </ul>
      </div>
    </div>
  );
}