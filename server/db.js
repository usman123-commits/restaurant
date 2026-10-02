import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in environment variables');

  // Log masked URI so you can confirm which string is actually being used
  const maskedUri = uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
  console.log('Connecting to MongoDB:', maskedUri);

  try {
    await mongoose.connect(uri);
    isConnected = true;
    console.log('MongoDB connected successfully.');
  } catch (err) {
    console.error('MongoDB connection failed!');
    console.error('  Error code :', err.code);
    console.error('  Error name :', err.name);
    console.error('  Message    :', err.message);
    if (err.code === 8000 || err.message?.includes('bad auth')) {
      console.error('\n  ⚠️  AUTH FAILURE — Check these on MongoDB Atlas:');
      console.error('     1. Database Access → user "bgmazak123" has "readWriteAnyDatabase" role');
      console.error('     2. Network Access → your IP is whitelisted (or use 0.0.0.0/0 for dev)');
      console.error('     3. Password is correct and has no special characters that need URL-encoding');
    }
    throw err;
  }
}
