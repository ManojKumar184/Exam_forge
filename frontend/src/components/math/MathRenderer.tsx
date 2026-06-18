import { BlockMath, InlineMath } from 'react-katex';
import { MathJax } from 'better-react-mathjax';
import { getMathRenderer } from '../../config/mathRenderer';

interface MathRendererProps {
  latex: string;
  display?: boolean;
  className?: string;
}

function KatexMath({ latex, display, className }: MathRendererProps) {
  if (display) {
    return (
      <div className={`overflow-x-auto my-2 ${className || ''}`}>
        <BlockMath math={latex} />
      </div>
    );
  }
  return <InlineMath math={latex} />;
}

function MathJaxMath({ latex, display, className }: MathRendererProps) {
  const wrapped = display ? `\\[${latex}\\]` : `\\(${latex}\\)`;
  return (
    <MathJax
      inline={!display}
      dynamic
      className={display ? `overflow-x-auto my-2 block ${className || ''}` : className}
    >
      {wrapped}
    </MathJax>
  );
}

/**
 * LaTeX-first rendering abstraction (MathJax default, KaTeX fallback).
 */
export function MathRenderer(props: MathRendererProps) {
  const engine = getMathRenderer();
  if (engine === 'katex') return <KatexMath {...props} />;
  return <MathJaxMath {...props} />;
}
