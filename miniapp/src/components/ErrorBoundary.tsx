import { Component, lazy, type ErrorInfo, type ReactNode, type ComponentType } from "react";
import { WarningCircle } from "@phosphor-icons/react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, retry: () => void) => ReactNode);
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export function retryableLazy<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await importFn();
    } catch (e) {
      console.error("[retryableLazy] first attempt failed, retrying", e);
      return await importFn();
    }
  });
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      const fallback = this.props.fallback;
      if (typeof fallback === "function") {
        return fallback(this.state.error!, this.handleRetry);
      }
      if (fallback) return fallback;
      return <DefaultErrorFallback error={this.state.error!} onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

export function DefaultErrorFallback({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry?: () => void;
}) {
  return (
    <div className="error-fallback">
      <WarningCircle size={40} weight="bold" className="error-fallback-icon" />
      <p className="error-fallback-title">Что-то пошло не так</p>
      {error && (
        <p className="error-fallback-message">
          {error.message}
        </p>
      )}
      {onRetry && (
        <button className="glass-button primary" onClick={onRetry}>
          На главную
        </button>
      )}
    </div>
  );
}
