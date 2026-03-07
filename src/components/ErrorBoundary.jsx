import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 24, margin: 16,
          background: 'rgba(181,64,58,0.06)',
          border: '1px solid rgba(181,64,58,0.2)',
          borderRadius: 10,
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#b5403a', marginBottom: 8 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 12, color: '#6b6b6b', marginBottom: 12 }}>
            {this.state.error?.message || 'An unexpected error occurred in this component.'}
          </div>
          <button
            className="btn"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ fontSize: 11 }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
