import { Button } from '../ui';

const SNIPPETS: Array<{ label: string; insert: string; block?: boolean }> = [
  { label: 'Inline', insert: '$x^2$', },
  { label: 'Block', insert: '$$\\frac{a}{b}$$', block: true },
  { label: '√', insert: '$\\sqrt{x}$' },
  { label: '∫', insert: '$\\int_0^1 f(x)\\,dx$' },
  { label: 'Σ', insert: '$\\sum_{i=1}^{n} i$' },
  { label: 'Matrix', insert: '$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$', block: true },
  { label: 'Chem', insert: '$\\mathrm{H_2O}$' },
];

interface LatexToolbarProps {
  onInsert: (snippet: string) => void;
}

export function LatexToolbar({ onInsert }: LatexToolbarProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SNIPPETS.map((s) => (
        <Button key={s.label} type="button" size="sm" variant="outline" onClick={() => onInsert(s.insert)}>
          {s.label}
        </Button>
      ))}
    </div>
  );
}
