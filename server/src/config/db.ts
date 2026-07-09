import mongoose from 'mongoose';
import logger from '../utils/logger';

/**
 * Connects the Express server to MongoDB Atlas database.
 * We run this once when starting the server.
 */
const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error('MONGO_URI is not defined in the environment variables (.env)');
    }

    // Connect to MongoDB using Mongoose connection options
    const conn = await mongoose.connect(mongoUri);
    
    // Log success with host name
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    logger.error(`Database Connection Error: ${error.message}`);
    // Exit process with failure (1) to prevent server running without a DB
    process.exit(1);
  }
};

export default connectDB;
