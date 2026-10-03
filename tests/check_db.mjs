import mongoose from 'mongoose';
import { env } from '../backend/src/config/env.js';
import { SyllabusNode } from '../backend/src/models/SyllabusNode.js';

async function main() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(env.mongodbUri);
  console.log("Connected successfully.");

  const nodes = await SyllabusNode.find({ isActive: true }).lean();
  console.log(`Total active SyllabusNodes: ${nodes.length}`);

  // Organize by type
  const classes = nodes.filter(n => n.type === 'class');
  const subjects = nodes.filter(n => n.type === 'subject');
  const chapters = nodes.filter(n => n.type === 'chapter');

  console.log("\n--- CLASSES ---");
  classes.forEach(c => console.log(`  - Class: ID=${c._id} Name="${c.name}"`));

  console.log("\n--- SUBJECTS ---");
  subjects.forEach(s => {
    const parent = classes.find(c => c._id.toString() === s.parentId?.toString());
    console.log(`  - Subject: ID=${s._id} Name="${s.name}" ParentClass="${parent ? parent.name : 'none'}"`);
  });

  console.log("\n--- CHAPTERS (First 15) ---");
  chapters.slice(0, 15).forEach(ch => {
    const parent = subjects.find(s => s._id.toString() === ch.parentId?.toString());
    const grandParent = parent ? classes.find(c => c._id.toString() === parent.parentId?.toString()) : null;
    console.log(`  - Chapter: ID=${ch._id} Name="${ch.name}" ParentSubject="${parent ? parent.name : 'none'}" GrandParentClass="${grandParent ? grandParent.name : 'none'}"`);
  });

  // Check specifically for "Electric Charges and Fields" or "Electrostatics" chapters
  console.log("\n--- SEARCHING CHAPTERS FOR 'Electric' or 'Electrostatics' ---");
  chapters.forEach(ch => {
    if (ch.name.toLowerCase().includes('electric') || ch.name.toLowerCase().includes('electrostatics')) {
      const parent = subjects.find(s => s._id.toString() === ch.parentId?.toString());
      const grandParent = parent ? classes.find(c => c._id.toString() === parent.parentId?.toString()) : null;
      console.log(`  - Found: ID=${ch._id} Name="${ch.name}" Subject="${parent ? parent.name : 'none'}" Class="${grandParent ? grandParent.name : 'none'}"`);
      
      // Let's also print its child topics
      const childTopics = nodes.filter(n => n.parentId?.toString() === ch._id.toString() && n.type === 'topic');
      if (childTopics.length) {
        console.log(`    Topics:`);
        childTopics.forEach(t => console.log(`      - ID=${t._id} Name="${t.name}"`));
      }
    }
  });

  await mongoose.disconnect();
  console.log("\nDisconnected.");
}

main().catch(console.error);
