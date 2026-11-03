import mongoose from 'mongoose'

const adminNotificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    type: { type: String, enum: ['new_pet', 'pet_approved', 'pet_rejected', 'communication', 'system'], default: 'system', index: true },
    entityType: { type: String, enum: ['pet', 'guardian', 'communication', 'system'], default: 'system' },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    link: { type: String, default: '/admin/notificacoes' },
    readAt: { type: Date, default: null, index: true },
    dedupeKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true },
)

adminNotificationSchema.index({ recipient: 1, createdAt: -1 })

export default mongoose.model('AdminNotification', adminNotificationSchema)
