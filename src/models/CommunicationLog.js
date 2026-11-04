import mongoose from 'mongoose'

const communicationLogSchema = new mongoose.Schema(
  {
    pet: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', required: true, index: true },
    guardian: { type: mongoose.Schema.Types.ObjectId, ref: 'Guardian', default: null },
    channel: { type: String, enum: ['email', 'whatsapp'], required: true, index: true },
    event: { type: String, enum: ['registration_received', 'new_registration_admin', 'pet_approved', 'pet_rejected', 'manual_whatsapp'], required: true },
    recipient: { type: String, required: true },
    status: { type: String, enum: ['sent', 'failed', 'skipped'], required: true, index: true },
    provider: { type: String, enum: ['brevo', 'meta_whatsapp'], required: true },
    providerMessageId: { type: String, default: '' },
    error: { type: String, default: '' },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    dedupeKey: { type: String, unique: true, sparse: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
)

communicationLogSchema.index({ pet: 1, createdAt: -1 })

export default mongoose.model('CommunicationLog', communicationLogSchema)
