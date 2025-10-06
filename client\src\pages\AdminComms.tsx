import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

// Simple API functions (replace with your actual API client)
const apiGet = async (endpoint: string) => {
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

const apiPost = async (endpoint: string, data: any) => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

interface CommsSettings {
  tz: string;
  quiet_start: string;
  quiet_end: string;
  daily_send_cap: number;
  weekly_enabled: boolean;
  weekly_day: number;
  weekly_hour: number;
  monthly_enabled: boolean;
  monthly_day: number;
  monthly_hour: number;
  digest_dry_run_to_email?: string;
  digest_dry_run_until?: string;
  sharing_enabled: boolean;
  default_share_expires_sec: number;
}

export default function AdminComms() {
  const [settings, setSettings] = useState<CommsSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [dryEmail, setDryEmail] = useState("");
  const [rules, setRules] = useState<{auto_apply_updates?: boolean; auto_apply_min_conf?: number}>({});
  const [savingRules, setSavingRules] = useState(false);
  const { toast } = useToast();

  async function loadSettings() {
    try {
      const data = await apiGet("/api/comms/settings");
      setSettings(data);
    } catch (error) {
      toast({
        title: "Error Loading Settings",
        description: String(error),
        variant: "destructive",
      });
    }
  }

  async function loadRules() {
    try {
      const data = await apiGet("/api/updates/rules");
      setRules(data);
    } catch (error) {
      console.warn("Failed to load auto-apply rules:", error);
    }
  }

  async function saveRules() {
    setSavingRules(true);
    try {
      await apiPost("/api/updates/rules", {
        auto_apply_updates: !!rules.auto_apply_updates,
        auto_apply_min_conf: Number(rules.auto_apply_min_conf || 0.85)
      });
      toast({
        title: "Rules Saved",
        description: "Auto-apply rules have been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Rules Save Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setSavingRules(false);
    }
  }

  useEffect(() => {
    loadSettings();
    loadRules();
  }, []);

  async function saveSettings() {
    if (!settings) return;
    
    setSaving(true);
    try {
      await apiPost("/api/comms/settings", settings);
      toast({
        title: "Settings Saved",
        description: "Communication settings have been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Save Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function startDryRun() {
    const email = dryEmail || prompt("Send only to this email for 7 days:", "") || "";
    if (!email) return;
    
    try {
      const response = await fetch(`/api/comms/dryrun/start?to_email=${encodeURIComponent(email)}&days=7`, { 
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await response.json();
      toast({
        title: "Dry Run Enabled",
        description: "All digests will now send only to the specified email for 7 days.",
      });
      await loadSettings();
    } catch (error) {
      toast({
        title: "Dry Run Failed",
        description: String(error),
        variant: "destructive",
      });
    }
  }
  
  async function stopDryRun() {
    try {
      const response = await fetch(`/api/comms/dryrun/stop`, { 
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await response.json();
      toast({
        title: "Dry Run Disabled",
        description: "Normal digest distribution restored.",
      });
      await loadSettings();
    } catch (error) {
      toast({
        title: "Stop Dry Run Failed",
        description: String(error),
        variant: "destructive",
      });
    }
  }

  const updateSetting = (key: keyof CommsSettings, value: any) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  if (!settings) {
    return (
      <div className="p-6">
        <div className="text-center">Loading communication settings...</div>
      </div>
    );
  }

  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2" data-testid="title-admin-comms">Communication Settings</h1>
        <p className="text-gray-600">Configure digest scheduling, quiet hours, and email sending limits.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                data-testid="input-timezone"
                value={settings.tz}
                onChange={(e) => updateSetting('tz', e.target.value)}
                placeholder="America/Los_Angeles"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="quiet-start">Quiet Hours Start</Label>
                <Input
                  id="quiet-start"
                  data-testid="input-quiet-start"
                  value={settings.quiet_start}
                  onChange={(e) => updateSetting('quiet_start', e.target.value)}
                  placeholder="21:00:00+00:00"
                />
              </div>
              <div>
                <Label htmlFor="quiet-end">Quiet Hours End</Label>
                <Input
                  id="quiet-end"
                  data-testid="input-quiet-end"
                  value={settings.quiet_end}
                  onChange={(e) => updateSetting('quiet_end', e.target.value)}
                  placeholder="07:00:00+00:00"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="daily-cap">Daily Send Cap</Label>
              <Input
                id="daily-cap"
                data-testid="input-daily-cap"
                type="number"
                value={settings.daily_send_cap}
                onChange={(e) => updateSetting('daily_send_cap', parseInt(e.target.value) || 0)}
                min="1"
                max="1000"
              />
              <p className="text-sm text-gray-500 mt-1">Maximum emails sent per day per project</p>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Digest */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Digest</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="weekly-enabled"
                data-testid="checkbox-weekly-enabled"
                checked={settings.weekly_enabled}
                onCheckedChange={(checked) => updateSetting('weekly_enabled', !!checked)}
              />
              <Label htmlFor="weekly-enabled">Enable Weekly Digests</Label>
            </div>

            {settings.weekly_enabled && (
              <>
                <div>
                  <Label htmlFor="weekly-day">Send Day</Label>
                  <select
                    id="weekly-day"
                    data-testid="select-weekly-day"
                    className="w-full p-2 border rounded-md"
                    value={settings.weekly_day}
                    onChange={(e) => updateSetting('weekly_day', parseInt(e.target.value))}
                  >
                    {dayNames.map((day, index) => (
                      <option key={index} value={index}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="weekly-hour">Send Time (Hour)</Label>
                  <Input
                    id="weekly-hour"
                    data-testid="input-weekly-hour"
                    type="number"
                    value={settings.weekly_hour}
                    onChange={(e) => updateSetting('weekly_hour', parseInt(e.target.value) || 0)}
                    min="0"
                    max="23"
                  />
                  <p className="text-sm text-gray-500 mt-1">24-hour format (0-23)</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Monthly Digest */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Digest</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="monthly-enabled"
                data-testid="checkbox-monthly-enabled"
                checked={settings.monthly_enabled}
                onCheckedChange={(checked) => updateSetting('monthly_enabled', !!checked)}
              />
              <Label htmlFor="monthly-enabled">Enable Monthly Digests</Label>
            </div>

            {settings.monthly_enabled && (
              <>
                <div>
                  <Label htmlFor="monthly-day">Send Day of Month</Label>
                  <Input
                    id="monthly-day"
                    data-testid="input-monthly-day"
                    type="number"
                    value={settings.monthly_day}
                    onChange={(e) => updateSetting('monthly_day', parseInt(e.target.value) || 1)}
                    min="1"
                    max="28"
                  />
                  <p className="text-sm text-gray-500 mt-1">Day 1-28 (avoid 29-31 for consistency)</p>
                </div>

                <div>
                  <Label htmlFor="monthly-hour">Send Time (Hour)</Label>
                  <Input
                    id="monthly-hour"
                    data-testid="input-monthly-hour"
                    type="number"
                    value={settings.monthly_hour}
                    onChange={(e) => updateSetting('monthly_hour', parseInt(e.target.value) || 0)}
                    min="0"
                    max="23"
                  />
                  <p className="text-sm text-gray-500 mt-1">24-hour format (0-23)</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Current Schedule Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Schedule Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div>
                <strong>Weekly:</strong> {settings.weekly_enabled 
                  ? `${dayNames[settings.weekly_day]} at ${settings.weekly_hour}:00 (${settings.tz})`
                  : 'Disabled'}
              </div>
              <div>
                <strong>Monthly:</strong> {settings.monthly_enabled 
                  ? `Day ${settings.monthly_day} at ${settings.monthly_hour}:00 (${settings.tz})`
                  : 'Disabled'}
              </div>
              <div>
                <strong>Quiet Hours:</strong> {settings.quiet_start} to {settings.quiet_end}
              </div>
              <div>
                <strong>Daily Limit:</strong> {settings.daily_send_cap} emails per project
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dry Run Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Digest Dry Run (Testing)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings?.digest_dry_run_until && new Date(settings.digest_dry_run_until) > new Date() ? (
            <div className="space-y-3">
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                <p className="text-sm">
                  <strong>Dry run active:</strong> All digests sending to{" "}
                  <code className="bg-yellow-100 dark:bg-yellow-800 px-1 rounded">
                    {settings.digest_dry_run_to_email}
                  </code>{" "}
                  until {new Date(settings.digest_dry_run_until).toLocaleString()}
                </p>
              </div>
              <Button 
                onClick={stopDryRun} 
                variant="outline"
                data-testid="button-stop-dryrun"
              >
                Stop Dry Run
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Enable dry run to send all digests to a single test email for 7 days.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="test@example.com"
                  value={dryEmail}
                  onChange={(e) => setDryEmail(e.target.value)}
                  data-testid="input-dry-email"
                />
                <Button 
                  onClick={startDryRun} 
                  variant="outline"
                  data-testid="button-start-dryrun"
                >
                  Start Dry Run
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sharing Policy Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Sharing Policy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="sharing-enabled"
              data-testid="checkbox-sharing-enabled"
              checked={settings.sharing_enabled}
              onCheckedChange={(checked) => updateSetting('sharing_enabled', !!checked)}
            />
            <Label htmlFor="sharing-enabled">Enable Public Link Sharing</Label>
          </div>
          <p className="text-sm text-gray-600">
            When disabled, users cannot create new public share links for documents.
          </p>

          <div>
            <Label htmlFor="default-expiry">Default Link Expiry (seconds)</Label>
            <Input
              id="default-expiry"
              data-testid="input-default-expiry"
              type="number"
              value={settings.default_share_expires_sec}
              onChange={(e) => updateSetting('default_share_expires_sec', parseInt(e.target.value) || 3600)}
              min="60"
              max="2592000"
            />
            <p className="text-sm text-gray-500 mt-1">
              Default expiry time for new share links. Range: 60 seconds to 30 days (2,592,000 seconds)
            </p>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
            <p className="text-sm">
              <strong>Current Policy:</strong> {settings.sharing_enabled ? 'Public sharing enabled' : 'Public sharing disabled'} 
              {' '}| Default expiry: {Math.floor(settings.default_share_expires_sec / 3600)}h {Math.floor((settings.default_share_expires_sec % 3600) / 60)}m
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Update Automation Rules */}
      <Card>
        <CardHeader>
          <CardTitle>Update Automation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="auto-apply-updates"
              data-testid="checkbox-auto-apply-updates"
              checked={!!rules.auto_apply_updates}
              onCheckedChange={(checked) => setRules({...rules, auto_apply_updates: !!checked})}
            />
            <Label htmlFor="auto-apply-updates">Auto-apply safe changes</Label>
          </div>
          <p className="text-sm text-gray-600">
            When enabled, high-confidence updates will be automatically applied without PM review.
          </p>

          <div>
            <Label htmlFor="min-confidence">Minimum confidence (0.0–1.0)</Label>
            <Input
              id="min-confidence"
              data-testid="input-min-confidence"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={rules.auto_apply_min_conf ?? 0.85}
              onChange={(e) => setRules({...rules, auto_apply_min_conf: parseFloat(e.target.value || "0.85")})}
              className="mt-1"
            />
            <p className="text-sm text-gray-500 mt-1">
              Only updates with confidence above this threshold will be auto-applied
            </p>
          </div>

          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
            <p className="text-sm">
              <strong>Current Policy:</strong> {rules.auto_apply_updates ? 'Auto-apply enabled' : 'Auto-apply disabled'}
              {' '}| Confidence threshold: {(rules.auto_apply_min_conf ?? 0.85).toFixed(2)}
            </p>
          </div>

          <div className="flex justify-end">
            <Button 
              onClick={saveRules} 
              disabled={savingRules}
              data-testid="button-save-rules"
              className="min-w-32"
              variant="outline"
            >
              {savingRules ? "Saving..." : "Save Rules"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button 
          onClick={saveSettings} 
          disabled={saving}
          data-testid="button-save-settings"
          className="min-w-32"
        >
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}