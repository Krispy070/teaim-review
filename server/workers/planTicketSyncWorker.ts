import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { beat } from "../lib/heartbeat";

const SCHEMA_ERROR_CODES = new Set(["42P01", "42P10"]);
let loggedSchemaError = false;

function getPgErrorCode(error: any): string | undefined {
  return error?.code ?? error?.original?.code ?? error?.cause?.code;
}

function handleSchemaError(error: any): boolean {
  const code = getPgErrorCode(error);
  if (code && SCHEMA_ERROR_CODES.has(code)) {
    if (!loggedSchemaError) {
      console.warn(`[planTicketSync] database not ready (${code}): ${error?.message ?? error}`);
      loggedSchemaError = true;
    }
    return true;
  }
  return false;
}

export function startPlanTicketSyncWorker(){
  if (process.env.WORKERS_ENABLED === "0") {
    console.log("[planTicketSync] disabled (WORKERS_ENABLED=0)");
    return;
  }

  setInterval(async ()=>{
    if (process.env.WORKERS_ENABLED === "0") {
      return;
    }
    try{
      const { rows: plans } = await db.execute(
        sql`select id, project_id as "projectId" from project_plans where is_active=true`
      );

      for (const p of plans) {
        const { rows: tasks } = await db.execute(
          sql`select id, ticket_id as "ticketId" from plan_tasks where project_id=${p.projectId} and plan_id=${p.id} and ticket_id is not null`
        );

        for (const r of tasks) {
          const { rows: tk } = await db.execute(
            sql`select title, assignee, priority, status from tickets where id=${r.ticketId} and project_id=${p.projectId}`
          );
          const ticket = tk?.[0];
          if (!ticket) continue;

          await db.execute(
            sql`update plan_tasks set title=${ticket.title}, owner=${ticket.assignee||null}, priority=${mapPrio(ticket.priority)}, status=${mapStatus(ticket.status)} where id=${r.id}`
          );
        }
      }
      await beat("planTicketSync", true);
      loggedSchemaError = false;
    }catch(e){
      if (handleSchemaError(e)) {
        return;
      }
      console.error("[planTicketSync]", e);
      await beat("planTicketSync", false, String(e));
    }
  }, 10*60*1000);

  function mapPrio(p:any){ const x=String(p||"med").toLowerCase(); return x==="high"?20:x==="low"?80:50; }
  function mapStatus(s:any){
    const x=String(s||"triage").toLowerCase();
    if (x==="closed") return "done";
    if (x==="in_progress") return "in_progress";
    if (x==="blocked"||x==="waiting"||x==="vendor") return "blocked";
    return "planned";
  }
}
