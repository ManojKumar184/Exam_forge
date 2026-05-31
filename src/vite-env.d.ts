/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'react-katex' {
  import * as React from 'react';
  export interface MathProps {
    math: string;
    block?: boolean;
    errorColor?: string;
    renderError?: (error: Error) => React.ReactNode;
  }
  export class InlineMath extends React.Component<MathProps> {}
  export class BlockMath extends React.Component<MathProps> {}
}

declare module 'katex/dist/contrib/auto-render' {
  export default function renderMathInElement(
    element: HTMLElement,
    options?: any
  ): void;
}


