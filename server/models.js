const { Schema, model } = require('mongoose');

const Room = model('Room', new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  rows: { type: Number, required: true, min: 1, max: 100 },
  seatsPerRow: { type: Number, required: true, min: 1, max: 100 },
}));

const Student = model('Student', new Schema({
  rollNo: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
}));

const allocSchema = new Schema({
  rollNo: { type: String, required: true, unique: true },   // one seat per student
  name: String,
  roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  roomName: String,
  row: { type: Number, required: true },
  seat: { type: Number, required: true },
});
allocSchema.index({ roomId: 1, row: 1, seat: 1 }, { unique: true }); // one student per seat
const Allocation = model('Allocation', allocSchema);

module.exports = { Room, Student, Allocation };
