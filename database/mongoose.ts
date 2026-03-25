import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    throw new Error("❌ Please define MONGODB_URI in .env");
}

// ✅ Extend global safely
declare global {
    // eslint-disable-next-line no-var
    var mongooseCache: {
        conn: typeof mongoose | null;
        promise: Promise<typeof mongoose> | null;
    };
}

// ✅ Initialize cache
let cached = global.mongooseCache;

if (!cached) {
    cached = global.mongooseCache = { conn: null, promise: null };
}

export const connectToDatabase = async () => {
    // ✅ Return cached connection
    if (cached.conn) {
        return cached.conn;
    }

    // ✅ Create connection promise if not exists
    if (!cached.promise) {
        console.log("⏳ Connecting to MongoDB...");

        cached.promise = mongoose.connect(MONGODB_URI, {
            bufferCommands: false,

            // 🔥 IMPORTANT OPTIONS
            serverSelectionTimeoutMS: 5000, // fail fast
            socketTimeoutMS: 45000,
        });
    }

    try {
        cached.conn = await cached.promise;
        console.log("✅ MongoDB Connected");
    } catch (error) {
        cached.promise = null;

        console.error("❌ MongoDB connection failed:");
        console.error(error);

        throw new Error(
            error instanceof Error
                ? error.message
                : "Unknown MongoDB error"
        );
    }

    return cached.conn;
};