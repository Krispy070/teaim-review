import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/queryClient";

interface CorrectionFields {
  title?: string;
  gherkin?: string;
  steps?: string[];
  priority?: string;
  type?: string;
  tags?: string[];
}

interface CorrectionRequest {
  project_id: string;
  transcript_id: string;
  item_type: string;
  item_id: string;
  reason?: string;
  fields: CorrectionFields;
  created_by?: string;
}

interface CorrectionResponse {
  ok: boolean;
  newId: string;
  version: number;
  message: string;
}

export function useCorrections() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const correctTestMutation = useMutation({
    mutationFn: async (request: CorrectionRequest): Promise<CorrectionResponse> => {
      const response = await authFetch("/api/admin/corrections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to apply correction");
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Correction Applied",
        description: data.message,
      });

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/review/tests"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Correction Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const correctTest = async (
    projectId: string,
    transcriptId: string,
    testId: string,
    fields: CorrectionFields,
    reason?: string
  ) => {
    return correctTestMutation.mutateAsync({
      project_id: projectId,
      transcript_id: transcriptId,
      item_type: "test",
      item_id: testId,
      reason: reason || "Transcript correction",
      fields,
      created_by: undefined, // Will be set by backend from auth context
    });
  };

  return {
    correctTest,
    isLoading: correctTestMutation.isPending,
    error: correctTestMutation.error,
  };
}