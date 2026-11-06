import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

function parseCsv(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length && /roll/i.test(lines[0])) lines.shift();
  return lines.map((l) => { const [rollNo, ...rest] = l.split(','); return { rollNo: (rollNo || '').trim(), name: rest.join(',').trim() }; });
}

export default function App() {
  const [cap, setCap] = useState(null);
  const [allocs, setAllocs] = useState([]);
  const [msg, setMsg] = useState(null);
  const [room, setRoom] = useState({ name: '', rows: '', seatsPerRow: '' });
  const [csv, setCsv] = useState('');
  const [search, setSearch] = useState('');

  const refresh = useCallback(async () => {
    try { const [c, a] = await Promise.all([api('/capacity'), api('/allocations')]); setCap(c); setAllocs(a); }
    catch (e) { setMsg({ type: 'err', text: e.message }); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const run = async (fn, okText) => {
    try { const r = await fn(); setMsg({ type: 'ok', text: typeof okText === 'function' ? okText(r) : okText }); }
    catch (e) { setMsg({ type: 'err', text: e.message }); }
    refresh();
  };

  const addRoom = (e) => {
    e.preventDefault();
    run(async () => { await api('/rooms', 'POST', { ...room, rows: +room.rows, seatsPerRow: +room.seatsPerRow }); setRoom({ name: '', rows: '', seatsPerRow: '' }); }, 'Room added');
  };
  const importStudents = () => run(async () => {
    const r = await api('/students/import', 'POST', { students: parseCsv(csv) }); setCsv(''); return r;
  }, (r) => `Imported ${r.added} students${r.skipped.length ? `, skipped ${r.skipped.length} (${r.skipped.slice(0, 3).map((s) => `${s.rollNo}: ${s.reason}`).join('; ')}${r.skipped.length > 3 ? '…' : ''})` : ''}`);
  const onFile = (e) => { const f = e.target.files[0]; if (f) f.text().then(setCsv); };

  const byRoom = allocs.filter((a) => !search || (a.rollNo + a.name).toLowerCase().includes(search.toLowerCase()))
    .reduce((m, a) => ((m[a.roomName] = m[a.roomName] || []).push(a), m), {});

  return (
    <main className="wrap">
      <h1>Exam Seat Planner</h1>
      {msg && <div className={`alert ${msg.type}`} role="alert" onClick={() => setMsg(null)}>{msg.text}</div>}

      <section className="card">
        <h2>Capacity check</h2>
        {cap && (<>
          <div className="stats">
            <Stat label="Total seats" v={cap.totalCapacity} />
            <Stat label="Free seats" v={cap.totalFree} />
            <Stat label="Students" v={cap.totalStudents} />
            <Stat label="Unallocated" v={cap.unallocated} warn={cap.shortfall > 0} />
          </div>
          {cap.shortfall > 0 && <p className="err-text">Short by {cap.shortfall} seats. Add a room or increase rows before allocating.</p>}
          <div className="rooms">
            {cap.perRoom.map((r) => (
              <div key={r._id} className="room">
                <b>{r.name}</b> <span>{r.allocated}/{r.capacity} used, {r.free} free</span>
                <div className="bar"><i style={{ width: `${(r.allocated / r.capacity) * 100}%` }} /></div>
                <button className="link" onClick={() => run(() => api(`/rooms/${r._id}`, 'DELETE'), 'Room deleted')}>delete</button>
              </div>
            ))}
            {!cap.perRoom.length && <p className="muted">No rooms yet.</p>}
          </div>
        </>)}
        <div className="actions">
          <button disabled={!cap?.canAllocate} onClick={() => run(() => api('/allocate', 'POST'), (r) => `Allocated ${r.allocated} students`)}>Allocate seats</button>
          <button className="ghost" onClick={() => run(() => api('/allocations', 'DELETE'), 'Allocations reset')}>Reset allocations</button>
          <button className="ghost" onClick={() => confirm('Delete ALL students and allocations?') && run(() => api('/students', 'DELETE'), 'Students cleared')}>Clear students</button>
        </div>
      </section>

      <div className="grid">
        <section className="card">
          <h2>Add room</h2>
          <form onSubmit={addRoom}>
            <input placeholder="Room name (e.g. Hall A)" value={room.name} onChange={(e) => setRoom({ ...room, name: e.target.value })} required />
            <input type="number" min="1" max="100" placeholder="Rows" value={room.rows} onChange={(e) => setRoom({ ...room, rows: e.target.value })} required />
            <input type="number" min="1" max="100" placeholder="Seats per row" value={room.seatsPerRow} onChange={(e) => setRoom({ ...room, seatsPerRow: e.target.value })} required />
            <button>Add room</button>
          </form>
        </section>
        <section className="card">
          <h2>Import students</h2>
          <input type="file" accept=".csv,.txt" onChange={onFile} />
          <textarea rows="5" placeholder={'rollNo,name\n21CS001,Asha Rao\n21CS002,Ravi Kumar'} value={csv} onChange={(e) => setCsv(e.target.value)} />
          <button disabled={!csv.trim()} onClick={importStudents}>Import</button>
        </section>
      </div>

      <section className="card">
        <h2>Seating chart</h2>
        <input placeholder="Search roll no or name" value={search} onChange={(e) => setSearch(e.target.value)} />
        {Object.keys(byRoom).length === 0 && <p className="muted">Nothing allocated yet.</p>}
        {Object.entries(byRoom).map(([name, list]) => (
          <div key={name} className="tablewrap">
            <h3>{name}</h3>
            <table><thead><tr><th>Roll no</th><th>Name</th><th>Row</th><th>Seat</th></tr></thead>
              <tbody>{list.map((a) => <tr key={a._id}><td>{a.rollNo}</td><td>{a.name}</td><td>{a.row}</td><td>{a.seat}</td></tr>)}</tbody></table>
          </div>
        ))}
      </section>
    </main>
  );
}

const Stat = ({ label, v, warn }) => <div className={`stat ${warn ? 'warn' : ''}`}><strong>{v}</strong><span>{label}</span></div>;
