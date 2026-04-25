'use client';

import { ReactNode, Component, ErrorInfo, useEffect } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { PaymentProvider } from '@/contexts/PaymentContext';

// 테마 초기화 컴포넌트
function ThemeInitializer({ children }: { children: ReactNode }) {
  useEffect(() => {
    // 초기 테마 설정
    const initializeTheme = () => {
      try {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
          document.documentElement.setAttribute('data-theme', 'dark');
        } else if (savedTheme === 'light') {
          document.documentElement.setAttribute('data-theme', 'light');
        } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          document.documentElement.setAttribute('data-theme', 'dark');
        }
      } catch {
        // localStorage 접근 실패 시 무시
      }
    };

    initializeTheme();

    // 시스템 테마 변경 감지
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const savedTheme = localStorage.getItem('theme');
      if (!savedTheme || savedTheme === 'system') {
        document.documentElement.setAttribute(
          'data-theme',
          mediaQuery.matches ? 'dark' : 'light'
        );
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return <>{children}</>;
}

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100vh',
                    padding: '20px',
                    textAlign: 'center',
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                    color: '#fff'
                }}>
                    <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
                        앗, 문제가 발생했어요
                    </h1>
                    <p style={{ color: '#aaa', marginBottom: '1.5rem' }}>
                        예상치 못한 오류가 발생했습니다.<br />
                        페이지를 새로고침 해주세요.
                    </p>
                    <button
                        onClick={this.handleRetry}
                        style={{
                            padding: '12px 24px',
                            fontSize: '1rem',
                            background: '#6366f1',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer'
                        }}
                    >
                        새로고침
                    </button>
                    {process.env.NODE_ENV === 'development' && this.state.error && (
                        <pre style={{
                            marginTop: '2rem',
                            padding: '1rem',
                            background: 'rgba(255,0,0,0.1)',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            textAlign: 'left',
                            maxWidth: '100%',
                            overflow: 'auto'
                        }}>
                            {this.state.error.toString()}
                        </pre>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

interface ProvidersProps {
    children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
    return (
        <ErrorBoundary>
            <ThemeInitializer>
                <AuthProvider>
                    <PaymentProvider>
                        {children}
                    </PaymentProvider>
                </AuthProvider>
            </ThemeInitializer>
        </ErrorBoundary>
    );
}
