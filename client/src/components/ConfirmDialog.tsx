import Modal from "@/components/Modal";
import { useState } from "react";

export default function ConfirmDialog({
  open, onClose, title, intent="neutral",
  body, confirmText="Confirm", cancelText="Cancel",
  onConfirm
}: {
  open: boolean; onClose: ()=>void; title: string;
  intent?: "neutral"|"danger"|"success";
  body: any; confirmText?: string; cancelText?: string;
  onConfirm: ()=>Promise<void>|void;
}) {
  const [busy,setBusy] = useState(false);
  const color = intent==="danger" ? "border-red-600 text-red-200"
              : intent==="success" ? "border-emerald-600 text-emerald-200"
              : "border-slate-600 text-slate-200";
  return (
    <Modal open={open} onClose={()=>!busy && onClose()} title={title}
      footer={
        <>
          <button className="text-xs px-2 py-1 border rounded" onClick={onClose} disabled={busy}>{cancelText}</button>
          <button
            className={`text-xs px-2 py-1 border rounded ${color}`}
            onClick={async ()=>{
              try { setBusy(true); await onConfirm(); onClose(); }
              finally { setBusy(false); }
            }}
            disabled={busy}
          >
            {busy ? "Working…" : confirmText}
          </button>
        </>
      }>
      <div className="text-sm">{body}</div>
    </Modal>
  );
}
