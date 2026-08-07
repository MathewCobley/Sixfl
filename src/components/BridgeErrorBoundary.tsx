"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  failed: boolean;
};

export default class BridgeErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("SIXFL route bridge failed; keeping page content visible", {
      error,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
