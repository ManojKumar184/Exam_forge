import { runStagesReconstruction } from './reconstructionPipeline.js';

const text = `Two identical conducting spheres  and  with charge  on each, repel each other with a force 16 N . A third identical uncharged conducting sphere  is successively brought in contact with the two spheres. The new force of repulsion between P and S is :

[April 6, 2024 (II)]

	(A) 4 N	(B) 6 N(C) 1 N	(D) 12 N`;

(async () => {
  try {
    const res = await runStagesReconstruction(text, null, null, [
      { type: 'text', content: text }
    ]);
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error(err);
  }
})();
