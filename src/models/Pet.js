import mongoose from 'mongoose'

const { Schema } = mongoose

const vaccinationCardSchema = new Schema(
  {
    url: {
      type: String,
      required: true,
    },

    publicId: {
      type: String,
      required: true,
    },

    resourceType: {
      type: String,
      enum: ['image', 'raw', 'video'],
      default: 'image',
    },

    originalName: {
      type: String,
      trim: true,
    },

    mimeType: String,

    size: Number,
  },
  { _id: false },
)

const statusHistorySchema = new Schema(
  {
    status: {
      type: String,
      enum: ['pending_review', 'approved', 'rejected'],
      required: true,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    changedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },

    changedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
)

const petSchema = new Schema(
  {
    guardian: {
      type: Schema.Types.ObjectId,
      ref: 'Guardian',
      required: true,
      index: true,
    },

    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },

    // Dados do pet
    name: {
      type: String,
      required: [true, 'Nome do pet é obrigatório'],
      trim: true,
      maxlength: 80,
    },

    breed: {
      type: String,
      required: [true, 'Raça é obrigatória'],
      trim: true,
      maxlength: 100,
    },

    sex: {
      type: String,
      enum: ['female', 'male'],
      required: true,
    },

    neutered: {
      type: Boolean,
      required: true,
    },

    // Saúde e vacinação
    vaccines: {
      polyvalent: {
        type: Boolean,
        required: true,
        validate: {
          validator: (value) => value === true,
          message: 'A vacina Polivalente é obrigatória',
        },
      },
      rabies: {
        type: Boolean,
        required: true,
        validate: {
          validator: (value) => value === true,
          message: 'A vacina Antirrábica é obrigatória',
        },
      },
      giardia: {
        type: Boolean,
        required: true,
        validate: {
          validator: (value) => value === true,
          message: 'A vacina Giardia é obrigatória',
        },
      },
      canineFlu: {
        type: Boolean,
        required: true,
        validate: {
          validator: (value) => value === true,
          message: 'A vacina Gripe Canina é obrigatória',
        },
      },
    },

    vaccinationCards: {
      type: [vaccinationCardSchema],
      default: [],
      validate: {
        validator: (cards) => cards.length <= 5,
        message: 'É permitido enviar no máximo 5 documentos.',
      },
    },

    lastDewormingDate: {
      type: Date,
      required: true,
    },

    fleaTreatmentProduct: {
      type: String,
      required: [true, 'Produto antipulgas é obrigatório'],
      trim: true,
      maxlength: 120,
    },

    lastFleaTreatmentDate: {
      type: Date,
      required: true,
    },

    hasAllergies: {
      type: Boolean,
      required: true,
    },

    allergyDetails: {
      type: String,
      trim: true,
      maxlength: 1000,
      required: function () {
        return this.hasAllergies === true
      },
    },

    takesMedication: {
      type: Boolean,
      required: true,
    },

    medicationDetails: {
      type: String,
      trim: true,
      maxlength: 1000,
      required: function () {
        return this.takesMedication === true
      },
    },

    // Informações veterinárias
    veterinarian: {
      clinic: {
        type: String,
        required: true,
        trim: true,
        maxlength: 150,
      },
      name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
      },
      phone: {
        type: String,
        required: true,
        trim: true,
      },
    },

    emergencyAuthorization: {
      type: Boolean,
      required: true,
      validate: {
        validator: (value) => value === true,
        message: 'A autorização emergencial é obrigatória',
      },
    },

    // Declarações do responsável

    declarations: {
      truthfulInformation: {
        type: Boolean,
        required: true,
        validate: {
          validator: (value) => value === true,
          message: 'Esta declaração é obrigatória.',
        },
      },
      adequateHealth: {
        type: Boolean,
        required: true,
        validate: (value) => value === true,
      },
      requiredVaccines: {
        type: Boolean,
        required: true,
        validate: (value) => value === true,
      },
      socializationRisks: {
        type: Boolean,
        required: true,
        validate: (value) => value === true,
      },
      emergencyMeasures: {
        type: Boolean,
        required: true,
        validate: (value) => value === true,
      },
      veterinaryExpenses: {
        type: Boolean,
        required: true,
        validate: (value) => value === true,
      },
    },

    avatar: {
      url: { type: String, trim: true, default: '' },
      publicId: { type: String, trim: true, default: '' },
    },

    // Controle administrativo
    status: {
      type: String,
      enum: ['pending_review', 'approved', 'rejected'],
      default: 'pending_review',
      index: true,
    },

    adminNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
)

petSchema.index({ guardian: 1, createdAt: -1 })
petSchema.index({ status: 1, createdAt: -1 })

const Pet = mongoose.model('Pet', petSchema)

export default Pet
