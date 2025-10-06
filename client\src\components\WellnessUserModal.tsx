import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { getJSON } from "@/lib/authFetch";
import { downloadGET } from "@/lib/download";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Download, TrendingUp, Calendar, MessageSquare, FileText } from "lucide-react";
import WellnessTrendLine from "./WellnessTrendLine";

interface WellnessHistoryItem {
  created_at: string;
  score: number;
  comment: string;
}

interface WellnessUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  userEmail: string;
}

export default function WellnessUserModal({
  isOpen,
  onClose,
  userId,
  userName,
  userEmail
}: WellnessUserModalProps) {
  const { projectId } = useParams();
  const [history, setHistory] = useState<WellnessHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingHTML, setExportingHTML] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => {
    if (isOpen && userId && projectId) {
      loadHistory();
    }
  }, [isOpen, userId, projectId, start, end]);

  async function loadHistory() {
    if (!projectId || !userId) return;
    setLoading(true);
    try {
      const qs = [`project_id=${projectId}`, `user_id=${encodeURIComponent(userId)}`];
      if (start) qs.push(`start=${start}`); 
      if (end) qs.push(`end=${end}`);
      const data = await getJSON<{ items: WellnessHistoryItem[] }>(
        `/api/wellness/user_history?${qs.join("&")}`
      );
      setHistory(data.items || []);
    } catch (error) {
      console.error('Failed to load wellness history:', error);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }

  async function exportUserData() {
    if (!projectId || !userId) return;
    setExporting(true);
    try {
      const qs = [`project_id=${projectId}`, `user_id=${encodeURIComponent(userId)}`];
      if (start) qs.push(`start=${start}`); 
      if (end) qs.push(`end=${end}`);
      await downloadGET(
        `/api/wellness/user_export.csv?${qs.join("&")}`,
        `wellness_${userName.replace(/\s+/g, '_')}_${userId.slice(0, 8)}.csv`
      );
    } catch (error) {
      console.error('Failed to export user wellness data:', error);
    } finally {
      setExporting(false);
    }
  }

  async function exportUserHTML() {
    if (!projectId || !userId) return;
    setExportingHTML(true);
    try {
      const qs = [`project_id=${projectId}`, `user_id=${encodeURIComponent(userId)}`];
      if (start) qs.push(`start=${start}`); 
      if (end) qs.push(`end=${end}`);
      await downloadGET(
        `/api/wellness/user_export.html?${qs.join("&")}`,
        `wellness_report_${userName.replace(/\s+/g, '_')}_${userId.slice(0, 8)}.html`
      );
    } catch (error) {
      console.error('Failed to export user wellness HTML report:', error);
    } finally {
      setExportingHTML(false);
    }
  }

  function getScoreColor(score: number) {
    if (score >= 4) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    if (score >= 3) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  }

  function formatDate(dateStr: string) {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  }

  // Use all filtered history data for trend analysis
  const avgScore = history.length > 0 
    ? (history.reduce((sum, item) => sum + item.score, 0) / history.length).toFixed(1)
    : 'N/A';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]" data-testid="wellness-user-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5" />
            <div>
              <div>{userName}</div>
              <div className="text-sm text-muted-foreground font-normal">{userEmail}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{history.length}</div>
                <div className="text-xs text-muted-foreground">Check-ins</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{avgScore}</div>
                <div className="text-xs text-muted-foreground">Avg Score</div>
              </div>
              {history.length > 0 && (
                <div className="flex-1 min-w-0">
                  <WellnessTrendLine 
                    data={history} 
                    height={80} 
                    showDates={history.length > 5}
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={exportUserData}
                disabled={exporting || history.length === 0}
                variant="outline"
                size="sm"
                data-testid="button-export-user-wellness-csv"
              >
                <Download className="h-4 w-4 mr-2" />
                {exporting ? 'Exporting...' : 'Export CSV'}
              </Button>
              <Button
                onClick={exportUserHTML}
                disabled={exportingHTML || history.length === 0}
                variant="outline"
                size="sm"
                data-testid="button-export-user-wellness-html"
              >
                <FileText className="h-4 w-4 mr-2" />
                {exportingHTML ? 'Exporting...' : 'Export HTML'}
              </Button>
            </div>
          </div>

          {/* Date Range Controls */}
          <div className="p-3 space-y-2 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2">
              <label className="text-xs">Start</label>
              <input type="date" className="border rounded p-1 text-xs" value={start} onChange={e=>setStart(e.target.value)}/>
              <label className="text-xs">End</label>
              <input type="date" className="border rounded p-1 text-xs" value={end} onChange={e=>setEnd(e.target.value)}/>
            </div>
          </div>

          {/* History List */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Wellness History
            </h3>
            
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading history...
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No wellness check-ins recorded for this user.
              </div>
            ) : (
              <ScrollArea className="h-[300px]" data-testid="wellness-history-list">
                <div className="space-y-3 pr-4">
                  {history.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 border rounded-lg"
                      data-testid={`wellness-history-item-${index}`}
                    >
                      <Badge 
                        className={getScoreColor(item.score)}
                        data-testid={`score-badge-${item.score}`}
                      >
                        {item.score}/5
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-muted-foreground mb-1">
                          {formatDate(item.created_at)}
                        </div>
                        {item.comment && (
                          <div className="flex items-start gap-2">
                            <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed">
                              {item.comment}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}