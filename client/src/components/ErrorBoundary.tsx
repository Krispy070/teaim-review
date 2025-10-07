import React from "react";

type State = { hasError: boolean; message?: string };
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(err: any) {
    return { hasError: true, message: String(err?.message || "Something went wrong") };
  }

  componentDidCatch(err: any, info: any) {
    console.error("[ui-crash]", err, info?.componentStack);
  }

  reset = () => this.setState({ hasError: false, message: "" });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="p-6">
        <div className="text-lg font-semibold mb-2">Something went wrong</div>
        <div className="text-sm opacity-80 mb-3">{this.state.message}</div>
        <div className="flex items-center gap-2">
          <button className="text-xs px-2 py-1 border rounded" onClick={this.reset} data-testid="button-error-try-again">Try again</button>
          <button className="text-xs px-2 py-1 border rounded" onClick={() => location.reload()} data-testid="button-error-reload">Reload</button>
        </div>
      </div>
    );
  }
}