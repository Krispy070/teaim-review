import { useState } from "react";
import { useLocation } from "wouter";
import { fetchWithAuth } from "@/lib/supabase";
import { MessageSquare, ChevronDown, ChevronUp } from "lucide-react";

type Msg = { role: "user" | "assistant", content: string, sources?: any[] };

interface ChatDockProps {
  orgId?: string;
  projectId?: string;
}

export default function ChatDock({ projectId: propProjectId }: ChatDockProps) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(true);
  const [location] = useLocation();
  
  // Extract projectId from URL if present (e.g., /projects/abc123/...)
  const urlMatch = location.match(/\/projects\/([^\/]+)/);
  const projectId = urlMatch?.[1] || propProjectId;

  async function send() {
    if (!projectId || !input.trim()) return;
    const r = await fetchWithAuth("/api/kap/chat", {
      method: "POST",
      body: JSON.stringify({ projectId, message: input, history: msgs.slice(-6).map(m => ({ role: m.role, content: m.content })) })
    });
    const j = await r.json();
    setMsgs(m => [...m, { role: "user", content: input }, { role: "assistant", content: j.answer, sources: j.sources }]);
    setInput("");
  }

  return (
    <div className="fixed bottom-20 right-6 w-[420px] border rounded-2xl bg-background shadow-xl overflow-hidden z-50" data-testid="chat-dock">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
        data-testid="chat-toggle-button"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          <span className="font-medium">Ask Kap</span>
        </div>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>
      
      {isOpen && (
        <>
          <div className="p-3 max-h-[260px] overflow-auto space-y-3 border-t">
            {msgs.map((m,i)=>(
              <div key={i} className={m.role==="user"?"text-right":""}>
                <div className={`inline-block px-3 py-2 rounded-xl ${m.role==="user"?"bg-primary/10":"bg-muted"}`}>
                  <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                  {m.role==="assistant" && Array.isArray(m.sources) && m.sources.length>0 && (
                    <div className="mt-2 border-t pt-2 text-xs">
                      <div className="opacity-60 mb-1">Citations</div>
                      <ul className="space-y-1">
                        {m.sources.map((s:any, idx:number)=>(
                          <li key={idx} className="flex items-center gap-2">
                            <span className="opacity-60">[{(idx+1)}]</span>
                            <a
                              className="underline"
                              href={`/projects/${projectId}/docs/${s.docId}?focusChunk=${encodeURIComponent(s.chunkId)}`}
                              title={`score ${Number(s.score).toFixed(3)}`}
                              data-testid={`citation-link-${idx}`}
                            >
                              {s.docName}
                            </a>
                            <span className="opacity-50 text-[11px]">score {Number(s.score).toFixed(3)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="p-2 flex gap-2 border-t">
            <input 
              className="flex-1 border rounded-lg px-3 py-2 bg-background text-foreground" 
              value={input} 
              onChange={e=>setInput(e.target.value)} 
              placeholder="Ask Kap…"
              onKeyDown={e => e.key === 'Enter' && send()}
              data-testid="chat-input"
            />
            <button 
              className="border rounded-lg px-3 py-2 hover:bg-primary/10" 
              onClick={send}
              data-testid="chat-send-button"
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}
