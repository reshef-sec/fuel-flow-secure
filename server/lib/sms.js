/**
 * SMS delivery (Twilio). Off until TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM are set.
 * Returns whether the message was accepted; it never throws, and the caller decides what to do.
 */
export const transport = {
  async send(to, text) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Body: text }),
    });
    if (!res.ok) throw new Error(`SMS provider ${res.status}`);
  },
};

export const smsConfigured = () =>
  Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);

const international = (phone) => `+972${String(phone).replace(/^0/, "")}`;

export async function sendSms(phone, text) {
  if (!smsConfigured()) return false;
  try {
    await transport.send(international(phone), text);
    return true;
  } catch (e) {
    console.warn("SMS failed:", e.message);
    return false;
  }
}
