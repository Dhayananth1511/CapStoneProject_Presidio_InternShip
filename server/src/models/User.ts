import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

// Define the TypeScript structure (interface) for a User document
export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: 'traveler' | 'admin';
  refreshToken?: string;
  longTermMemory: string; // Plain English summary of user's core travel preferences
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

// Define the database Schema rules
const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true, // No duplicate emails allowed
      lowercase: true,
      trim: true,
    },
    // select: false means this field will NOT be returned by default queries.
    // This protects us from accidentally leaks of password hashes to the frontend.
    password: { type: String, required: true, minlength: 8, select: false },
    role: {
      type: String,
      enum: ['traveler', 'admin'],
      default: 'traveler',
    },
    refreshToken: { type: String }, // Session validation key
    longTermMemory: {
      type: String,
      default: 'User is a first-time traveler. No preferences recorded yet.',
    },
  },
  { timestamps: true } // Auto-creates 'createdAt' and 'updatedAt' fields
);

/**
 * Pre-Save hook: runs automatically before writing a user to the database.
 * If the password has been modified, we hash it securely using bcrypt.
 */
UserSchema.pre('save', async function (next) {
  const user = this as IUser;

  // Only hash the password if it is new or modified
  if (!user.isModified('password')) return next();

  try {
    // Generate salt rounds (12 is strong and safe)
    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(user.password, salt);
    next();
  } catch (err: any) {
    next(err);
  }
});

/**
 * Helper instance method: compares input password with the stored hash.
 * Called as user.comparePassword(input_pwd).
 */
UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IUser>('User', UserSchema);
