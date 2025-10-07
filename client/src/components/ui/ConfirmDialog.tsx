import Button from "@/components/ui/Button";

type Props = {
  open: boolean;
  title?: string;
  message?: string;
  confirmText?: string;
  confirmTone?: "danger"|"primary"|"default";
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

export default function ConfirmDialog({
  open, title="Are you sure?", message="This action cannot be undone.",
  confirmText="Confirm", confirmTone="danger", onConfirm, onClose
}: Props){
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000]">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                      w-[min(520px,92vw)] border border-slate-800 rounded-xl bg-slate-950 p-4">
        <div className="text-lg font-semibold mb-1">{title}</div>
        <div className="text-sm opacity-80 mb-3">{message}</div>
        <div className="flex items-center gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={confirmTone} onClick={async()=>{ await onConfirm(); onClose(); }}>{confirmText}</Button>
        </div>
      </div>
    </div>
  );
}
