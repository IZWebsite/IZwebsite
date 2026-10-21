const { json, env, staffFromEvent } = require("./_shared/lib");

exports.handler = async (event) => {
  if (!env("SUPABASE_SERVICE_ROLE_KEY")) return json(503, { error: "SUPABASE_SERVICE_ROLE_KEY is not set on Netlify." });
  const staff = await staffFromEvent(event);
  if (!staff) return json(403, { error: "Staff only" });
  return json(200, {
    supabase_service: true,
    razorpay: !!(env("RAZORPAY_KEY_ID") && env("RAZORPAY_KEY_SECRET")),
    razorpay_mode: env("RAZORPAY_KEY_ID").startsWith("rzp_live") ? "(live)" : env("RAZORPAY_KEY_ID") ? "(test mode)" : "",
    razorpay_webhook: !!env("RAZORPAY_WEBHOOK_SECRET"),
    email: !!(env("RESEND_API_KEY") && env("EMAIL_FROM")),
    whatsapp: !!(env("WHATSAPP_TOKEN") && env("WHATSAPP_PHONE_NUMBER_ID")),
  });
};
