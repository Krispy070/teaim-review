import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Keyboard, FileText, Calendar, Shield, Settings, Zap, Database } from "lucide-react";

export function HelpModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      // Ctrl+? or Cmd+? (with Shift key because ? is Shift+/)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "?") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" data-testid="dialog-help">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            TEAIM Help & Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 text-sm">
          {/* Keyboard Shortcuts */}
          <section>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Keyboard className="h-4 w-4" />
              Keyboard Shortcuts
            </h3>
            <table className="w-full border-collapse">
              <tbody>
                <tr className="border-b">
                  <td className="py-2 pr-4 font-mono text-xs bg-muted/50 px-2 rounded">Ctrl/Cmd + ?</td>
                  <td className="py-2">Toggle this help modal</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4 font-mono text-xs bg-muted/50 px-2 rounded">Esc</td>
                  <td className="py-2">Close dialogs and modals</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Feature Overview */}
          <section>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Key Features
            </h3>
            <div className="grid gap-3">
              <div className="border rounded-lg p-3">
                <div className="font-medium flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4" />
                  Document Intelligence
                </div>
                <p className="text-xs opacity-80">
                  Upload documents to automatically extract actions, decisions, risks, and test cases. 
                  Use "Ask Kap" for context-aware Q&A with source citations.
                </p>
              </div>

              <div className="border rounded-lg p-3">
                <div className="font-medium flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4" />
                  Project Planning
                </div>
                <p className="text-xs opacity-80">
                  Manage releases, stages, cadences, and training schedules. 
                  Export calendars as ICS files for Outlook/Google Calendar integration.
                </p>
              </div>

              <div className="border rounded-lg p-3">
                <div className="font-medium flex items-center gap-2 mb-1">
                  <Shield className="h-4 w-4" />
                  M&A Module
                </div>
                <p className="text-xs opacity-80">
                  Track integrations with Kanban/Grid/Graph views, manage risks with heatmap exports, 
                  maintain playbooks and lessons learned.
                </p>
              </div>

              <div className="border rounded-lg p-3">
                <div className="font-medium flex items-center gap-2 mb-1">
                  <Database className="h-4 w-4" />
                  Data Management
                </div>
                <p className="text-xs opacity-80">
                  Export actions, test cases, and risks to CSV. 
                  Generate comprehensive project backup ZIPs from the dashboard.
                </p>
              </div>

              <div className="border rounded-lg p-3">
                <div className="font-medium flex items-center gap-2 mb-1">
                  <Settings className="h-4 w-4" />
                  Admin Tools
                </div>
                <p className="text-xs opacity-80">
                  API Keys for programmatic access, SSO configuration, 
                  worker health monitoring, and activity audit logs.
                </p>
              </div>
            </div>
          </section>

          {/* Quick Tips */}
          <section>
            <h3 className="font-semibold mb-2">Quick Tips</h3>
            <ul className="space-y-2 text-xs list-disc list-inside opacity-80">
              <li>Use the notification bell (top-right) to track updates and mentions</li>
              <li>Forward emails to your project's ingest address to auto-import documents</li>
              <li>Create API keys from Project Settings → API Keys for CLI/automation</li>
              <li>Export training schedules and releases as .ics calendar files</li>
              <li>Use bulk operations in Training and Integrations for faster workflows</li>
              <li>Drag-and-drop to reschedule training sessions in calendar view</li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
