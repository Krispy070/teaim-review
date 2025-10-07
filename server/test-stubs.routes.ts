import { Router } from "express";
import { requireRole } from "./auth/supabaseAuth";

export const testStubsRouter = Router();

// Digest preview HTML stub (admin only)
testStubsRouter.get("/digest/preview", requireRole("admin"), (req, res) => {
  const { project_id, digest_type } = req.query;
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>${digest_type || 'weekly'} Digest Preview</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; }
    .meta { color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <h1>${digest_type || 'Weekly'} Digest Preview</h1>
  <div class="meta">Project ID: ${project_id}</div>
  <p>This is a stub digest preview for testing purposes.</p>
  <p><strong>Note:</strong> Real digest content would appear here with updates, actions, and metrics.</p>
</body>
</html>`;
  
  res.type("text/html").send(htmlContent);
});

// Area export ZIP stub (admin only)
testStubsRouter.get("/area/export.zip", requireRole("admin"), (req, res) => {
  const { project_id, area } = req.query;
  
  // Create a minimal valid ZIP file (empty ZIP)
  // PK\x05\x06 is the End of Central Directory signature for an empty ZIP
  const emptyZipBuffer = Buffer.from([
    0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00
  ]);
  
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${area || 'area'}-export-${project_id}.zip"`);
  res.send(emptyZipBuffer);
});

// Notifications count stub (admin only)
testStubsRouter.get("/notifications/count", requireRole("admin"), (req, res) => {
  const { project_id } = req.query;
  res.json({ 
    ok: true, 
    count: 0,
    project_id
  });
});

// Releases ICS calendar stub (admin only)
testStubsRouter.get("/releases/month.ics", requireRole("admin"), (req, res) => {
  const { project_id, year, month } = req.query;
  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TEAIM//Releases Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Releases ${year}-${month}`,
    "X-WR-TIMEZONE:UTC",
    "X-PROJECT-ID:" + project_id,
    "BEGIN:VEVENT",
    `UID:stub-release-${project_id}-${year}${month}@teaim.app`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART:${year}${month}01T120000Z`,
    `DTEND:${year}${month}01T130000Z`,
    "SUMMARY:Stub Release Event",
    "DESCRIPTION:This is a stub release event for testing",
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
  
  res.setHeader("Content-Type", "text/calendar");
  res.send(icsContent);
});
