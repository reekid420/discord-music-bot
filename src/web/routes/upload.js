import { Router } from 'express';
import multer from 'multer';
import { resolve, extname, sep } from 'path';
import { mkdirSync, unlinkSync, createReadStream } from 'fs';
import crypto from 'crypto';
import { probeStream } from 'mediaplex';
import {
  addLocalFile,
  getAllLocalFiles,
  getLocalFileById,
  deleteLocalFile,
} from '../../db/database.js';
import { resolveVoiceChannel, queueNodeDefaults } from '../helpers.js';

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

    // Content check: the file must actually be parseable media. Reject and remove otherwise.
       // Validate audio independently of optional title/duration metadata.
   let meta;
   const input = createReadStream(req.file.path);
   let probed;

   try {
     probed = await probeStream(input, 5 * 1024 * 1024);
     const result = probed.result;

     if (!(result?.channels > 0) || !(result?.sampleRate > 0)) {
       throw new Error('No recognizable audio stream');
     }

     const tags = Array.isArray(result.metadata) ? result.metadata : [];
     const titleTag = tags.find(tag =>
       ['title', 'tit2'].includes(String(tag.name).toLowerCase())
     );

     meta = {
       title: typeof titleTag?.value === 'string' ? titleTag.value : '',
       duration:
         Number.isFinite(result.duration) && result.duration > 0
           ? result.duration
           : null,
     };
   } catch (err) {
     console.warn('[Upload] Audio validation failed:', err);

     // Close streams before attempting to remove the rejected upload.
     probed?.stream?.destroy();
     input.destroy();

     try {
       unlinkSync(req.file.path);
     } catch {
       /* already gone, or cleanup failed */
     }

     return res.status(400).json({
       error: 'File is not recognizable audio',
     });
   } finally {
     probed?.stream?.destroy();
     input.destroy();
   }

    try {
      const record = addLocalFile({
        filename: req.file.originalname,
        filepath: req.file.path,
        title: meta.title || req.file.originalname.replace(extname(req.file.originalname), ''),
        duration_ms: meta.duration ? Math.round(meta.duration * 1000) : null,
      });

      res.json(record);
    } catch (err) {
      console.error('[Upload] Failed to save file record:', err);
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

    // Only ever delete files that live inside the uploads directory
    const resolvedPath = resolve(file.filepath);
    if (!resolvedPath.startsWith(`${uploadsDir}${sep}`)) {
      return res.status(400).json({ error: 'Refusing to delete file outside uploads dir' });
    }

    try {
      unlinkSync(resolvedPath);
    } catch {
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

    const vc = await resolveVoiceChannel(client, guild);
    if (!vc) return res.status(400).json({ error: 'No voice channel to join' });

    try {
      const { QueryType } = await import('discord-player');
      await client.player.play(vc, file.filepath, {
        searchEngine: QueryType.FILE,
        nodeOptions: { metadata: { guild }, ...queueNodeDefaults(guildId) },
      });
      res.json({ success: true, title: file.title });
    } catch (err) {
      console.error('[Upload] Play failed:', err);
      res.status(500).json({ error: 'Failed to play file' });
    }
  });

  // Error handler for multer
  router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum size is 100MB.' });
      }
      return res.status(400).json({ error: 'Upload rejected' });
    }
    next(err);
  });

  return router;
}
