import mongoose, { Schema, Document } from 'mongoose';

export interface IHotelbedsDestination extends Document {
  code: string;
  city: string; // The official city name
  country: string;
}

const HotelbedsDestinationSchema = new Schema<IHotelbedsDestination>(
  {
    code: { type: String, required: true, unique: true, index: true },
    city: { type: String, required: true, index: true },
    country: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IHotelbedsDestination>('HotelbedsDestination', HotelbedsDestinationSchema);
