import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

// Define the TypeScript structure (interface) for a User document
export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: 'traveler' | 'admin';
  refreshToken?: string;
  googleId?: string;          // Google account unique ID — set on Google Sign-In
  googleAccessToken?: string;
  googleRefreshToken?: string;
  longTermMemory: string;
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
    // NOT required: Google Sign-In users receive a random hash and never set a real password.
    password: { type: String, required: false, minlength: 8, select: false },
    role: {
      type: String,
      enum: ['traveler', 'admin'],
      default: 'traveler',
    },
    refreshToken: { type: String },
    googleId: { type: String, sparse: true, index: true }, // sparse: only index documents that have this field
    googleAccessToken: { type: String },
    googleRefreshToken: { type: String },
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
UserSchema.pre('save', async function () {
  const user = this as any; // Cast as any or IUser to access properties without TS path errors

  // Only hash the password if it is new or modified
  if (!user.isModified('password')) return;

  // Generate salt rounds (12 is strong and safe)
  const salt = await bcrypt.genSalt(12);
  user.password = await bcrypt.hash(user.password, salt);
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
