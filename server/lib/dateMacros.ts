export function applyDateMacros(s: string, d = new Date()){
  const pad = (n:number)=> String(n).padStart(2,"0");
  const YYYY = d.getUTCFullYear();
  const MM   = pad(d.getUTCMonth()+1);
  const DD   = pad(d.getUTCDate());
  const HH   = pad(d.getUTCHours());
  const mm   = pad(d.getUTCMinutes());
  const ss   = pad(d.getUTCSeconds());
  return s
    .replace(/\$\{YYYY\}/g, String(YYYY))
    .replace(/\$\{MM\}/g, MM)
    .replace(/\$\{DD\}/g, DD)
    .replace(/\$\{HH\}/g, HH)
    .replace(/\$\{mm\}/g, mm)
    .replace(/\$\{ss\}/g, ss);
}

export function fileNameFromTemplate(tpl: string, fileName: string, d = new Date()) {
  const dot = fileName.lastIndexOf(".");
  const BASENAME = dot > 0 ? fileName.slice(0, dot) : fileName;
  const EXT = dot > 0 ? fileName.slice(dot) : "";
  const result = applyDateMacros(
    tpl
      .replace(/\$\{NAME\}/g, fileName)
      .replace(/\$\{BASENAME\}/g, BASENAME)
      .replace(/\$\{EXT\}/g, EXT),
    d
  );
  return sanitizeFilename(result);
}

function sanitizeFilename(name: string): string {
  return name
    .split('/')
    .filter(segment => segment && segment !== '.' && segment !== '..')
    .join('_')
    .replace(/[<>:"|?*\x00-\x1F]/g, '_');
}
