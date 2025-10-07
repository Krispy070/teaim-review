export function Kpi({label, value, tone='neutral'}:{
  label:string; value:string|number; tone?:'neutral'|'success'|'warning'|'error'
}) {
  const toneStyles = {
    neutral: { backgroundColor: 'var(--ui-panel-2)', color: 'var(--text)' },
    success: { backgroundColor: 'var(--brand-success)', color: 'var(--brand-success)', opacity: '0.15' },
    warning: { backgroundColor: 'var(--warn)', color: 'var(--warn)', opacity: '0.15' },
    error:   { backgroundColor: 'var(--error)', color: 'var(--error)', opacity: '0.15' },
  }[tone];
  
  const textStyle = tone === 'success' ? { color: 'var(--brand-success)' } : 
                   tone === 'warning' ? { color: 'var(--warn)' } :
                   tone === 'error' ? { color: 'var(--error)' } : 
                   { color: 'var(--text)' };
  
  return (
    <div 
      className="rounded-xl border px-4 py-3" 
      style={{
        borderColor: 'var(--ui-border)',
        backgroundColor: tone !== 'neutral' ? `rgba(${tone === 'success' ? '46,204,113' : tone === 'warning' ? '255,201,51' : '239,68,68'}, 0.15)` : 'var(--ui-panel-2)'
      }}
    >
      <div className="text-xs" style={{color: 'var(--text-muted)'}}>{label}</div>
      <div className="text-2xl font-semibold" style={textStyle}>{value}</div>
    </div>
  );
}