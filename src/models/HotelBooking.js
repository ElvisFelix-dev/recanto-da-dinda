import mongoose from 'mongoose'

const { Schema } = mongoose

const uploadedFileSchema = new Schema({
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  resourceType: { type: String, enum: ['image', 'raw'], default: 'image' },
  originalName: { type: String, trim: true },
  mimeType: String,
  size: Number,
}, { _id: false })

const hotelBookingSchema = new Schema({
  guardian: { type: Schema.Types.ObjectId, ref: 'Guardian', required: true, index: true },
  pet: { type: Schema.Types.ObjectId, ref: 'Pet', default: null, index: true },
  petSnapshot: {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    breed: { type: String, required: true, trim: true, maxlength: 100 },
    sex: { type: String, enum: ['female', 'male'], required: true },
    neutered: { type: Boolean, required: true },
  },
  requestedCheckIn: { type: Date, required: true, index: true },
  requestedCheckOut: { type: Date, required: true },
  healthInformation: {
    vaccinesUpToDate: { type: Boolean, required: true },
    vaccinationCards: { type: [uploadedFileSchema], default: [] },
    lastDewormingDate: { type: Date, required: true },
    fleaTreatment: { type: String, required: true, trim: true, maxlength: 250 },
    hasAllergies: { type: Boolean, required: true },
    allergyDetails: { type: String, trim: true, maxlength: 1000, default: '' },
    takesMedication: { type: Boolean, required: true },
    medicationDetails: { type: String, trim: true, maxlength: 1000, default: '' },
    veterinarian: {
      clinic: { type: String, trim: true, maxlength: 150, default: '' },
      name: { type: String, trim: true, maxlength: 120, default: '' },
      phone: { type: String, trim: true, default: '' },
    },
  },
  declarations: {
    emergencyAuthorization: { type: Boolean, required: true },
    truthfulInformation: { type: Boolean, required: true },
    adequateHealth: { type: Boolean, required: true },
    disclosedConditions: { type: Boolean, required: true },
    socializationRisks: { type: Boolean, required: true },
    emergencyMeasures: { type: Boolean, required: true },
    veterinaryExpenses: { type: Boolean, required: true },
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled', 'completed'],
    default: 'pending',
    index: true,
  },
  adminNotes: { type: String, trim: true, maxlength: 2000, default: '' },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true })

hotelBookingSchema.index({ status: 1, requestedCheckIn: 1 })
hotelBookingSchema.index({ guardian: 1, createdAt: -1 })

export default mongoose.model('HotelBooking', hotelBookingSchema)
