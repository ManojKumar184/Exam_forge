const checkBrackets = (t) => {
  const stack = [];
  const open = ['(', '[', '{'];
  const close = [')', ']', '}'];
  for (const char of t) {
    const oIdx = open.indexOf(char);
    if (oIdx !== -1) {
      stack.push({ char, idx: t.indexOf(char) });
    }
    const cIdx = close.indexOf(char);
    if (cIdx !== -1) {
      if (stack.length === 0) {
        console.log('Unmatched close bracket', char, 'at', t.indexOf(char));
        return false;
      }
      const last = stack.pop();
      if (last.char !== open[cIdx]) {
        console.log('Mismatch: expected', last.char, 'to match', char);
        return false;
      }
    }
  }
  if (stack.length > 0) {
    console.log('Unclosed brackets:', stack);
    return false;
  }
  return true;
};

const q2Text = `Q2)A small bob of mass 100 mg and charge  $+10μC$ is connected to an insulating string of length 1 m . It is brought near to an infinitely long non-conducting sheet of charge density '  $σ$ ' as shown in figure. If string subtends an angle of  $45^{∘}$ with the sheet at equilibrium the charge density of sheet will be :(Given  $ε_0=8.85×10^{-12}\\frac{F}{m}$ add acceleration due to gravity,  $g=10m/s^{2}$ )`;

console.log('Q2 checkBrackets result:', checkBrackets(q2Text));
