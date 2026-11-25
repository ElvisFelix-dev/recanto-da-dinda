import mongoose from 'mongoose'

const { Schema } = mongoose

const testimonialSchema = new Schema(
  {
    guardian: { type: Schema.Types.ObjectId, ref: 'Guardian', required: true, index: true },
    pet: { type: Schema.Types.ObjectId, ref: 'Pet', required: true, index: true },
    text: { type: String, required: true, trim: true, minlength: 10, maxlength: 1200 },
    rating: { type: Number, required: true, min: 1, max: 5, default: 5 },
    status: { type: String, enum: ['pending', 'approved', 'hidden'], default: 'pending', index: true },
    authorization: {
      testimonial: { type: Boolean, required: true, default: false },
      petImage: { type: Boolean, required: true, default: false },
      authorizedAt: { type: Date, default: null },
      source: { type: String, enum: ['admin_recorded', 'written', 'whatsapp', 'guardian_portal', 'other'], default: 'admin_recorded' },
      notes: { type: String, trim: true, maxlength: 500, default: '' },
    },
    adminNote: { type: String, trim: true, maxlength: 500, default: '' },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true },
)

testimonialSchema.index({ status: 1, approvedAt: -1, createdAt: -1 })
testimonialSchema.index({ guardian: 1, createdAt: -1 })

export default mongoose.model('Testimonial', testimonialSchema)
