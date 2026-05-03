"use client";

import { Component } from "react";

export default class TabErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (typeof window !== "undefined") {
      console.error("[image-gen tab error]", error, info);
    }
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error);
      return (
        <div className="bg-surface border border-red-500/30 rounded-lg p-6 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <span className="material-symbols-outlined text-[20px]">error</span>
            <h3 className="font-semibold">Tab này lỗi runtime — không phải lỗi server</h3>
          </div>
          <pre className="text-xs text-text-muted whitespace-pre-wrap break-words bg-black/5 dark:bg-white/5 p-3 rounded max-h-48 overflow-auto">
            {msg}
          </pre>
          <button
            type="button"
            onClick={this.handleReset}
            className="self-start px-3 py-1.5 rounded bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium cursor-pointer transition-colors"
          >
            Thử lại
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
