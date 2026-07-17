import mongoose, { Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: 'traveler' | 'admin';
  refreshToken?: string;
  googleId?: string;          // Google account unique ID — set on Google Sign-In
  googleAccessToken?: string;
  googleRefreshToken?: string;
  googleCalendarAccessToken?: string;
  googleCalendarRefreshToken?: string;
  longTermMemory: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}
