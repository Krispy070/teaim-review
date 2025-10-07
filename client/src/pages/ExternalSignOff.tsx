import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';

interface TokenValidationResponse {
  ok: boolean;
  stage_title: string;
  stage_status: string;
  email: string;
}

interface DecisionRequest {
  decision: 'approved' | 'rejected';
  notes?: string;
}

export default function ExternalSignOff() {
  const [location, setLocation] = useLocation();
  // Extract token from URL path /signoff/:token
  const token = location.split('/').pop();
  const [tokenData, setTokenData] = useState<TokenValidationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Validate token on mount
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setError('No token provided');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/signoff/token/validate?token=${encodeURIComponent(token)}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `HTTP ${response.status}`);
        }

        const data: TokenValidationResponse = await response.json();
        setTokenData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to validate token');
      } finally {
        setLoading(false);
      }
    };

    validateToken();
  }, [token]);

  const handleDecision = async () => {
    if (!decision || !token) return;

    setSubmitting(true);
    try {
      const requestBody: DecisionRequest = {
        decision,
        notes: notes.trim() || undefined
      };

      const response = await fetch(`/api/signoff/token/decision?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const result = await response.json();
      // Navigate to success page with result data stored in localStorage
      try {
        localStorage.setItem('signoff-success-data', JSON.stringify({
          decision, 
          stage_title: tokenData?.stage_title,
          notes: notes.trim()
        }));
      } catch (e) {
        console.error('Failed to store success data', e);
      }
      setLocation('/signoff/success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit decision');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Validating token...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-400">
              <AlertCircle className="h-5 w-5" />
              Invalid Token
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tokenData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-2xl" data-testid="signoff-title">
            Stage Sign-Off Request
          </CardTitle>
          <CardDescription>
            You've been requested to approve or reject a project stage.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Stage Information */}
          <div className="bg-slate-800 p-4 rounded-lg space-y-2">
            <h3 className="font-semibold text-lg" data-testid="stage-title">
              {tokenData.stage_title}
            </h3>
            <p className="text-sm text-muted-foreground">
              Current Status: <span className="capitalize font-medium">{tokenData.stage_status}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Requested from: <span className="font-medium">{tokenData.email}</span>
            </p>
          </div>

          {/* Decision Section */}
          {!decision && (
            <div className="space-y-4">
              <h4 className="font-semibold">Please make your decision:</h4>
              <div className="grid grid-cols-2 gap-4">
                <Button
                  onClick={() => setDecision('approved')}
                  className="h-20 flex flex-col items-center gap-2 bg-green-600 hover:bg-green-700"
                  data-testid="button-approve"
                >
                  <CheckCircle className="h-6 w-6" />
                  Approve Stage
                </Button>
                <Button
                  onClick={() => setDecision('rejected')}
                  variant="destructive"
                  className="h-20 flex flex-col items-center gap-2"
                  data-testid="button-reject"
                >
                  <XCircle className="h-6 w-6" />
                  Reject Stage
                </Button>
              </div>
            </div>
          )}

          {/* Notes Section */}
          {decision && (
            <div className="space-y-4">
              <Alert className={decision === 'approved' ? 'border-green-500' : 'border-red-500'}>
                <AlertDescription className="flex items-center gap-2">
                  {decision === 'approved' ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  You've chosen to <strong>{decision === 'approved' ? 'approve' : 'reject'}</strong> this stage.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any comments about your decision..."
                  className="bg-slate-800 border-slate-700"
                  rows={4}
                  data-testid="input-notes"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleDecision}
                  disabled={submitting}
                  className="flex-1"
                  data-testid="button-submit"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Submitting...
                    </>
                  ) : (
                    `Confirm ${decision === 'approved' ? 'Approval' : 'Rejection'}`
                  )}
                </Button>
                <Button
                  onClick={() => setDecision(null)}
                  variant="outline"
                  disabled={submitting}
                  data-testid="button-change-decision"
                >
                  Change Decision
                </Button>
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}