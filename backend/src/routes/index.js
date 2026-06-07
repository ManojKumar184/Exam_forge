import { Router } from 'express';
import authRoutes from './authRoutes.js';
import catalogRoutes from './catalogRoutes.js';
import questionRoutes from './questionRoutes.js';
import syllabusRoutes from './syllabusRoutes.js';
import questionBankRoutes from './questionBankRoutes.js';
import uploadRoutes from './uploadRoutes.js';
import paperRoutes from './paperRoutes.js';
import testRoutes from './testRoutes.js';
import analyticsRoutes from './analyticsRoutes.js';
import leaderboardRoutes from './leaderboardRoutes.js';
import userRoutes from './userRoutes.js';
import examTemplateRoutes from './examTemplateRoutes.js';
import exportPresetRoutes from './exportPresetRoutes.js';
import institutionProfileRoutes from './institutionProfileRoutes.js';
import { health } from '../controllers/healthController.js';

const router = Router();

router.get('/health', health);
router.use('/auth', authRoutes);
router.use('/questions', questionRoutes);
router.use('/syllabus', syllabusRoutes);
router.use('/question-banks', questionBankRoutes);
router.use('/uploads', uploadRoutes);
router.use('/papers', paperRoutes);
router.use('/tests', testRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.use('/users', userRoutes);
router.use('/exam-templates', examTemplateRoutes);
router.use('/export-presets', exportPresetRoutes);
router.use('/institution-profiles', institutionProfileRoutes);
router.use('/', catalogRoutes);

export default router;
