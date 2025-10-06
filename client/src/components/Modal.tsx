import { useEffect, useRef } from "react";

export default function Modal({
  open, onClose, title, children, footer
}: { open:boolean; onClose:()=>void; title?:string; children:any; footer?:any }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(()=>{
    if (!open) return;
    
    previousFocusRef.current = document.activeElement as HTMLElement;
    
    setTimeout(() => {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }, 0);

    function onKey(e:KeyboardEvent){ 
      if (e.key==="Escape") onClose(); 
      
      if (e.key === "Tab" && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    }
    
    window.addEventListener("keydown", onKey);
    return ()=> {
      window.removeEventListener("keydown", onKey);
      previousFocusRef.current?.focus();
    };
  },[open, onClose]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div 
        ref={dialogRef}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                      w-[min(560px,92vw)] max-h-[80vh] overflow-auto rounded-2xl border
                      bg-background p-4 shadow-xl">
        {title && <div className="text-lg font-semibold mb-2">{title}</div>}
        <div>{children}</div>
        {footer && <div className="mt-3 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
