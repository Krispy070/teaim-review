import { Component, ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export default class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    (window as any).__dbg = (window as any).__dbg || {};
    (window as any).__dbg.lastError = { message: error.message, stack: error.stack, info: errorInfo };
    console.error("Global error caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
            <h1 className="text-xl font-semibold text-red-400">Something went wrong</h1>
            <p className="text-sm opacity-80">
              An unexpected error occurred. Try refreshing the page or contact support if the problem persists.
            </p>
            <details className="text-xs bg-slate-950 p-3 rounded border border-slate-800 overflow-auto max-h-48">
              <summary className="cursor-pointer text-slate-400 hover:text-slate-200">Error details</summary>
              <pre className="mt-2 text-slate-300">{this.state.error?.message}</pre>
              <pre className="mt-1 text-slate-500 text-[10px]">{this.state.error?.stack}</pre>
            </details>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
