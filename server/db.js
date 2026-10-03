import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in environment variables');

  const maskedUri = uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
  console.log('Connecting to MongoDB:', maskedUri);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    });
    isConnected = true;
    console.log('MongoDB connected successfully.');
  } catch (err) {
    console.error('MongoDB connection failed!');
    console.error('  Error name :', err.name);
    console.error('  Message    :', err.message);
    throw err;
  }
}
