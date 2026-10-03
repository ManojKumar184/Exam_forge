import express from 'express';
import { Upload } from '../models/Upload.js';
import { Question } from '../models/Question.js';
import { authenticate } from './authenticate.js';
import { resolveTenantContext, requireInstitutionContext } from './tenantContext.js';
import { AppError } from '../utils/AppError.js';

export function createPrivateUploadRouter(uploadDir) {
  const router = express.Router();
  router.use(authenticate, resolveTenantContext, requireInstitutionContext, async (req, _res, next) => {
    try {
      const relativeUrl = `/uploads${req.path}`;
      const institutionId = req.institutionId;
      const upload = await Upload.findOne({ institutionId, filePath: relativeUrl }).select('_id uploadedBy').lean();
      if (upload) {
        const permitted = req.user.role === 'super_admin'
          || req.membership?.role === 'INSTITUTION_ADMIN'
          || upload.uploadedBy?.toString() === req.user._id.toString();
        if (permitted) return next();
      }
      const refQuery = { $or: [
        { questionImages: relativeUrl },
        { 'imageMetadata.url': relativeUrl },
        { 'contentBlocks.assetUrl': relativeUrl },
        { 'contentBlocks.originalAssetUrl': relativeUrl },
        { 'contentBlocks.previewAssetUrls': relativeUrl },
        { 'diagrams.url': relativeUrl },
      ] };
      const question = await Question.findOne({
        $and: [
          { $or: [{ institutionId }, { institutionId: null, visibility: 'public' }] },
          refQuery,
          { $or: [{ ownerId: req.user._id }, { visibility: 'public', status: 'approved' }, { institutionId, isPrivate: false, status: 'approved' }] },
        ],
      }).select('_id').lean();
      if (!question) return next(new AppError('File not found', 404, 'NOT_FOUND'));
      next();
    } catch (error) { next(error); }
  }, express.static(uploadDir, { fallthrough: false, dotfiles: 'deny', index: false }));
  return router;
}
