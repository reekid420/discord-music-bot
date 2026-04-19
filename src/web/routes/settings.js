import { Router } from 'express';
import { getGuildSettings, updateGuildSettings } from '../../db/database.js';

/**
 * Guild settings routes.
 * @param {import('discord.js').Client} client
 */
export function settingsRoutes(client) {
  const router = Router();

  // GET /api/settings?guild=<id>
  router.get('/', (req, res) => {
    const guildId = req.query.guild;
    if (!guildId) return res.status(400).json({ error: 'guild query param required' });

    const settings = getGuildSettings(guildId);

    // Also get guild roles for the DJ role picker
    const guild = client.guilds.cache.get(guildId);
    const roles = guild
      ? guild.roles.cache
          .filter(r => r.name !== '@everyone')
          .map(r => ({ id: r.id, name: r.name, color: r.hexColor }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

    res.json({ settings, roles });
  });

  // POST /api/settings — update { guild, dj_role_id?, vote_threshold?, auto_leave_s?, default_volume? }
  router.post('/', (req, res) => {
    const { guild: guildId, ...updates } = req.body;
    if (!guildId) return res.status(400).json({ error: 'guild required' });

    const updated = updateGuildSettings(guildId, updates);
    res.json(updated);
  });

  return router;
}
