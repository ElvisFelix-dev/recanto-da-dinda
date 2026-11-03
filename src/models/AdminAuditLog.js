import mongoose from 'mongoose'

const adminAuditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
      index: true,
    },
    actorName: { type: String, trim: true, default: 'Sistema' },
    actorEmail: { type: String, trim: true, lowercase: true, default: '' },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entity: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true },
)

adminAuditLogSchema.index({ createdAt: -1 })
adminAuditLogSchema.index({ entity: 1, createdAt: -1 })

export default mongoose.model('AdminAuditLog', adminAuditLogSchema)
