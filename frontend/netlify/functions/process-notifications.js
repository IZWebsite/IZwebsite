const { admin, json, limited } = require("./_shared/lib");
const { runQueue } = require("./_shared/notify");

exports.handler = async (event) => {
  if (limited(event, 10)) return json(429, { error: "Too many requests" });
  const db = admin();
  await db.rpc("release_expired_reservations");
  const processed = await runQueue(db);
  return json(200, { processed });
};
