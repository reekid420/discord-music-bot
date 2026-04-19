import { Router } from 'express';
import multer from 'multer';
import { join, resolve, extname } from 'path';
import { mkdirSync, unlinkSync } from 'fs';
import crypto from 'crypto';
import { addLocalFile, getAllLocalFiles, getLocalFileById, deleteLocalFile } from '../../db/database.js';

const ALLOWED_EXTENSIONS = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.opus', '.webm'];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * Upload routes for local audio files.
 * @param {import('discord.js').Client} client
 */
export function uploadRoutes(client) {
  const router = Router();

  const uploadsDir = resolve(process.env.UPLOADS_DIR || './uploads');
  mkdirSync(uploadsDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const unique = crypto.randomBytes(8).toString('hex');
      const ext = extname(file.originalname).toLowerCase();
      cb(null, `${unique}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      if (ALLOWED_EXTENSIONS.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`));
      }
    },
  });

  // POST /api/upload — upload an audio file
  router.post('/', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const record = addLocalFile({
        filename: req.file.originalname,
        filepath: req.file.path,
        title: req.file.originalname.replace(extname(req.file.originalname), ''),
        duration_ms: null, // Could parse with mediaplex if needed
      });

      res.json(record);
    } catch (err) {
      console.error('[Upload]', err);
      res.status(500).json({ error: 'Failed to save file record' });
    }
  });

  // GET /api/upload — list uploaded files
  router.get('/', (req, res) => {
    const files = getAllLocalFiles();
    res.json(files);
  });

  // DELETE /api/upload/:id — delete an uploaded file
  router.delete('/:id', (req, res) => {
    const file = getLocalFileById(parseInt(req.params.id));
    if (!file) return res.status(404).json({ error: 'File not found' });

    // Remove from filesystem
    try {
      unlinkSync(file.filepath);
    } catch (e) {
      // File may already be gone, that's OK
    }

    deleteLocalFile(file.id);
    res.json({ success: true });
  });

  // POST /api/upload/:id/play — play an uploaded file { guild }
  router.post('/:id/play', async (req, res) => {
    const { guild: guildId } = req.body;
    if (!guildId) return res.status(400).json({ error: 'guild required' });

    const file = getLocalFileById(parseInt(req.params.id));
    if (!file) return res.status(404).json({ error: 'File not found' });

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });

    const botMember = guild.members.cache.get(client.user.id);
    const vc = botMember?.voice?.channel
      || guild.channels.cache.find(c => c.isVoiceBased() && c.members.filter(m => !m.user.bot).size > 0);

    if (!vc) return res.status(400).json({ error: 'No voice channel to join' });

    try {
      const { QueryType } = await import('discord-player');
      await client.player.play(vc, file.filepath, {
        searchEngine: QueryType.FILE,
        nodeOptions: { metadata: { guild }, volume: 80 },
      });
      res.json({ success: true, title: file.title });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Error handler for multer
  router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum size is 100MB.' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });

  return router;
}
