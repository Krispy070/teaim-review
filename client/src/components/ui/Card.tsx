import React from "react";

// New Card API with composable children
export default function Card({ 
  className = "", 
  title,
  actions,
  children 
}: { 
  className?: string;
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  // If title or actions provided, use legacy mode for backward compatibility
  if (title !== undefined || actions !== undefined) {
    return (
      <div className="rounded-2xl bg-panel border border-border overflow-hidden">
        {(title || actions) && (
          <div className="px-4 py-3 flex items-center justify-between border-b border-border">
            <div className="font-medium">{title}</div>
            <div className="flex items-center gap-2">{actions}</div>
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    );
  }
  
  // New composable mode
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-950/60 backdrop-blur overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`px-3 py-2 border-b border-slate-800 ${className}`}>
      {children}
    </div>
  );
}

export function CardBody({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`p-3 ${className}`}>
      {children}
    </div>
  );
}

// Keep named export for backward compatibility
export { Card };