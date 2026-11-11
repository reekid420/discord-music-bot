import { Router } from 'express';

/**
 * Guild listing routes.
 * @param {import('discord.js').Client} client
 */
export function guildRoutes(client) {
  const router = Router();

  // GET /api/guilds — list guilds the bot is in
  router.get('/', (req, res) => {
    const guilds = client.guilds.cache.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.iconURL({ size: 64 }),
      memberCount: g.memberCount,
    }));
    res.json(guilds);
  });

  return router;
}
