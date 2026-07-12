import mongoose from 'mongoose';
import logger from '../utils/logger';
import User from '../models/User';

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

    // Seed default single admin if none exists
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount === 0) {
      await User.create({
        name: 'System Admin',
        email: 'admin@gmail.com',
        password: 'admin123', // Automatically hashed by User model pre-save middleware
        role: 'admin',
      });
      logger.info('Default Admin user successfully seeded: admin@gmail.com / admin123');
    }
  } catch (error: any) {
    logger.error(`Database Connection Error: ${error.message}`);
    // Exit process with failure (1) to prevent server running without a DB
    process.exit(1);
  }
};

export default connectDB;
