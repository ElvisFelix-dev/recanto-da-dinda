import mongoose from 'mongoose'

const guardianSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Nome do tutor é obrigatório'],
      trim: true,
      minlength: 3,
      maxlength: 120,
    },

    cpf: {
      type: String,
      required: [true, 'CPF é obrigatório'],
      unique: true,
      trim: true,
    },

    rg: {
      type: String,
      required: [true, 'RG é obrigatório'],
      trim: true,
    },

    address: {
      type: String,
      required: [true, 'Endereço é obrigatório'],
      trim: true,
      maxlength: 250,
    },

    phone: {
      type: String,
      required: [true, 'Telefone é obrigatório'],
      trim: true,
    },

    email: {
      type: String,
      required: [true, 'E-mail é obrigatório'],
      trim: true,
      lowercase: true,
    },

    whatsappConsent: {
      status: { type: String, enum: ['unknown', 'granted', 'denied'], default: 'unknown' },
      grantedAt: { type: Date, default: null },
      source: { type: String, default: '' },
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
)

// Permite consultar os pets de um tutor através de populate("pets").
guardianSchema.virtual('pets', {
  ref: 'Pet',
  localField: '_id',
  foreignField: 'guardian',
})

guardianSchema.set('toJSON', { virtuals: true })
guardianSchema.set('toObject', { virtuals: true })

const Guardian = mongoose.model('Guardian', guardianSchema)

export default Guardian
