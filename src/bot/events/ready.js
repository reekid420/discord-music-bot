export const name = 'clientReady';
export const once = true;

export function execute(client) {
  console.log(`[Ready] Logged in as ${client.user.tag}`);
  console.log(`[Ready] Serving ${client.guilds.cache.size} guild(s)`);
  client.user.setActivity('music | /play', { type: 2 }); // Type 2 = Listening
}
