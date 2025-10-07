export function ExternalIcon({ className="" }:{ className?:string }){
  return (
    <svg viewBox="0 0 24 24" className={`w-4 h-4 ${className}`} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 3h7v7"/><path d="M10 14L21 3"/><path d="M21 14v7H3V3h7" opacity=".25"/>
    </svg>
  );
}
export function CopyIcon({ className="" }:{ className?:string }){
  return (
    <svg viewBox="0 0 24 24" className={`w-4 h-4 ${className}`} fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2"/><rect x="2" y="2" width="13" height="13" rx="2" opacity=".25"/>
    </svg>
  );
}
