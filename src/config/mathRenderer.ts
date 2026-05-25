export type MathRendererEngine = 'mathjax' | 'katex';

export function getMathRenderer(): MathRendererEngine {
  const v = (import.meta.env.VITE_MATH_RENDERER || 'mathjax').toLowerCase();
  return v === 'katex' ? 'katex' : 'mathjax';
}
