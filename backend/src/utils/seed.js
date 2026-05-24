import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { env, validateEnv, logEnvSummary } from '../config/env.js';
import { User } from '../models/User.js';
import { Subject } from '../models/Subject.js';
import { ExamType } from '../models/ExamType.js';
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

  const examTypes = [
    { name: 'NEET', code: 'NEET', description: 'National Eligibility cum Entrance Test' },
    { name: 'JEE Main', code: 'JEE_MAIN', description: 'Joint Entrance Examination Main' },
    { name: 'JEE Advanced', code: 'JEE_ADV', description: 'Joint Entrance Examination Advanced' },
    { name: 'CBSE', code: 'CBSE', description: 'Central Board of Secondary Education' },
    { name: 'State Board', code: 'STATE', description: 'State Board Examinations' },
  ];

  for (const et of examTypes) {
    await ExamType.findOneAndUpdate({ code: et.code }, et, { upsert: true, new: true });
  }
  console.log('[seed] Exam types ready');

  const subjects = [
    { name: 'Physics', code: 'PHY', color: '#3B82F6', icon: 'atom' },
    { name: 'Chemistry', code: 'CHE', color: '#10B981', icon: 'flask' },
    { name: 'Mathematics', code: 'MAT', color: '#8B5CF6', icon: 'calculator' },
    { name: 'Biology', code: 'BIO', color: '#22C55E', icon: 'leaf' },
  ];

  for (const s of subjects) {
    await Subject.findOneAndUpdate({ code: s.code }, s, { upsert: true, new: true });
  }
  console.log('[seed] Subjects ready');

  await disconnectDatabase();
  console.log('[seed] Done');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
