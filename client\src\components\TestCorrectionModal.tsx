import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCorrections } from "@/hooks/useCorrections";
import { EditIcon } from "lucide-react";

interface TestCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  transcriptId: string;
  test: {
    id: string;
    title: string;
    gherkin: string;
    steps: string[];
    priority: string;
    type: string;
    tags: string[];
  };
}

export function TestCorrectionModal({
  isOpen,
  onClose,
  projectId,
  transcriptId,
  test
}: TestCorrectionModalProps) {
  const { correctTest, isLoading } = useCorrections();
  
  const [fields, setFields] = useState({
    title: test.title,
    gherkin: test.gherkin,
    steps: test.steps,
    priority: test.priority,
    type: test.type,
    tags: test.tags
  });
  
  const [reason, setReason] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await correctTest(projectId, transcriptId, test.id, fields, reason);
      onClose();
    } catch (error) {
      // Error handling is done in the hook via toast
    }
  };

  const handleStepsChange = (value: string) => {
    setFields(prev => ({
      ...prev,
      steps: value.split('\n').filter(line => line.trim())
    }));
  };

  const handleTagsChange = (value: string) => {
    setFields(prev => ({
      ...prev,
      tags: value.split(',').map(tag => tag.trim()).filter(tag => tag)
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <EditIcon className="w-5 h-5" />
            Correct Test from Transcript
          </DialogTitle>
          <DialogDescription>
            Make corrections to this test based on transcript feedback. This will create a new version.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Correction Reason</Label>
            <Input
              id="reason"
              placeholder="e.g., Based on clarification in transcript"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="input-correction-reason"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Test Title</Label>
            <Input
              id="title"
              value={fields.title}
              onChange={(e) => setFields(prev => ({ ...prev, title: e.target.value }))}
              data-testid="input-test-title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gherkin">Gherkin Scenario</Label>
            <Textarea
              id="gherkin"
              rows={6}
              value={fields.gherkin}
              onChange={(e) => setFields(prev => ({ ...prev, gherkin: e.target.value }))}
              placeholder="Given/When/Then scenario..."
              data-testid="input-test-gherkin"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="steps">Test Steps (one per line)</Label>
            <Textarea
              id="steps"
              rows={4}
              value={fields.steps.join('\n')}
              onChange={(e) => handleStepsChange(e.target.value)}
              placeholder="Step 1&#10;Step 2&#10;Step 3"
              data-testid="input-test-steps"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={fields.priority} onValueChange={(value) => setFields(prev => ({ ...prev, priority: value }))}>
                <SelectTrigger data-testid="select-test-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="P1">P1 - Critical</SelectItem>
                  <SelectItem value="P2">P2 - High</SelectItem>
                  <SelectItem value="P3">P3 - Medium</SelectItem>
                  <SelectItem value="P4">P4 - Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Test Type</Label>
              <Select value={fields.type} onValueChange={(value) => setFields(prev => ({ ...prev, type: value }))}>
                <SelectTrigger data-testid="select-test-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="happy">Happy Path</SelectItem>
                  <SelectItem value="sad">Sad Path</SelectItem>
                  <SelectItem value="edge">Edge Case</SelectItem>
                  <SelectItem value="regression">Regression</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              value={fields.tags.join(', ')}
              onChange={(e) => handleTagsChange(e.target.value)}
              placeholder="ui, integration, workflow"
              data-testid="input-test-tags"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading}
              data-testid="button-submit-correction"
            >
              {isLoading ? "Applying Correction..." : "Apply Correction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface CorrectionButtonProps {
  projectId: string;
  transcriptId: string;
  test: {
    id: string;
    title: string;
    gherkin: string;
    steps: string[];
    priority: string;
    type: string;
    tags: string[];
  };
}

export function CorrectionButton({ projectId, transcriptId, test }: CorrectionButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsModalOpen(true)}
        className="gap-2"
        data-testid="button-correct-test"
      >
        <EditIcon className="w-4 h-4" />
        Correct from Transcript
      </Button>

      <TestCorrectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        projectId={projectId}
        transcriptId={transcriptId}
        test={test}
      />
    </>
  );
}