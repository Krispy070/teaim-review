import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; msg?: string };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(err: any) { return { hasError: true, msg: String(err) }; }
  componentDidCatch(err: any, info: any) { /* no-op; could log to telemetry */ }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6">
          <div className="border rounded p-4 bg-yellow-50">
            <div className="font-semibold mb-1">Something went wrong.</div>
            <div className="text-sm text-muted-foreground">
              The page hit a client-side error. Try refreshing. If this persists, check latest changes.
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}