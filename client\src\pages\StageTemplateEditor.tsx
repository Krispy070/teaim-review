import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, X, Save, Trash2, Edit2, FileText, Clock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface StageData {
  name: string;
  area?: string;
  duration_days?: number;
}

interface StageTemplate {
  id?: string;
  name: string;
  description?: string;
  stages: StageData[];
}

interface StageTemplateResponse extends StageTemplate {
  id: string;
  org_id: string;
  created_at: string;
  updated_at: string;
}

export default function StageTemplateEditor() {
  const { toast } = useToast();
  
  // Form state
  const [editingTemplate, setEditingTemplate] = useState<StageTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [stages, setStages] = useState<StageData[]>([]);
  const [newStage, setNewStage] = useState<StageData>({
    name: "",
    area: "",
    duration_days: undefined
  });

  // Fetch templates
  const { data: templatesData, isLoading } = useQuery({
    queryKey: ["/api/stage-templates/list"],
    select: (data: any) => data || []
  });

  const templates: StageTemplateResponse[] = templatesData || [];

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (template: StageTemplate) => {
      return apiRequest("/api/stage-templates/create", "POST", template);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stage-templates/list"] });
      resetForm();
      toast({
        title: "Template Created",
        description: "Stage template has been created successfully."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create template",
        variant: "destructive"
      });
    }
  });

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, template }: { id: string; template: StageTemplate }) => {
      return apiRequest(`/api/stage-templates/${id}`, "PUT", template);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stage-templates/list"] });
      resetForm();
      toast({
        title: "Template Updated",
        description: "Stage template has been updated successfully."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update template",
        variant: "destructive"
      });
    }
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/stage-templates/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stage-templates/list"] });
      toast({
        title: "Template Deleted",
        description: "Stage template has been deleted successfully."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete template",
        variant: "destructive"
      });
    }
  });

  const resetForm = () => {
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateDescription("");
    setStages([]);
    setNewStage({ name: "", area: "", duration_days: undefined });
  };

  const startEditing = (template: StageTemplateResponse) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateDescription(template.description || "");
    setStages(template.stages);
  };

  const addStage = () => {
    if (newStage.name.trim()) {
      setStages([...stages, { 
        name: newStage.name.trim(), 
        area: newStage.area?.trim() || undefined,
        duration_days: newStage.duration_days || undefined
      }]);
      setNewStage({ name: "", area: "", duration_days: undefined });
    }
  };

  const removeStage = (index: number) => {
    setStages(stages.filter((_, i) => i !== index));
  };

  const updateStage = (index: number, field: keyof StageData, value: any) => {
    const updatedStages = [...stages];
    updatedStages[index] = { 
      ...updatedStages[index], 
      [field]: field === 'duration_days' ? (value ? parseInt(value) : undefined) : value 
    };
    setStages(updatedStages);
  };

  const handleSubmit = () => {
    if (!templateName.trim()) {
      toast({
        title: "Validation Error",
        description: "Template name is required",
        variant: "destructive"
      });
      return;
    }

    if (stages.length === 0) {
      toast({
        title: "Validation Error", 
        description: "At least one stage is required",
        variant: "destructive"
      });
      return;
    }

    const template: StageTemplate = {
      name: templateName.trim(),
      description: templateDescription.trim() || undefined,
      stages
    };

    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id!, template });
    } else {
      createTemplateMutation.mutate(template);
    }
  };

  const handleDelete = (template: StageTemplateResponse) => {
    if (confirm(`Are you sure you want to delete the template "${template.name}"? This action cannot be undone.`)) {
      deleteTemplateMutation.mutate(template.id);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center space-x-2 mb-6">
          <FileText className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Stage Template Editor</h1>
        </div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-stage-template-editor">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <FileText className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Stage Template Editor</h1>
        </div>
        {editingTemplate && (
          <Button
            variant="outline"
            onClick={resetForm}
            data-testid="button-cancel-edit"
          >
            Cancel Edit
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Template Form */}
        <Card data-testid="card-template-form">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {editingTemplate ? <Edit2 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {editingTemplate ? "Edit Template" : "Create New Template"}
            </CardTitle>
            <CardDescription>
              {editingTemplate ? "Modify existing stage template" : "Define a reusable set of project stages"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Template Details */}
            <div className="space-y-3">
              <div>
                <Label htmlFor="template-name">Template Name*</Label>
                <Input
                  id="template-name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g., Workday Implementation"
                  data-testid="input-template-name"
                />
              </div>
              <div>
                <Label htmlFor="template-description">Description</Label>
                <Textarea
                  id="template-description"
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="Brief description of when to use this template..."
                  rows={2}
                  data-testid="textarea-template-description"
                />
              </div>
            </div>

            <Separator />

            {/* Stages Section */}
            <div className="space-y-3">
              <h3 className="font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Stages ({stages.length})
              </h3>

              {/* Existing Stages */}
              {stages.map((stage, index) => (
                <div key={index} className="flex items-center gap-2 p-3 border rounded-lg" data-testid={`stage-item-${index}`}>
                  <div className="flex-1 space-y-2">
                    <Input
                      value={stage.name}
                      onChange={(e) => updateStage(index, 'name', e.target.value)}
                      placeholder="Stage name"
                      data-testid={`input-stage-name-${index}`}
                    />
                    <div className="flex gap-2">
                      <Input
                        value={stage.area || ""}
                        onChange={(e) => updateStage(index, 'area', e.target.value)}
                        placeholder="Area (optional)"
                        className="flex-1"
                        data-testid={`input-stage-area-${index}`}
                      />
                      <Input
                        type="number"
                        value={stage.duration_days || ""}
                        onChange={(e) => updateStage(index, 'duration_days', e.target.value)}
                        placeholder="Days"
                        className="w-20"
                        data-testid={`input-stage-duration-${index}`}
                      />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeStage(index)}
                    data-testid={`button-remove-stage-${index}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}

              {/* Add New Stage */}
              <div className="space-y-2 p-3 border-dashed border-2 rounded-lg">
                <Input
                  value={newStage.name}
                  onChange={(e) => setNewStage({ ...newStage, name: e.target.value })}
                  placeholder="Stage name"
                  data-testid="input-new-stage-name"
                />
                <div className="flex gap-2">
                  <Input
                    value={newStage.area || ""}
                    onChange={(e) => setNewStage({ ...newStage, area: e.target.value })}
                    placeholder="Area (optional)"
                    className="flex-1"
                    data-testid="input-new-stage-area"
                  />
                  <Input
                    type="number"
                    value={newStage.duration_days || ""}
                    onChange={(e) => setNewStage({ ...newStage, duration_days: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="Days"
                    className="w-20"
                    data-testid="input-new-stage-duration"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addStage}
                  disabled={!newStage.name.trim()}
                  data-testid="button-add-stage"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Stage
                </Button>
              </div>
            </div>

            <Separator />

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={!templateName.trim() || stages.length === 0 || createTemplateMutation.isPending || updateTemplateMutation.isPending}
              className="w-full"
              data-testid="button-save-template"
            >
              <Save className="w-4 h-4 mr-2" />
              {editingTemplate ? "Update Template" : "Create Template"}
            </Button>
          </CardContent>
        </Card>

        {/* Templates List */}
        <Card data-testid="card-templates-list">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Existing Templates ({templates.length})
            </CardTitle>
            <CardDescription>
              Manage and edit your organization's stage templates
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No stage templates yet</p>
                <p className="text-sm">Create your first template to get started</p>
              </div>
            ) : (
              templates.map((template) => (
                <div key={template.id} className="border rounded-lg p-4 space-y-3" data-testid={`template-card-${template.id}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium" data-testid={`template-name-${template.id}`}>
                        {template.name}
                      </h4>
                      {template.description && (
                        <p className="text-sm text-muted-foreground mt-1" data-testid={`template-description-${template.id}`}>
                          {template.description}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEditing(template)}
                        data-testid={`button-edit-template-${template.id}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(template)}
                        disabled={deleteTemplateMutation.isPending}
                        data-testid={`button-delete-template-${template.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" data-testid={`template-stages-count-${template.id}`}>
                      {template.stages.length} stages
                    </Badge>
                    {template.stages.some(s => s.area) && (
                      <Badge variant="outline" className="flex items-center gap-1" data-testid={`template-areas-badge-${template.id}`}>
                        <MapPin className="w-3 h-3" />
                        Areas defined
                      </Badge>
                    )}
                    {template.stages.some(s => s.duration_days) && (
                      <Badge variant="outline" className="flex items-center gap-1" data-testid={`template-durations-badge-${template.id}`}>
                        <Clock className="w-3 h-3" />
                        Durations set
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Stages:</p>
                    <div className="flex flex-wrap gap-1">
                      {template.stages.map((stage, index) => (
                        <Badge 
                          key={index} 
                          variant="outline" 
                          className="text-xs"
                          data-testid={`template-stage-badge-${template.id}-${index}`}
                        >
                          {stage.name}
                          {stage.area && ` (${stage.area})`}
                          {stage.duration_days && ` - ${stage.duration_days}d`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}