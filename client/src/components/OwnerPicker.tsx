import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';

interface TeamMember {
  user_id: string;
  display_name?: string;
  name?: string;
  email?: string;
  role?: string;
}

interface OwnerPickerProps {
  value: string | null | undefined;
  onValueChange: (value: string | null) => void;
  members: TeamMember[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  'data-testid'?: string;
}

export default function OwnerPicker({
  value,
  onValueChange,
  members,
  placeholder = "Assign",
  className,
  disabled = false,
  'data-testid': testId
}: OwnerPickerProps) {
  // Get the selected member for display
  const selectedMember = members.find(m => m.user_id === value);
  
  // Helper function to get display name with fallback
  const getDisplayName = (member: TeamMember) => {
    return member.display_name || member.name || member.email || member.user_id;
  };
  
  // Helper function to get initials for avatar
  const getInitials = (member: TeamMember) => {
    const name = getDisplayName(member);
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Select 
      value={value || ""} 
      onValueChange={(val) => onValueChange(val || null)}
      disabled={disabled}
    >
      <SelectTrigger 
        className={`h-8 min-w-[120px] ${className || ''}`}
        data-testid={testId}
      >
        <SelectValue>
          {selectedMember ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                  {getInitials(selectedMember)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate text-sm">
                {getDisplayName(selectedMember)}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              <span className="text-sm">{placeholder}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      
      <SelectContent>
        {/* Unassigned option */}
        <SelectItem value="">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-full border-2 border-dashed border-gray-300"></div>
            <span>Unassigned</span>
          </div>
        </SelectItem>
        
        {/* Members list */}
        {members.map(member => (
          <SelectItem key={member.user_id} value={member.user_id}>
            <div className="flex items-center gap-2 w-full">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                  {getInitials(member)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start min-w-0">
                <span className="text-sm font-medium truncate">
                  {getDisplayName(member)}
                </span>
                {member.email && member.email !== getDisplayName(member) && (
                  <span className="text-xs text-muted-foreground truncate">
                    {member.email}
                  </span>
                )}
              </div>
              {member.role && (
                <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md ml-auto">
                  {member.role}
                </span>
              )}
            </div>
          </SelectItem>
        ))}
        
        {/* Empty state */}
        {members.length === 0 && (
          <SelectItem value="" disabled>
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              <span>No team members found</span>
            </div>
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}