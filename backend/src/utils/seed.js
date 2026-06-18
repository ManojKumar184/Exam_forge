import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { env, validateEnv, logEnvSummary } from '../config/env.js';
import { User } from '../models/User.js';
import { seedSyllabus } from '../seedSyllabus.js';
import bcrypt from 'bcryptjs';

async function seed() {
  validateEnv();
  logEnvSummary();
  await connectDatabase();

  if (env.seedAdminEmail && env.seedAdminPassword) {
    const exists = await User.findOne({ email: env.seedAdminEmail.toLowerCase() });
    if (!exists) {
      await User.create({
        email: env.seedAdminEmail.toLowerCase(),
        passwordHash: await bcrypt.hash(env.seedAdminPassword, 12),
        fullName: 'System Administrator',
        role: 'super_admin',
      });
      console.log('[seed] Created super_admin:', env.seedAdminEmail);
    }
  }

  // Flat Subject and ExamType seeding removed — collections were dropped.
  // All curriculum data lives in the SyllabusNode tree (seeded below).

  // Seed Syllabus Nodes
  console.log('[seed] Seeding syllabus nodes...');
  await seedSyllabus();

  await disconnectDatabase();
  console.log('[seed] Done');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
