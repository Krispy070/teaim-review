import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { authFetch } from "@/lib/authFetch";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/App";
import PageHeaderHint from "@/components/PageHeaderHint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface BrandingSettings {
  customer_name?: string;
  vendor_name?: string;
  customer_logo_path?: string;
  vendor_logo_path?: string;
  theme_color?: string;
  header_text?: string;
}

export default function BrandingSettings() {
  const { toast } = useToast();
  const { projectId } = useOrg() || {};
  const [formData, setFormData] = useState<BrandingSettings>({});
  const [logoRefresh, setLogoRefresh] = useState(0); // For cache-busting logo previews

  // Query branding settings
  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['/api/branding/settings', projectId],
    queryFn: async () => {
      try {
        const url = projectId ? `/api/branding/settings?project_id=${projectId}` : '/api/branding/settings';
        const response = await authFetch(url);
        if (!response.ok) {
          throw new Error(`Failed to load branding settings: ${response.status}`);
        }
        return response.json() as Promise<BrandingSettings>;
      } catch (error) {
        console.error('Branding settings query error:', error);
        throw error;
      }
    },
    enabled: !!projectId, // Only run query when projectId is available
  });

  // Handle query errors separately
  useEffect(() => {
    if (error) {
      toast({
        title: "Error loading branding settings",
        description: "Please try refreshing the page",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  // Update form data when settings load (proper effect pattern)
  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  // Save settings mutation
  const saveMutation = useMutation({
    mutationFn: async (data: BrandingSettings) => {
      try {
        const url = projectId ? `/api/branding/settings?project_id=${projectId}` : '/api/branding/settings';
        const response = await authFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (!response.ok) {
          throw new Error(`Save failed: ${response.status}`);
        }
        return response.json();
      } catch (error) {
        console.error('Save branding settings error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/branding/settings', projectId] });
      toast({
        title: "Branding settings saved",
        description: "Your changes have been applied successfully",
      });
    },
    onError: (error) => {
      console.error('Save mutation error:', error);
      toast({
        title: "Failed to save settings",
        description: "Please try again",
        variant: "destructive",
      });
    }
  });

  // Logo upload mutations
  const uploadMutation = useMutation({
    mutationFn: async ({ type, file }: { type: 'customer' | 'vendor', file: File }) => {
      console.log('🔧 Upload mutation starting:', { type, fileName: file.name });
      const formData = new FormData();
      formData.append('file', file);
      // For file uploads, we need to use authFetch for proper authentication and add project_id parameter
      const url = `/api/branding/upload_${type}${projectId ? `?project_id=${projectId}` : ''}`;
      console.log('🔧 Making upload request to:', url);
      const response = await authFetch(url, { 
        method: 'POST', 
        body: formData 
      });
      console.log('🔧 Upload response received:', { status: response.status, ok: response.ok });
      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔧 Upload failed:', { status: response.status, error: errorText });
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      console.log('🔧 Upload success:', data);
      // Update the path and force logo refresh for immediate preview
      setFormData(prev => ({
        ...prev,
        [`${variables.type}_logo_path`]: data.path
      }));
      
      // Force logo refresh by incrementing cache buster
      setLogoRefresh(prev => prev + 1);
      
      // Refresh header logos immediately for live preview
      refreshHeaderSoon();
      
      queryClient.invalidateQueries({ queryKey: ['/api/branding/settings', projectId] });
      toast({
        title: "Logo uploaded successfully",
        description: "Your logo has been updated and previewed in header",
      });
    },
    onError: (error) => {
      console.error('🔧 Upload error caught:', error);
      toast({
        title: "Failed to upload logo",
        description: "Please try again with a valid image file",
        variant: "destructive",
      });
    }
  });

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  // Helper function to refresh header images
  const refreshHeaderSoon = () => {
    try {
      // Force header logo re-fetch by adding timestamp
      const logos = document.querySelectorAll('img[alt="customer"], img[alt="vendor"]');
      logos.forEach((el) => {
        const img = el as HTMLImageElement;
        if (img.src) {
          img.src = img.src.includes('?') 
            ? img.src.replace(/[?&]t=\d+/, `&t=${Date.now()}`)
            : img.src + `?t=${Date.now()}`;
        }
      });
    } catch {}
  };

  const handleUpload = (type: 'customer' | 'vendor', file: File) => {
    console.log('🔧 handleUpload called:', { type, fileName: file.name, fileSize: file.size, fileType: file.type });
    uploadMutation.mutate({ type, file });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <PageHeaderHint id="branding" title="Branding" intro="Add customer & vendor logos and theme color." bullets={["Shown in header, sign-off pages, and digest emails"]}/>
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <PageHeaderHint id="branding" title="Branding" intro="Add customer & vendor logos and theme color." bullets={["Shown in header, sign-off pages, and digest emails"]}/>
        <div className="text-red-500">Failed to load branding settings. Please refresh the page.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeaderHint id="branding" title="Branding" intro="Add customer & vendor logos and theme color." bullets={["Shown in header, sign-off pages, and digest emails"]}/>
      
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Customer Branding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Customer Name</label>
              <Input
                placeholder="Customer Name"
                value={formData.customer_name || ""}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                data-testid="input-customer-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Customer Logo</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                <input
                  id="customer-logo-input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    console.log('🔧 SIMPLE Customer file input onChange triggered:', e.target.files, Date.now());
                    if (e.target.files?.[0]) {
                      console.log('🔧 SIMPLE Customer file selected, calling handleUpload:', e.target.files[0].name);
                      handleUpload("customer", e.target.files[0]);
                    }
                  }}
                  style={{ display: 'none' }}
                  data-testid="input-customer-logo"
                />
                <label 
                  htmlFor="customer-logo-input" 
                  className="cursor-pointer inline-block bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                  onClick={() => console.log('🔧 SIMPLE Customer label clicked at:', Date.now())}
                >
                  📁 Choose Customer Logo File
                </label>
                <p className="text-sm text-gray-500 mt-2">Click to upload an image file</p>
              </div>
              <div className="text-xs text-muted-foreground mt-1" data-testid="text-customer-logo-status">
                {formData.customer_logo_path ? (
                  <div className="flex items-center gap-2">
                    <span>Logo uploaded:</span>
                    <span className="font-mono text-xs">{formData.customer_logo_path.split('/').pop()}</span>
                  </div>
                ) : (
                  "No logo uploaded"
                )}
              </div>
              {formData.customer_logo_path && (
                <div className="mt-2">
                  <img 
                    src={`/api/branding/logo?which=customer${projectId ? `&project_id=${projectId}` : ''}&t=${logoRefresh}`}
                    alt="Customer logo preview" 
                    className="h-16 w-auto rounded border"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    data-testid="img-customer-logo-preview"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Vendor Branding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Vendor Name</label>
              <Input
                placeholder="Vendor Name (e.g., Workday)"
                value={formData.vendor_name || ""}
                onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                data-testid="input-vendor-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Vendor Logo</label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleUpload("vendor", e.target.files[0])}
                disabled={uploadMutation.isPending}
                data-testid="input-vendor-logo"
              />
              <div className="text-xs text-muted-foreground mt-1" data-testid="text-vendor-logo-status">
                {formData.vendor_logo_path ? (
                  <div className="flex items-center gap-2">
                    <span>Logo uploaded:</span>
                    <span className="font-mono text-xs">{formData.vendor_logo_path.split('/').pop()}</span>
                  </div>
                ) : (
                  "No logo uploaded"
                )}
              </div>
              {formData.vendor_logo_path && (
                <div className="mt-2">
                  <img 
                    src={`/api/branding/logo?which=vendor${projectId ? `&project_id=${projectId}` : ''}&t=${logoRefresh}`}
                    alt="Vendor logo preview" 
                    className="h-16 w-auto rounded border"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    data-testid="img-vendor-logo-preview"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Theme Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Theme Color</label>
            <Input
              type="color"
              value={formData.theme_color || "#111111"}
              onChange={(e) => {
                const v = e.target.value;
                setFormData({ ...formData, theme_color: v });
                // Apply live preview immediately
                try { 
                  document.documentElement.style.setProperty('--brand-primary', v);
                  document.documentElement.style.setProperty('--brand-color', v); 
                } catch {}
              }}
              className="w-32"
              data-testid="input-theme-color"
            />
            <p className="text-xs text-muted-foreground mt-1">Changes preview instantly in the header</p>
          </div>
          <div>
            <label className="text-sm font-medium">Header Text (optional)</label>
            <Input
              placeholder="Header Text"
              value={formData.header_text || ""}
              onChange={(e) => setFormData({ ...formData, header_text: e.target.value })}
              data-testid="input-header-text"
            />
          </div>
        </CardContent>
      </Card>

      <Button 
        onClick={handleSave} 
        disabled={saveMutation.isPending}
        data-testid="button-save"
      >
        {saveMutation.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}