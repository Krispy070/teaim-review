import { useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";

export default function NotFound() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const timer = setTimeout(() => {
      setLocation("/dashboard");
    }, 5000);
    
    return () => clearTimeout(timer);
  }, [setLocation]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-slate-950">
      <Card className="w-full max-w-md mx-4 border-slate-200 dark:border-slate-800">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 items-center">
            <AlertCircle className="h-8 w-8 text-red-500 dark:text-red-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600 dark:text-slate-400">
            The page you're looking for doesn't exist or has been moved. You'll be redirected to the dashboard in 5 seconds.
          </p>

          <div className="mt-6 flex gap-3">
            <Button 
              onClick={() => setLocation("/dashboard")} 
              className="flex-1"
              data-testid="button-home"
            >
              <Home className="h-4 w-4 mr-2" />
              Go to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
