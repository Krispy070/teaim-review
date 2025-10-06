import { useState, useRef, useEffect } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

interface SlashCommand {
  command: string;
  description: string;
  icon: string;
  action: (args?: string) => void;
  pattern?: string; // Optional pattern for complex commands like "area <name> <text> #tag"
  expectsArgs?: boolean; // Whether this command expects additional arguments
}

interface SlashCommandInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  commands: SlashCommand[];
  disabled?: boolean;
  "data-testid"?: string;
}

export default function SlashCommandInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
  className,
  commands,
  disabled,
  "data-testid": testId
}: SlashCommandInputProps) {
  const [showCommands, setShowCommands] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState<SlashCommand[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Detect slash commands
  useEffect(() => {
    const cursorPosition = inputRef.current?.selectionStart || 0;
    const textBeforeCursor = value.substring(0, cursorPosition);
    const words = textBeforeCursor.split(' ');
    const currentWord = words[words.length - 1];

    if (currentWord.startsWith('/') && currentWord.length > 1) {
      // Strip trailing punctuation from query for better matching
      const query = currentWord.substring(1).replace(/[\s,.;:!?)\]}]+$/, "").toLowerCase();
      const filtered = commands.filter(cmd => 
        cmd.command.toLowerCase().includes(query) ||
        cmd.description.toLowerCase().includes(query)
      );
      
      setFilteredCommands(filtered);
      setSelectedIndex(0);
      setShowCommands(filtered.length > 0);
    } else if (currentWord === '/' && textBeforeCursor.endsWith('/')) {
      // Just typed a slash, show all commands
      setFilteredCommands(commands);
      setSelectedIndex(0);
      setShowCommands(true);
    } else {
      setShowCommands(false);
    }
  }, [value, commands]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showCommands && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        executeCommand(filteredCommands[selectedIndex]);
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowCommands(false);
        return;
      }
    }

    // Call the parent's onKeyDown if provided
    onKeyDown?.(e);
  };

  const executeCommand = (command: SlashCommand) => {
    const cursorPosition = inputRef.current?.selectionStart || 0;
    const textBeforeCursor = value.substring(0, cursorPosition);
    const textAfterCursor = value.substring(cursorPosition);
    
    if (command.expectsArgs) {
      // For commands that expect arguments, don't clean the input yet
      // Just execute the action with the current text and let it handle parsing
      const remainingText = textBeforeCursor + textAfterCursor;
      setShowCommands(false); // Always hide dropdown
      command.action(remainingText);
      
      // Refocus the input after action completes
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    } else {
      // More robust token removal that handles punctuation and whitespace
      const cleanedBefore = textBeforeCursor
        .replace(/[\s,.;:!?)\]}]*$/, "") // Remove trailing punctuation/whitespace
        .replace(/\/[^\s,.;:!?)\]}]*$/, ""); // Remove the slash command token
      
      const newValue = cleanedBefore + textAfterCursor;
      
      onChange(newValue);
      setShowCommands(false);
      
      // Execute the command action
      command.action();
      
      // Refocus the input for actions that don't navigate away
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  const handleCommandClick = (command: SlashCommand) => {
    executeCommand(command);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowCommands(false);
      }
    };

    if (showCommands) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCommands]);

  // Hide dropdown when disabled
  useEffect(() => {
    if (disabled) {
      setShowCommands(false);
    }
  }, [disabled]);

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        className={cn(
          "border rounded p-2 text-sm w-full",
          className
        )}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        data-testid={testId}
        role="combobox"
        aria-expanded={showCommands}
        aria-haspopup="listbox"
        aria-controls="slash-commands-listbox"
        aria-activedescendant={showCommands ? `slash-command-${filteredCommands[selectedIndex]?.command}` : undefined}
      />
      
      {showCommands && (
        <div
          ref={dropdownRef}
          id="slash-commands-listbox"
          className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-neutral-800 border rounded shadow-lg z-50 max-h-48 overflow-auto"
          data-testid="slash-commands-dropdown"
          role="listbox"
        >
          {filteredCommands.map((command, index) => (
            <div
              key={command.command}
              id={`slash-command-${command.command}`}
              className={cn(
                "flex items-center gap-3 px-3 py-2 cursor-pointer text-sm border-b last:border-b-0",
                index === selectedIndex 
                  ? "bg-blue-50 dark:bg-blue-900/30" 
                  : "hover:bg-gray-50 dark:hover:bg-neutral-700"
              )}
              onClick={() => handleCommandClick(command)}
              data-testid={`slash-command-${command.command}`}
              role="option"
              aria-selected={index === selectedIndex}
            >
              <span className="text-lg" aria-hidden="true">{command.icon}</span>
              <div className="flex-1">
                <div className="font-medium">
                  /{command.command}
                  {command.pattern && <span className="text-muted-foreground font-normal"> {command.pattern}</span>}
                </div>
                <div className="text-xs text-muted-foreground">{command.description}</div>
              </div>
              {index === selectedIndex && (
                <div className="text-xs text-muted-foreground">Press Enter or Tab</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}