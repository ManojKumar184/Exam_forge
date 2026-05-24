import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { env } from './env.js';
import { AppError } from '../utils/AppError.js';

const ALLOWED_MIME = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/gif': 'image',
  'image/bmp': 'image',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(env.uploadDir, 'documents'));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${uuidv4()}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  if (ALLOWED_MIME[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type'));
  }
}

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.maxUploadMb * 1024 * 1024 },
});

export function getFileType(mimetype, originalname) {
  if (ALLOWED_MIME[mimetype]) return ALLOWED_MIME[mimetype];
  const ext = path.extname(originalname).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'docx';
  if (['.png', '.jpg', '.jpeg', '.gif', '.bmp'].includes(ext)) return 'image';
  return null;
}
