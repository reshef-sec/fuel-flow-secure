import { createApp } from "./app.js";
import { connectDb } from "./db.js";

const port = Number(process.env.PORT ?? 3000);

try {
  await connectDb();
  createApp().listen(port, () => console.log(`רשף ביטחון server listening on :${port}`));
} catch (err) {
  console.error("Startup failed:", err.message);
  process.exit(1);
}
