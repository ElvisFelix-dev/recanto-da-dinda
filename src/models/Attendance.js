import mongoose from 'mongoose'

const { Schema } = mongoose

const attendanceSchema = new Schema({
  pet: { type: Schema.Types.ObjectId, ref: 'Pet', required: true, index: true },
  guardian: { type: Schema.Types.ObjectId, ref: 'Guardian', required: true, index: true },
  checkInAt: { type: Date, required: true, default: Date.now },
  checkOutAt: { type: Date, default: null },
  checkInNotes: { type: String, trim: true, maxlength: 1000, default: '' },
  checkOutNotes: { type: String, trim: true, maxlength: 1000, default: '' },
  checkedInBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  checkedOutBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { timestamps: true })

attendanceSchema.index(
  { pet: 1 },
  { unique: true, partialFilterExpression: { checkOutAt: null } },
)

export default mongoose.model('Attendance', attendanceSchema)
