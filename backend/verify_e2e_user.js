import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from './src/models/User.js';

const MONGODB_URI = 'mongodb+srv://admin-examforge:admin123@exam-forge.rv32zqk.mongodb.net/examforge?retryWrites=true&w=majority&appName=exam-forge';

async function check() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');
  const user = await User.findOne({ email: 'student_e2e@examforge.com' }).select('+passwordHash');
  console.log('E2E User found:', JSON.stringify(user, null, 2));
  if (user) {
    const valid = await bcrypt.compare('Student@123', user.passwordHash);
    console.log('Is Student@123 valid for this user?', valid);
  }
  await mongoose.disconnect();
}

check().catch(console.error);
