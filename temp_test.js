const { runStagesReconstruction } = require('./backend/src/extraction/reconstructionPipeline.js');
const plain = 'If P(A)=0.5 and P(B)=0.3 then P(A∩B)=0.2.';
const html = `<p>${plain}</p>`;
const result = runStagesReconstruction(plain, html, null, null, null);
console.log(JSON.stringify(result, null, 2));
