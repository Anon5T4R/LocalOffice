import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { writeRescue } from "./lib/rescue";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  /** null = rescue still being written; then whether it persisted. */
  rescued: boolean | null;
  /** Bumped on "Recuperar" to remount the app subtree from scratch. */
  epoch: number;
}

/**
 * Last line of defense: a render error anywhere used to white-screen the whole
 * app. Here it snapshots the open documents (see lib/rescue.ts) and offers a
 * clean remount; the remounted App finds the snapshot and restores the tabs.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, rescued: null, epoch: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary:", error, info.componentStack);
    writeRescue().then(
      (ok) => this.setState({ rescued: ok }),
      () => this.setState({ rescued: false })
    );
  }

  private recover = (): void => {
    this.setState((s) => ({ error: null, rescued: null, epoch: s.epoch + 1 }));
  };

  render(): ReactNode {
    const { error, rescued, epoch } = this.state;
    if (error) {
      return (
        <div className="crash-screen" role="alertdialog" aria-label="Erro inesperado">
          <div className="crash-box">
            <h1>Algo deu errado</h1>
            <p>
              {rescued === false
                ? "Não foi possível preservar as alterações mais recentes — o documento voltará ao último salvamento."
                : "Seus documentos abertos foram preservados."}
            </p>
            <button type="button" onClick={this.recover}>
              Recuperar
            </button>
            <details>
              <summary>Detalhes técnicos</summary>
              <pre>{String(error.stack || error)}</pre>
            </details>
          </div>
        </div>
      );
    }
    // key: "Recuperar" remounts the subtree instead of re-rendering the broken
    // one. Fragment, not a div — the app layout expects to be #root's child.
    return <Fragment key={epoch}>{this.props.children}</Fragment>;
  }
}
