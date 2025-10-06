import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle } from 'lucide-react';
import BrandedHeader from '@/components/BrandedHeader';

interface SuccessState {
  decision: 'approved' | 'rejected';
  stage_title?: string;
  notes?: string;
}

export default function SignOffSuccess() {
  const [state, setState] = useState<SuccessState | null>(null);

  // Load state from localStorage (set in ExternalSignOff.tsx)
  useEffect(() => {
    try {
      const storedData = localStorage.getItem('signoff-success-data');
      if (storedData) {
        setState(JSON.parse(storedData));
        localStorage.removeItem('signoff-success-data'); // Clean up
      }
    } catch (e) {
      console.error('Failed to load success data', e);
    }
  }, []);

  if (!state) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-2xl mb-8">
          <BrandedHeader variant="compact" showFallback={true} className="justify-center" />
        </div>
        <Card className="w-full max-w-md bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle>No Decision Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              No decision information was found. Please check your link and try again.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isApproved = state.decision === 'approved';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl mb-8">
        <BrandedHeader variant="compact" showFallback={true} className="justify-center" />
      </div>
      <Card className="w-full max-w-2xl bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-2xl" data-testid="success-title">
            {isApproved ? (
              <CheckCircle className="h-8 w-8 text-green-500" />
            ) : (
              <XCircle className="h-8 w-8 text-red-500" />
            )}
            Decision Recorded Successfully
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="bg-slate-800 p-6 rounded-lg space-y-4">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold" data-testid="decision-summary">
                You have <span className={isApproved ? 'text-green-400' : 'text-red-400'}>
                  {isApproved ? 'approved' : 'rejected'}
                </span> the stage
              </h3>
              
              {state.stage_title && (
                <p className="text-xl font-medium" data-testid="stage-title">
                  "{state.stage_title}"
                </p>
              )}
            </div>

            {state.notes && (
              <div className="border-t border-slate-700 pt-4">
                <h4 className="font-medium mb-2">Your Notes:</h4>
                <p className="text-muted-foreground bg-slate-900 p-3 rounded border" data-testid="decision-notes">
                  {state.notes}
                </p>
              </div>
            )}
          </div>

          <div className="text-center space-y-3">
            <p className="text-lg font-medium text-green-400" data-testid="confirmation-message">
              ✓ Your decision has been recorded
            </p>
            <p className="text-sm text-muted-foreground">
              The project team has been notified of your decision. You can now close this page.
            </p>
            <p className="text-xs text-muted-foreground">
              This approval link is now inactive and cannot be used again.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}