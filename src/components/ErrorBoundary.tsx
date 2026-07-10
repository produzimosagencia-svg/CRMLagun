import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global error boundary. Sem isto, qualquer erro em tempo de render
 * derruba toda a árvore React e o usuário vê apenas uma tela branca.
 * Aqui capturamos o erro e mostramos uma mensagem legível + ação de recarregar.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Ponto único para plugar um serviço de monitoramento (Sentry, etc.) no futuro.
    console.error("[ErrorBoundary] erro não tratado:", error, info);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          backgroundColor: "#0f0a05",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            Algo deu errado
          </h1>
          <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.55)", marginBottom: "1.25rem" }}>
            A aplicação encontrou um erro inesperado. Tente recarregar a página.
          </p>

          {this.state.error?.message && (
            <pre
              style={{
                fontSize: "0.75rem",
                textAlign: "left",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "0.5rem",
                padding: "0.75rem",
                marginBottom: "1.25rem",
                color: "rgba(255,255,255,0.7)",
                overflowX: "auto",
              }}
            >
              {this.state.error.message}
            </pre>
          )}

          <button
            onClick={this.handleReload}
            style={{
              height: "2.75rem",
              padding: "0 1.5rem",
              borderRadius: "0.75rem",
              fontWeight: 700,
              fontSize: "0.875rem",
              cursor: "pointer",
              background: "linear-gradient(135deg, #E8C766 0%, #e8b830 50%, #E8C766 100%)",
              color: "#1A0800",
              border: "1px solid rgba(255,235,130,0.5)",
            }}
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}
