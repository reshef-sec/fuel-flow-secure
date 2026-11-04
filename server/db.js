import mongoose from "mongoose";
import * as models from "./models.js";

mongoose.set("strictQuery", true);

/** Connects to MongoDB Atlas (replica set — required for multi-document transactions). */
export async function connectDb(uri = process.env.MONGODB_URI) {
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    retryWrites: true,
    w: "majority",
  });
  await Promise.all([...Object.values(models.REAL), ...Object.values(models.LEARNING)].map((m) => m.createIndexes()));
  await models.AppSetting.updateOne({ key: "main" }, { $setOnInsert: { key: "main", balance: 0 } }, { upsert: true });
  return mongoose.connection;
}

/**
 * Runs `fn(session)` in a majority-committed transaction, retrying transient
 * write conflicts (this is what makes concurrent card allocation race-free).
 */
export async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
    return result;
  } finally {
    await session.endSession();
  }
}
