import mongoose from "mongoose";

let connectionPromise = null;

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("MONGODB_URI is not set. MongoDB APIs are disabled until it is configured.");
    return null;
  }

  if (!connectionPromise) {
    mongoose.set("strictQuery", true);
    connectionPromise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
  }

  await connectionPromise;
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
  return mongoose.connection;
}

export function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}
