import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { loadSyllabusCatalog, resolveHintsToSyllabusMappings } from '../backend/src/ai/syllabusCatalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin-examforge:admin123@exam-forge.rv32zqk.mongodb.net/test';

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const syllabusCatalog = await loadSyllabusCatalog();
  console.log('Exam Patterns:', syllabusCatalog.examPatterns.length);
  console.log('Classes:', syllabusCatalog.classes.length);
  console.log('Subjects:', syllabusCatalog.subjects.length);
  console.log('Chapters:', syllabusCatalog.chapters.length);
  console.log('Topics:', syllabusCatalog.topics.length);

  const hints = {
    subject: "Physics",
    topic: "Electrostatic Potential and Capacitance",
    class: 12
  };

  const mappings = resolveHintsToSyllabusMappings(hints, syllabusCatalog);
  console.log('\nResolved Mappings:', mappings);

  await mongoose.disconnect();
  console.log('Disconnected');
}

run().catch(console.error);
