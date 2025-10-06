import { AppFrame } from "@/components/layout/AppFrame";
import { getProjectId } from "@/lib/project";
import { fetchWithAuth } from "@/lib/supabase";
import { useState, useEffect } from "react";

export default function ClipPage(){
  const pid = getProjectId();
  const [source,setSource]=useState<"slack"|"teams"|"email"|"manual">("manual");
  const [title,setTitle]=useState("");
  const [text,setText]=useState("");
  const [msg,setMsg]=useState("");
  
  const [msConnected,setMsConnected]=useState<boolean>(false);
  const [tLink,setTLink]=useState("");
  const [tTitle,setTTitle]=useState("");
  const [tTopic,setTTopic]=useState("");
  const [tDoc,setTDoc]=useState(true);
  const [tMsg,setTMsg]=useState("");
  const [tChannel,setTChannel]=useState("");
  const [tChatId,setTChatId]=useState("");
  const [tVal,setTVal]=useState<any|null>(null);

  useEffect(()=>{ (async()=>{
    if (!pid) return;
    const r = await fetchWithAuth(`/api/teams/oauth/status?projectId=${encodeURIComponent(pid)}`);
    const j = await r.json(); 
    setMsConnected(!!j.connected);
  })(); },[pid]);

  async function submit(){
    if (!text.trim()) { setMsg("Paste conversation text or link"); return; }
    try {
      const body = { projectId: pid, source, sourceRef: looksLikeLink(text) ? text.trim() : null, title: title || undefined, text, createInsights: true };
      console.log('[ClipPage] Submitting clip:', { projectId: pid, source, textLength: text.length });
      const r = await fetchWithAuth(`/api/clip/submit`, { method:"POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
      console.log('[ClipPage] Response status:', r.status);
      const j = await r.json();
      console.log('[ClipPage] Response:', j);
      setMsg(r.ok ? `Clipped as doc ${j.docId} • actions ${j.actions} risks ${j.risks}` : (j.error||"failed"));
    } catch (e:any) {
      console.error('[ClipPage] Error:', e);
      setMsg(`Error: ${e?.message || e}`);
    }
  }

  async function clipTeams(){
    if (!tLink) { setTMsg("Paste a Teams message link"); return; }
    const r = await fetchWithAuth(`/api/teams/clip`, { method:"POST", body: JSON.stringify({ projectId: pid, link: tLink, title: tTitle, topic: tTopic, createDoc: tDoc }) });
    const j = await r.json(); 
    setTMsg(r.ok? `Clipped ${j.messages||0} msgs${j.docId?` → Doc ${j.docId}`:""}` : `Failed: ${j.error||"unknown"}`);
  }

  return (
    <AppFrame>
      <div className="p-6 space-y-6 max-w-3xl">
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Clip a Conversation</h1>
        
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Basic Clip</h2>
          <div className="grid md:grid-cols-3 gap-2">
            <select className="border rounded px-3 py-2 dark:bg-slate-800 dark:border-slate-600" value={source} onChange={e=>setSource(e.target.value as any)} data-testid="select-source">
              <option value="slack">Slack</option>
              <option value="teams">Teams</option>
              <option value="email">Email</option>
              <option value="manual">Manual</option>
            </select>
            <input className="border rounded px-3 py-2 md:col-span-2 dark:bg-slate-800 dark:border-slate-600" placeholder="Optional title" value={title} onChange={e=>setTitle(e.target.value)} data-testid="input-title" />
          </div>
          <textarea className="w-full h-64 border rounded px-3 py-2 dark:bg-slate-800 dark:border-slate-600" placeholder="Paste Slack/Teams link or chat text here…" value={text} onChange={e=>setText(e.target.value)} data-testid="textarea-text" />
          <div className="flex items-center gap-2">
            <button className="px-3 py-2 border rounded dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700" onClick={submit} data-testid="button-clip">Clip to TEAIM</button>
            <div className="text-xs opacity-70">{msg}</div>
          </div>
          <div className="text-[11px] opacity-60">We prune chatter, keep decisions/actions/config/tests, store as a PII-safe doc, and auto-generate call-outs.</div>
        </div>

        <div className="border-t pt-6 space-y-3 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium">Teams (Phase 2: Graph)</h2>
              <div className="text-xs opacity-70 mb-1">
                {msConnected ? "Connected to Microsoft Graph" : "Not connected"}
                {!msConnected && (
                  <a className="ml-2 text-xs px-2 py-1 border rounded dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700" href={`/api/teams/oauth/start?projectId=${encodeURIComponent(pid!)}`}>
                    Connect Teams
                  </a>
                )}
              </div>
            </div>
          </div>
          <input className="w-full border rounded px-3 py-2 dark:bg-slate-800 dark:border-slate-600" placeholder="Teams message link" value={tLink} onChange={e=>setTLink(e.target.value)} data-testid="input-teams-link" />
          <input className="w-full border rounded px-3 py-2 dark:bg-slate-800 dark:border-slate-600" placeholder="Title (optional)" value={tTitle} onChange={e=>setTTitle(e.target.value)} data-testid="input-teams-title" />
          <input className="w-full border rounded px-3 py-2 dark:bg-slate-800 dark:border-slate-600" placeholder="Topic (optional)" value={tTopic} onChange={e=>setTTopic(e.target.value)} data-testid="input-teams-topic" />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={tDoc} onChange={e=>setTDoc(e.target.checked)} data-testid="checkbox-teams-doc" />
              Create Document
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-2 border rounded dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700" onClick={clipTeams} data-testid="button-clip-teams">Clip Teams (paste text or link)</button>
            <button className="px-3 py-2 border rounded dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700" onClick={async()=>{
              if (!tLink){ setTMsg("Paste a Teams link"); return; }
              const r=await fetchWithAuth(`/api/teams/clip/validate`, { method:"POST", body: JSON.stringify({ projectId: pid, link: tLink }) });
              const j=await r.json(); setTVal(j);
              if (j.ok && j.channelId) setTChannel(j.channelId);
              setTMsg(j.ok ? "Validated!" : (j.error || "Not found")); 
            }} data-testid="button-validate-link">Validate link</button>
            <button className="px-3 py-2 border rounded dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700" onClick={async()=>{
              if (!tLink) { setTMsg("Paste a Teams message link"); return; }
              const body:any = { projectId: pid, link: tLink, title: tTitle, topic: tTopic, createDoc: tDoc };
              if (tChannel) body.channelId = tChannel;
              if (tChatId)  body.chatId = tChatId;
              const r = await fetchWithAuth(`/api/teams/clip/graph`, { method:"POST", body: JSON.stringify(body) });
              const j = await r.json(); 
              setTMsg(r.ok? `Fetched ${j.messages} msgs${j.docId?` → Doc ${j.docId}`:""}` : `Failed: ${j.error||"unknown"}`);
            }} data-testid="button-use-graph">Use Graph</button>
            <div className="text-xs opacity-70">{tMsg}</div>
          </div>
          <div className="grid md:grid-cols-2 gap-2 mt-2">
            <input className="border rounded px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-600" placeholder="channelId (optional)" value={tChannel} onChange={e=>setTChannel(e.target.value)} data-testid="input-teams-channelid" />
            <input className="border rounded px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-600" placeholder="chatId (optional)" value={tChatId} onChange={e=>setTChatId(e.target.value)} data-testid="input-teams-chatid" />
          </div>
          {tVal && (
            <div className="text-[11px] opacity-70 mt-2">
              <pre className="whitespace-pre-wrap p-2 border rounded bg-slate-900/30 dark:bg-slate-800 dark:border-slate-600" data-testid="pre-validation-result">
                {JSON.stringify({ parsed: tVal.parsed, found: tVal.ok, suggestion: tVal.suggestion || null, channelId: tVal.channelId || null }, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </AppFrame>
  );
}

function looksLikeLink(s:string){ return /^https?:\/\//i.test(s.trim()); }
