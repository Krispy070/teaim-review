import { useState, useEffect, useMemo } from "react";

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatDockProps {
  orgId?: string;
  projectId?: string;
}

interface ChatState {
  messages: ChatMessage[];
  isOpen: boolean;
}

export default function ChatDock({ orgId = 'demo-org', projectId = 'demo-project' }: ChatDockProps) {
  // Create storage key specific to project
  const storageKey = `chat-dock-${orgId}-${projectId}`;
  
  // Initialize state from localStorage or defaults (lazy initialization)
  const getInitialState = (): ChatState => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          messages: Array.isArray(parsed.messages) ? parsed.messages : [],
          isOpen: typeof parsed.isOpen === 'boolean' ? parsed.isOpen : false
        };
      }
    } catch (e) {
      console.warn('Failed to load chat state from localStorage:', e);
    }
    return { messages: [], isOpen: false };
  };

  // Use lazy initialization for consistent initial state
  const initial = useMemo(() => getInitialState(), [storageKey]);

  const [open, setOpen] = useState(initial.isOpen);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);

  // Rehydrate state when storageKey (project context) changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      const parsed = saved ? JSON.parse(saved) : null;
      setMessages(Array.isArray(parsed?.messages) ? parsed.messages : []);
      setOpen(typeof parsed?.isOpen === 'boolean' ? parsed.isOpen : false);
    } catch (e) {
      console.warn('Failed to load chat state for new project:', e);
      setMessages([]);
      setOpen(false);
    }
  }, [storageKey]);

  // Save state to localStorage whenever it changes (with message history cap)
  useEffect(() => {
    try {
      // Cap message history to last 30 messages to prevent unbounded growth
      const trimmedMessages = messages.slice(-30);
      const stateToSave = { messages: trimmedMessages, isOpen: open };
      localStorage.setItem(storageKey, JSON.stringify(stateToSave));
    } catch (e) {
      console.warn('Failed to save chat state to localStorage:', e);
    }
  }, [messages, open, storageKey]);

  async function ask() {
    if (!q.trim()) return;
    
    const userMsg: ChatMessage = { role: 'user', content: q };
    setMessages(m => [...m, userMsg]);
    setQ('');
    setLoading(true);
    
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          org_id: orgId, 
          project_id: projectId, 
          question: userMsg.content, 
          k: 8 
        })
      });
      
      let errorMessage = 'Sorry—/ask failed. Please try again.';
      
      if (!res.ok) {
        try {
          const errorData = await res.json();
          if (res.status === 429) {
            errorMessage = 'Rate limit exceeded. Please wait a moment before asking again.';
          } else if (res.status === 400) {
            errorMessage = `Invalid request: ${errorData.detail || 'Please check your input.'}`;
          } else if (res.status === 500) {
            errorMessage = `Server error: ${errorData.detail || 'Please try again later.'}`;
          } else {
            errorMessage = errorData.detail || errorData.error || 'An error occurred.';
          }
        } catch {
          errorMessage = `Request failed (${res.status}). Please try again.`;
        }
        setMessages(m => [...m, { role: 'assistant', content: errorMessage }]);
        return;
      }
      
      const js = await res.json();
      const cited = (js.hits || []).map((h: any) => `• ${h.title ?? '(untitled)'}`).join('\n');
      const ans = js.answer + (cited ? `\n\nSources:\n${cited}` : '');
      
      setMessages(m => [...m, { role: 'assistant', content: ans }]);
    } catch (e) {
      setMessages(m => [...m, { 
        role: 'assistant', 
        content: 'Connection failed. Please check if the API is running and try again.' 
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-0 right-0 w-full md:w-[36rem] border-t border-l rounded-t-xl bg-card shadow-xl z-[90]" data-testid="chat-dock">
      <div className="flex items-center justify-between px-3 py-2 bg-muted border-b">
        <div className="font-semibold text-foreground" data-testid="chat-dock-title">Chat with Kap</div>
        <div className="flex gap-2 items-center">
          <button 
            onClick={() => setOpen(!open)} 
            className="text-xs px-2 py-1 border rounded hover:bg-secondary transition-colors"
            data-testid="chat-toggle-button"
          >
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      
      {open && (
        <div className="flex flex-col h-96" data-testid="chat-content">
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm" data-testid="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                <div 
                  className={`inline-block px-3 py-2 rounded-xl whitespace-pre-wrap ${
                    m.role === 'user' 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-secondary text-secondary-foreground'
                  }`}
                  data-testid={`chat-message-${i}`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="text-xs text-muted-foreground" data-testid="chat-loading">
                thinking…
              </div>
            )}
          </div>
          
          <div className="p-2 border-t flex gap-2">
            <input 
              className="flex-1 border rounded-xl px-3 py-2 text-sm bg-background text-foreground"
              placeholder="Ask about status, risks..." 
              value={q} 
              onChange={e => setQ(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && ask()}
              data-testid="chat-input"
            />
            <button 
              onClick={ask} 
              className="px-3 py-2 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors"
              data-testid="chat-send-button"
            >
              Ask
            </button>
          </div>
        </div>
      )}
    </div>
  );
}