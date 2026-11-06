const router = require('express').Router();
const { Room, Student, Allocation } = require('./models');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const isInt = (n, max) => Number.isInteger(n) && n >= 1 && n <= max;

// ---- Rooms ----
router.get('/rooms', wrap(async (req, res) => res.json(await Room.find().sort('name'))));

router.post('/rooms', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const rows = Number(req.body.rows), seatsPerRow = Number(req.body.seatsPerRow);
  if (!name) throw bad('Room name is required');
  if (!isInt(rows, 100) || !isInt(seatsPerRow, 100)) throw bad('Rows and seats per row must be whole numbers between 1 and 100');
  res.status(201).json(await Room.create({ name, rows, seatsPerRow }));
}));

router.delete('/rooms/:id', wrap(async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw bad('Invalid room id');
  if (await Allocation.exists({ roomId: req.params.id })) throw bad('Room has allocated seats. Reset allocations first.', 409);
  const r = await Room.findByIdAndDelete(req.params.id);
  if (!r) throw bad('Room not found', 404);
  res.json({ ok: true });
}));

// ---- Students ----
router.get('/students', wrap(async (req, res) => res.json(await Student.find().sort('rollNo'))));

router.post('/students/import', wrap(async (req, res) => {
  const list = req.body.students;
  if (!Array.isArray(list) || !list.length) throw bad('Send a non-empty "students" array');
  const existing = new Set((await Student.find({}, 'rollNo')).map((s) => s.rollNo));
  const toAdd = [], skipped = [];
  for (const s of list) {
    const rollNo = String(s?.rollNo || '').trim(), name = String(s?.name || '').trim();
    if (!rollNo || !name) skipped.push({ rollNo: rollNo || '(blank)', reason: 'Missing roll no or name' });
    else if (existing.has(rollNo)) skipped.push({ rollNo, reason: 'Duplicate roll number' });
    else { existing.add(rollNo); toAdd.push({ rollNo, name }); }
  }
  if (toAdd.length) await Student.insertMany(toAdd);
  res.status(201).json({ added: toAdd.length, skipped });
}));

router.delete('/students', wrap(async (req, res) => {
  await Promise.all([Student.deleteMany({}), Allocation.deleteMany({})]);
  res.json({ ok: true });
}));

// ---- Capacity (shown BEFORE allocating) ----
router.get('/capacity', wrap(async (req, res) => {
  const [rooms, allocs, totalStudents] = await Promise.all([Room.find().sort('name'), Allocation.find(), Student.countDocuments()]);
  const used = {};
  allocs.forEach((a) => { used[a.roomId] = (used[a.roomId] || 0) + 1; });
  const perRoom = rooms.map((r) => {
    const capacity = r.rows * r.seatsPerRow, allocated = used[r._id] || 0;
    return { _id: r._id, name: r.name, capacity, allocated, free: capacity - allocated };
  });
  const totalCapacity = perRoom.reduce((s, r) => s + r.capacity, 0);
  const totalFree = perRoom.reduce((s, r) => s + r.free, 0);
  const unallocated = totalStudents - allocs.length;
  res.json({ perRoom, totalCapacity, totalFree, totalStudents, unallocated, canAllocate: unallocated > 0 && unallocated <= totalFree, shortfall: Math.max(0, unallocated - totalFree) });
}));

// ---- Allocation ----
router.get('/allocations', wrap(async (req, res) => res.json(await Allocation.find().sort({ roomName: 1, row: 1, seat: 1 }))));

router.post('/allocate', wrap(async (req, res) => {
  const [rooms, allocs, students] = await Promise.all([Room.find().sort('name'), Allocation.find(), Student.find().sort('rollNo')]);
  const done = new Set(allocs.map((a) => a.rollNo));
  const taken = new Set(allocs.map((a) => `${a.roomId}-${a.row}-${a.seat}`));
  const pending = students.filter((s) => !done.has(s.rollNo));
  if (!pending.length) throw bad('No unallocated students. Import students first.');
  const free = [];
  for (const r of rooms) for (let row = 1; row <= r.rows; row++) for (let seat = 1; seat <= r.seatsPerRow; seat++)
    if (!taken.has(`${r._id}-${row}-${seat}`)) free.push({ roomId: r._id, roomName: r.name, row, seat });
  if (pending.length > free.length) throw bad(`Not enough seats: ${pending.length} students but only ${free.length} free seats. Add ${pending.length - free.length} more seats.`);
  const docs = pending.map((s, i) => ({ rollNo: s.rollNo, name: s.name, ...free[i] }));
  await Allocation.insertMany(docs); // unique indexes guarantee no duplicates even under concurrent requests
  res.status(201).json({ allocated: docs.length });
}));

router.delete('/allocations', wrap(async (req, res) => { await Allocation.deleteMany({}); res.json({ ok: true }); }));

module.exports = router;
