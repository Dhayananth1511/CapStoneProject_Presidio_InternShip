import mongoose, { Document, Schema } from 'mongoose';

import { ITrip, IMessage } from '../types';
import { TripStatus } from '../constants/enums';


const TripSchema = new Schema<ITrip>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['DRAFT', 'PLANNED', 'CONFIRMED', 'CANCELLED'],
      default: 'DRAFT',
      index: true
    },
    input: {
      destination: { type: String, trim: true },
      origin: { type: String, trim: true },
      start_date: { type: String },
      end_date: { type: String },
      travelers: { type: Number },
      budget_inr: { type: Number },
      interests: [{ type: String }],
      duration_days: { type: Number }
    },
    // We use Schema.Types.Mixed (flexible JSON) because sub-agent structural formats
    // can evolve, allowing loose, scalable payloads.
    weather: { type: Schema.Types.Mixed, default: {} },
    transport: { type: Schema.Types.Mixed, default: {} },
    accommodation: { type: Schema.Types.Mixed, default: {} },
    activities: { type: Schema.Types.Mixed, default: {} },
    local_transport: { type: Schema.Types.Mixed, default: {} },
    budget: { type: Schema.Types.Mixed, default: {} },
    itinerary: { type: Schema.Types.Mixed, default: {} },
    booking: {
      refs: { type: Schema.Types.Mixed, default: {} },
      confirmed_at: { type: Date, default: null }
    },
    formattedPlan: { type: String, default: '' },
    conversationHistory: [
      {
        role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
        content: { type: String, required: true }
      }
    ]
  },
  { timestamps: true }
);

export default mongoose.model<ITrip>('Trip', TripSchema);
