import { Router } from 'express';
import authRoutes from './authRoutes.js';
import catalogRoutes from './catalogRoutes.js';
import questionRoutes from './questionRoutes.js';
import uploadRoutes from './uploadRoutes.js';
import paperRoutes from './paperRoutes.js';
import testRoutes from './testRoutes.js';
import analyticsRoutes from './analyticsRoutes.js';
import leaderboardRoutes from './leaderboardRoutes.js';
import userRoutes from './userRoutes.js';
import { health } from '../controllers/healthController.js';

const router = Router();

router.get('/health', health);
router.use('/auth', authRoutes);
router.use('/questions', questionRoutes);
router.use('/uploads', uploadRoutes);
router.use('/papers', paperRoutes);
router.use('/tests', testRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.use('/users', userRoutes);
router.use('/', catalogRoutes);

export default router;
