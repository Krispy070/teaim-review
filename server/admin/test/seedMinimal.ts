import { db } from "../../db";
import { sql, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import dayjs from "dayjs";
import { projects, artifacts, areas, workbooks, reports, changes, comments, releases, notifications, signoffs, calendarEvents } from "../../../shared/schema";

export async function seedMinimal(projectId: string, userId?: string) {
  const now = new Date();
  // Use dev org ID for seeding
  const devOrgId = "87654321-4321-4321-4321-cba987654321";

  const ids = {
    areaHcm: uuid(), areaFin: uuid(),
    wbHcm: uuid(), wbFin: uuid(),
    rptHcm: uuid(), rptFin: uuid(),
    change1: uuid(), change2: uuid(),
    cmt1: uuid(), cmt2: uuid(),
    rel1: uuid(), notif1: uuid(),
    sign1: uuid(), art1: uuid(), artZip: uuid(), cal1: uuid(),
  };

  // Wipe project rows (idempotent)
  await db.transaction(async (tx) => {
    await tx.delete(calendarEvents).where(eq(calendarEvents.projectId, projectId));
    await tx.delete(artifacts).where(eq(artifacts.projectId, projectId));
    await tx.delete(notifications).where(eq(notifications.projectId, projectId));
    await tx.delete(releases).where(eq(releases.projectId, projectId));
    await tx.delete(comments).where(eq(comments.projectId, projectId));
    await tx.delete(changes).where(eq(changes.projectId, projectId));
    await tx.delete(reports).where(eq(reports.projectId, projectId));
    await tx.delete(workbooks).where(eq(workbooks.projectId, projectId));
    await tx.delete(areas).where(eq(areas.projectId, projectId));
    await tx.delete(signoffs).where(eq(signoffs.projectId, projectId));
    await tx.delete(projects).where(eq(projects.id, projectId));
  });

  // Insert minimal dataset
  await db.transaction(async (tx) => {
    // NEW: ensure a minimal project record exists (if digest/zip reads it)
    await tx.insert(projects).values([
      { id: projectId, orgId: devOrgId, code: "TEAIM-TEST", name: "TEAIM Test Customer", clientName: "Test Client", status: "config", createdAt: now }
    ]).onConflictDoNothing();

    await tx.insert(areas).values([
      { id: ids.areaHcm, projectId, key: "HCM", name: "HCM", status: "active", createdAt: now },
      { id: ids.areaFin, projectId, key: "FIN", name: "Financials", status: "active", createdAt: now },
    ]);

    await tx.insert(workbooks).values([
      { id: ids.wbHcm, projectId, areaId: ids.areaHcm, title: "HCM Workbook", createdAt: now, metrics: { items: 12, open: 4, closed: 8 } },
      { id: ids.wbFin, projectId, areaId: ids.areaFin, title: "FIN Workbook", createdAt: now, metrics: { items: 9, open: 3, closed: 6 } },
    ]);

    await tx.insert(reports).values([
      { id: ids.rptHcm, projectId, areaId: ids.areaHcm, type: "wb_export_csv", title: "HCM Export", createdAt: now, payload: { rows: 12 } },
      { id: ids.rptFin, projectId, areaId: ids.areaFin, type: "wb_export_csv", title: "FIN Export", createdAt: now, payload: { rows: 9 } },
    ]);

    await tx.insert(changes).values([
      { id: ids.change1, projectId, areaId: ids.areaHcm, kind: "update", summary: "Updated HCM position sync", createdAt: now },
      { id: ids.change2, projectId, areaId: ids.areaFin, kind: "add", summary: "Added GL segment validation", createdAt: now },
    ]);

    await tx.insert(comments).values([
      { id: ids.cmt1, projectId, areaId: ids.areaHcm, body: "Please verify job catalog mapping.", author: "System", createdAt: now },
      { id: ids.cmt2, projectId, areaId: ids.areaFin, body: "Need sign-off on journal import.", author: "System", createdAt: now },
    ]);

    await tx.insert(releases).values([
      { id: ids.rel1, projectId, title: "Test Release", startsAt: dayjs().add(7, 'days').toDate(), kind: "ics", channel: "staging", tag: "v0.1.0-test", createdAt: now },
    ]);

    // Artifacts: CSV export + Area ZIP for HCM
    await tx.insert(artifacts).values([
      {
        id: ids.art1,
        orgId: devOrgId,
        projectId,
        title: "hcm_export.csv",
        path: `/uploads/${projectId}/hcm_export.csv`,
        mimeType: "text/csv",
        source: "export",
        area: "HCM",
        chunkCount: 1,
        createdAt: now
      },
      {
        id: ids.artZip,
        orgId: devOrgId,
        projectId,
        title: "hcm_area_export.zip",
        path: `/uploads/${projectId}/hcm_area_export.zip`,
        mimeType: "application/zip",
        source: "area_zip",  // Critical: endpoint expects this
        area: "HCM",
        chunkCount: 0,
        createdAt: now
      }
    ]);

    // NEW: notification tied to the current user (so unseen count > 0)
    await tx.insert(notifications).values([
      { 
        id: ids.notif1, 
        orgId: devOrgId, 
        projectId, 
        userId: userId || null,  // Must match authenticated user for count to work
        title: "Weekly digest ready", 
        kind: "digest_ready", 
        seen: false, 
        createdAt: now, 
        payload: { areas: ["HCM","FIN"] } 
      },
    ]);

    // NEW: calendar event for ICS generation (future dates for proper ICS rendering)
    const futureStart = dayjs().add(2, "days").toDate();  // 2 days from now
    const futureEnd = dayjs(futureStart).add(1, "hour").toDate();
    await tx.insert(calendarEvents).values([
      { 
        id: ids.cal1, 
        projectId, 
        title: "Stage Gate", 
        startsAt: futureStart,  // Future date ensures ICS generation works
        endsAt: futureEnd, 
        channel: "staging", 
        createdAt: now 
      }
    ]);

    await tx.insert(signoffs).values([
      { token: ids.sign1, projectId, status: "issued", createdAt: now },
    ]);
  });

  // Verify counts
  const count = async (table: any, column = 'project_id') => {
    const result = await db.execute(sql`select count(*)::int as c from ${table} where ${sql.identifier(column)} = ${projectId}`);
    return Number(result[0]?.c ?? 0);
  };

  const inserted = {
    projects: await count(projects, 'id'),  // projects table uses 'id' not 'project_id'
    areas: await count(areas),
    workbooks: await count(workbooks),
    reports: await count(reports),
    changes: await count(changes),
    comments: await count(comments),
    releases: await count(releases),
    artifacts: await count(artifacts),
    notifications: await count(notifications),
    calendarEvents: await count(calendarEvents),
    signoffs: await count(signoffs),
  };

  return { ok: true, projectId, inserted };
}