import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
}

const apiGet = async <T = any,>(endpoint: string, params?: Record<string, string>): Promise<T> => {
  const url = new URL(endpoint, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }
  
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
};

const apiPost = async (endpoint: string, data?: any, params?: Record<string, string>): Promise<any> => {
  const url = new URL(endpoint, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }
  
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: data ? { 'Content-Type': 'application/json' } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
};

export default function ProjectDigestActions({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false);
  const [html, setHtml] = useState<string>("");
  const { toast } = useToast();

  async function preview() {
    setLoading(true);
    try {
      const r = await apiGet<{html: string}>("/api/digest/preview", { project_id: projectId });
      setHtml(r.html);
      toast({
        title: "Preview Generated",
        description: "Digest preview loaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Preview Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally { 
      setLoading(false); 
    }
  }

  async function sendWeekly() {
    setLoading(true);
    try {
      await apiPost("/api/digest/send-weekly", undefined, { project_id: projectId });
      toast({
        title: "Weekly Digest Sent",
        description: "Queued/sent weekly digest (deduped by week). Check comms_send_log.",
      });
    } catch (error) {
      toast({
        title: "Weekly Send Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally { 
      setLoading(false); 
    }
  }

  async function sendMonthly() {
    setLoading(true);
    try {
      await apiPost("/api/digest/send-monthly", undefined, { project_id: projectId });
      toast({
        title: "Monthly Digest Sent", 
        description: "Queued/sent monthly digest (deduped by month).",
      });
    } catch (error) {
      toast({
        title: "Monthly Send Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally { 
      setLoading(false); 
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button 
          variant="outline" 
          size="sm"
          disabled={loading} 
          onClick={preview}
          data-testid="button-digest-preview"
        >
          {loading ? "Loading..." : "Preview"}
        </Button>
        <Button 
          variant="outline" 
          size="sm"
          disabled={loading} 
          onClick={sendWeekly}
          data-testid="button-send-weekly"
        >
          {loading ? "Sending..." : "Send Weekly"}
        </Button>
        <Button 
          variant="outline" 
          size="sm"
          disabled={loading} 
          onClick={sendMonthly}
          data-testid="button-send-monthly"
        >
          {loading ? "Sending..." : "Send Monthly"}
        </Button>
      </div>
      
      {html && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm mb-3 font-medium" data-testid="text-digest-preview">
              Digest Preview
            </div>
            <div 
              className="prose prose-sm max-w-none dark:prose-invert" 
              dangerouslySetInnerHTML={{__html: html}} 
              data-testid="content-digest-html"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}