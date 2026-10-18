import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time errors so a single broken component cannot blank out the whole app.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Unhandled UI error:', error, errorInfo.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) return children;
    if (fallback) return fallback(error, this.reset);

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full space-y-4 text-center">
          <div className="flex items-center justify-center w-14 h-14 mx-auto rounded-full bg-destructive/15">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>

          <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            The player hit an unexpected error. You can retry without reloading the page.
          </p>

          <pre className="text-left text-xs text-muted-foreground bg-muted/40 border border-border rounded-md p-3 overflow-auto max-h-40">
            {error.message || 'Unknown error'}
          </pre>

          <button
            type="button"
            onClick={this.reset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground font-medium transition-smooth hover:shadow-glow"
          >
            <RotateCcw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </div>
    );
  }
}
