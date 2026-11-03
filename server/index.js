import { createApp } from "./app.js";
import { connectDb } from "./db.js";

const port = Number(process.env.PORT ?? 3000);

const missing = ["MONGODB_URI", "JWT_SECRET"].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Startup failed: missing environment variable(s): ${missing.join(", ")} (set them in Render → Environment)`);
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error("Startup failed: JWT_SECRET must be at least 32 characters");
  process.exit(1);
}

try {
  await connectDb();
  // Bind on all interfaces so Render's proxy can reach the service on $PORT.
  createApp().listen(port, "0.0.0.0", () => console.log(`רשף ביטחון server listening on :${port}`));
} catch (err) {
  console.error("Startup failed:", err.message);
  process.exit(1);
}
