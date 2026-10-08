import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../utils/appError.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export interface UploadedImage {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(ext)) {
      cb(new AppError(422, 'MEDIA_INVALID_TYPE', 'Formato no permitido. Usa JPG, PNG o WebP'));
      return;
    }
    cb(null, true);
  },
});

export function uploadSingleImage(req: Request, res: Response, next: NextFunction): void {
  parser.single('file')(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof AppError) {
      next(error);
      return;
    }
    const multerError = error as { code?: string };
    if (multerError.code === 'LIMIT_FILE_SIZE') {
      next(new AppError(422, 'MEDIA_FILE_TOO_LARGE', 'La imagen supera el límite de 8 MB'));
      return;
    }
    if (multerError.code === 'LIMIT_UNEXPECTED_FILE') {
      next(
        new AppError(400, 'MEDIA_FILE_REQUIRED', 'Campo de archivo inválido; usa el campo "file"'),
      );
      return;
    }
    next(error);
  });
}
