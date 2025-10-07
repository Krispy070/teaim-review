import { db } from "../db/client";
import { decryptSecret } from "../lib/crypto";
import { sql } from "drizzle-orm";

export async function renderTemplate(projectId:string, integrationId:string, runId:string, input:any): Promise<any> {
  const repl = async (s:string): Promise<string> => {
    let result = s;
    const matches = [...s.matchAll(/\$\{([^}]+)\}/g)];
    
    for (const match of matches) {
      const key = match[1];
      const [kind, name] = String(key).split(":",2);
      let replacement = "";
      
      if (kind==="SECRET"){
        const row = (await db.execute(
          sql`select ciphertext from secrets where project_id=${projectId} and scope in ('project','integration') and coalesce(ref_id,'') in ('', ${integrationId}) and key_name=${name} order by scope desc limit 1`
        )).rows?.[0] as any;
        replacement = row ? decryptSecret(row.ciphertext) : "";
      } else if (kind==="ENV"){
        replacement = process.env[name] || "";
      } else if (kind==="NOW_ISO"){
        replacement = new Date().toISOString();
      } else if (kind==="RUN_ID"){
        replacement = runId;
      } else if (kind==="INTEGRATION_ID"){
        replacement = integrationId;
      }
      
      result = result.replace(match[0], replacement);
    }
    
    return result;
  };

  const walk = async (v:any):Promise<any> => {
    if (typeof v === "string") return await repl(v);
    if (Array.isArray(v)) { 
      const out=[] as any[]; 
      for (const x of v) out.push(await walk(x)); 
      return out; 
    }
    if (v && typeof v === "object") { 
      const out:any={}; 
      for (const k of Object.keys(v)) out[k] = await walk(v[k]); 
      return out; 
    }
    return v;
  };

  return await walk(input);
}
