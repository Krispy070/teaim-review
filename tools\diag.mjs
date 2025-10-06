import { execSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
function sh(cmd){ try{ return execSync(cmd,{stdio:"pipe"}).toString().trim(); } catch(e){ return `__ERR__ ${e.message}`; } }
function checkPort(port){ return new Promise((resolve)=>{ const s=net.createServer(); s.once("error",()=>resolve(false)); s.once("listening",()=>{ s.close(()=>resolve(true)); }); s.listen(port,"0.0.0.0"); }); }
(async()=>{
  console.log("=== KapDiag for TEAIM ===");
  console.log("Node:", sh("node -v"), "| pnpm:", sh("pnpm -v"));
  const envPath=path.resolve(".env"); const hasEnv=fs.existsSync(envPath);
  console.log("Env file:", hasEnv?envPath:"MISSING (.env)");
  let env={}; if(hasEnv){ for(const ln of fs.readFileSync(envPath,"utf8").split(/\r?\n/)){ const m=ln.match(/^(\w+)\s*=\s*(.*)$/); if(m) env[m[1]]=m[2]; } }
  for(const k of ["VITE_SUPABASE_URL","VITE_SUPABASE_ANON_KEY"]) if(!env[k]) console.log("MISSING key in .env:",k);
  console.log("Port 5173 free:", await checkPort(5173));
  const tsc = sh("tsc --noEmit"); console.log("TypeScript check:", tsc.startsWith("__ERR__") ? "tsc not configured or failed; proceeding to vite build" : (tsc||"OK"));
  const build = sh("vite build"); console.log(build.startsWith("__ERR__") ? ("Vite build failed: " + build) : "Vite build OK. dist/ created.");
  console.log("\nNEXT:\n- Add .env keys.\n- If port not free, close other dev servers.\n- Fix any TS/Vite errors.\n- Then run `pnpm dev`.\n");
})();
