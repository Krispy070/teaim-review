export function Button({children, className="", ...props}: any) {
  return (
    <button
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl
                  border shadow-sm focus:outline-none focus:ring-2 ${className}`}
      style={{
        backgroundColor: 'var(--brand-orange)',
        color: 'var(--ui-bg)',
        borderColor: 'var(--ui-border)',
        '--tw-ring-color': 'var(--brand-orange)',
        '--tw-ring-opacity': '0.2'
      }}
      {...props}
    >
      {children}
    </button>
  );
}