const { admin } = require("./_shared/lib");
const { runQueue } = require("./_shared/notify");

// Scheduled every 5 minutes (see netlify.toml): releases expired stock holds and retries notifications.
exports.handler = async () => {
  const db = admin();
  const { data: released } = await db.rpc("release_expired_reservations");
  const processed = await runQueue(db);
  return { statusCode: 200, body: JSON.stringify({ released, processed }) };
};
