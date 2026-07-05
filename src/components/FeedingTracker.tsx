import React, { useState, useEffect } from 'react';
import { Plus, Clock, Trash2, CheckCircle, UtensilsCrossed } from 'lucide-react';
import { db } from '../firebase';
import {
  collection, addDoc, onSnapshot, query, orderBy,
  deleteDoc, doc, serverTimestamp, setDoc, getDoc,
} from 'firebase/firestore';
import { useFirebase } from '../FirebaseProvider';
import { Pet, FeedingLog, FeedingSchedule } from '../types';
import { format, formatDistanceToNow } from 'date-fns';

export default function FeedingTracker() {
  const { user } = useFirebase();
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState('');
  const [logs, setLogs] = useState<FeedingLog[]>([]);
  const [schedule, setSchedule] = useState<FeedingSchedule | null>(null);
  const [isLogging, setIsLogging] = useState(false);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [portionGiven, setPortionGiven] = useState('');
  const [logNotes, setLogNotes] = useState('');
  const [scheduleForm, setScheduleForm] = useState({
    times: ['08:00', '18:00'],
    portionSize: '',
    foodType: '',
    notes: '',
  });

  const selectedPet = pets.find(p => p.id === selectedPetId);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'pets'));
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Pet[];
      setPets(list);
      if (list.length && !selectedPetId) setSelectedPetId(list[0].id);
    });
  }, [user]);

  useEffect(() => {
    if (!user || !selectedPetId) return;
    const logsQ = query(
      collection(db, 'users', user.uid, 'feedingLogs'),
      orderBy('timestamp', 'desc')
    );
    const unsubLogs = onSnapshot(logsQ, snap => {
      setLogs(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }) as FeedingLog)
          .filter(l => l.petId === selectedPetId)
          .slice(0, 20)
      );
    });
    getDoc(doc(db, 'users', user.uid, 'feedingSchedules', selectedPetId)).then(d => {
      if (d.exists()) {
        const data = d.data() as FeedingSchedule;
        setSchedule(data);
        setScheduleForm({ times: data.times, portionSize: data.portionSize, foodType: data.foodType, notes: data.notes ?? '' });
        setPortionGiven(data.portionSize);
      } else {
        setSchedule(null);
      }
    });
    return () => unsubLogs();
  }, [user, selectedPetId]);

  const handleLog = async () => {
    if (!user || !selectedPetId || !portionGiven) return;
    await addDoc(collection(db, 'users', user.uid, 'feedingLogs'), {
      petId: selectedPetId,
      timestamp: serverTimestamp(),
      fedBy: user.displayName ?? user.email ?? 'You',
      portionGiven,
      notes: logNotes,
    });
    setIsLogging(false);
    setLogNotes('');
  };

  const handleSaveSchedule = async () => {
    if (!user || !selectedPetId) return;
    await setDoc(doc(db, 'users', user.uid, 'feedingSchedules', selectedPetId), { petId: selectedPetId, ...scheduleForm });
    setIsEditingSchedule(false);
    setPortionGiven(scheduleForm.portionSize);
  };

  const addTime = () => setScheduleForm(f => ({ ...f, times: [...f.times, '12:00'] }));
  const removeTime = (i: number) => setScheduleForm(f => ({ ...f, times: f.times.filter((_, idx) => idx !== i) }));
  const updateTime = (i: number, val: string) => setScheduleForm(f => ({ ...f, times: f.times.map((t, idx) => idx === i ? val : t) }));

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold text-[#1A1A1A]">Feeding Tracker</h2>
          <p className="text-[#A19B95] text-sm mt-0.5">Who fed the pet? No more double-feeding.</p>
        </div>
        <button onClick={() => setIsLogging(true)} className="flex items-center gap-2 bg-[#5A5A40] text-white px-4 py-2.5 rounded-2xl text-sm font-bold hover:bg-[#4A4A33] transition-colors">
          <CheckCircle size={16} /> Log Feeding
        </button>
      </div>

      {pets.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {pets.map(p => (
            <button key={p.id} onClick={() => setSelectedPetId(p.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${selectedPetId === p.id ? 'bg-[#5A5A40] text-white' : 'bg-[#F5F0EB] text-[#5A5A40] hover:bg-[#EDE8E3]'}`}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-3xl border border-[#F0EBE6] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[#1A1A1A] flex items-center gap-2"><Clock size={16} className="text-[#5A5A40]" /> Feeding Schedule</h3>
          <button onClick={() => setIsEditingSchedule(!isEditingSchedule)} className="text-xs text-[#5A5A40] font-semibold hover:underline">
            {isEditingSchedule ? 'Cancel' : schedule ? 'Edit' : 'Set up'}
          </button>
        </div>
        {isEditingSchedule ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-[#A19B95] uppercase tracking-wide">Food type</label>
              <input value={scheduleForm.foodType} onChange={e => setScheduleForm(f => ({ ...f, foodType: e.target.value }))} placeholder="e.g. Royal Canin Adult Dry" className="mt-1 w-full border border-[#F0EBE6] rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#A19B95] uppercase tracking-wide">Portion per meal</label>
              <input value={scheduleForm.portionSize} onChange={e => setScheduleForm(f => ({ ...f, portionSize: e.target.value }))} placeholder="e.g. 1 cup / 200g" className="mt-1 w-full border border-[#F0EBE6] rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#A19B95] uppercase tracking-wide">Meal times</label>
              <div className="mt-1 space-y-2">
                {scheduleForm.times.map((t, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="time" value={t} onChange={e => updateTime(i, e.target.value)} className="flex-1 border border-[#F0EBE6] rounded-xl px-3 py-2 text-sm" />
                    <button onClick={() => removeTime(i)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                  </div>
                ))}
                <button onClick={addTime} className="text-xs text-[#5A5A40] font-semibold flex items-center gap-1"><Plus size={12} /> Add time</button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#A19B95] uppercase tracking-wide">Notes for sitters</label>
              <textarea value={scheduleForm.notes} onChange={e => setScheduleForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any special instructions..." rows={2} className="mt-1 w-full border border-[#F0EBE6] rounded-xl px-3 py-2 text-sm" />
            </div>
            <button onClick={handleSaveSchedule} className="w-full bg-[#5A5A40] text-white py-2.5 rounded-2xl text-sm font-bold">Save Schedule</button>
          </div>
        ) : schedule ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {schedule.times.map(t => <span key={t} className="bg-[#F5F0EB] text-[#5A5A40] px-3 py-1.5 rounded-xl text-sm font-bold">{t}</span>)}
            </div>
            <p className="text-sm text-[#1A1A1A]"><span className="font-semibold">{schedule.portionSize}</span> of {schedule.foodType}</p>
            {schedule.notes && <p className="text-xs text-[#A19B95]">{schedule.notes}</p>}
          </div>
        ) : (
          <p className="text-sm text-[#A19B95]">No schedule set yet. Tap "Set up" to add one.</p>
        )}
      </div>

      {isLogging && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-lg text-[#1A1A1A]">Log feeding — {selectedPet?.name}</h3>
            <div>
              <label className="text-xs font-semibold text-[#A19B95] uppercase tracking-wide">Portion given</label>
              <input value={portionGiven} onChange={e => setPortionGiven(e.target.value)} placeholder="e.g. 1 cup" className="mt-1 w-full border border-[#F0EBE6] rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#A19B95] uppercase tracking-wide">Notes (optional)</label>
              <input value={logNotes} onChange={e => setLogNotes(e.target.value)} placeholder="e.g. ate slowly" className="mt-1 w-full border border-[#F0EBE6] rounded-xl px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setIsLogging(false)} className="flex-1 border border-[#F0EBE6] text-[#A19B95] py-2.5 rounded-2xl text-sm font-bold">Cancel</button>
              <button onClick={handleLog} disabled={!portionGiven} className="flex-1 bg-[#5A5A40] text-white py-2.5 rounded-2xl text-sm font-bold disabled:opacity-40">Confirm</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="font-bold text-[#1A1A1A]">Recent feedings</h3>
        {logs.length === 0 ? (
          <div className="bg-white rounded-3xl border border-[#F0EBE6] p-8 text-center">
            <UtensilsCrossed size={32} className="text-[#D4CFC9] mx-auto mb-3" />
            <p className="text-[#A19B95] text-sm">No feedings logged yet.</p>
          </div>
        ) : (
          logs.map(log => (
            <div key={log.id} className="bg-white rounded-2xl border border-[#F0EBE6] px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#1A1A1A]">{log.portionGiven}</p>
                <p className="text-xs text-[#A19B95] mt-0.5">by {log.fedBy} · {log.timestamp?.toDate ? formatDistanceToNow(log.timestamp.toDate(), { addSuffix: true }) : 'just now'}</p>
                {log.notes && <p className="text-xs text-[#A19B95] mt-0.5 italic">{log.notes}</p>}
              </div>
              <button onClick={() => deleteDoc(doc(db, 'users', user!.uid, 'feedingLogs', log.id))} className="text-[#D4CFC9] hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
