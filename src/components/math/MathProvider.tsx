import { MathJaxContext } from 'better-react-mathjax';
import { getMathRenderer } from '../../config/mathRenderer';

const mathJaxConfig = {
  loader: { load: ['[tex]/ams', '[tex]/noerrors'] },
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
    processEscapes: true,
    packages: { '[+]': ['ams', 'noerrors'] },
  },
  options: {
    enableMenu: false,
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
  },
};

export function MathProvider({ children }: { children: React.ReactNode }) {
  if (getMathRenderer() !== 'mathjax') {
    return <>{children}</>;
  }
  return <MathJaxContext config={mathJaxConfig}>{children}</MathJaxContext>;
}
