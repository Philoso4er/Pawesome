import React, { useState, useEffect } from 'react';
import { Heart, TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '../firebase';
import {
  collection, onSnapshot, query, orderBy, doc, setDoc
} from 'firebase/firestore';
import { useFirebase } from '../FirebaseProvider';
import { Pet, SeniorJournalEntry } from '../types';
import { format, subDays, addDays, isSameDay } from 'date-fns';

type Score = 1 | 2 | 3;
type Metric = 'appetite' | 'mobility' | 'water' | 'mood';

const METRICS: { key: Metric; label: string; emoji: string }[] = [
  { key: 'appetite', label: 'Appetite', emoji: '🍽' },
  { key: 'mobility', label: 'Mobility', emoji: '🐾' },
  { key: 'water', label: 'Water intake', emoji: '💧' },
  { key: 'mood', label: 'Mood', emoji: '😊' },
];

const SCORE_LABELS: Record<Score, string> = { 1: 'Poor', 2: 'OK', 3: 'Good' };
const SCORE_COLOURS: Record<Score, string> = {
  1: 'bg-red-100 text-red-600 border-red-200',
  2: 'bg-amber-100 text-amber-600 border-amber-200',
  3: 'bg-emerald-100 text-emerald-600 border-emerald-200',
};

function ScorePicker({ value, onChange }: { value: Score; onChange: (s: Score) => void }) {
  return (
    <div className="flex gap-2">
      {([1, 2, 3] as Score[]).map(s => (
        <button key={s} onClick={() => onChange(s)}
          className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${value === s ? SCORE_COLOURS[s] : 'bg-[#F5F0EB] text-[#A19B95] border-[#F0EBE6] hover:bg-[#EDE8E3]'}`}>
          {SCORE_LABELS[s]}
        </button>
      ))}
    </div>
  );
}

function TrendIcon({ entries, metric }: { entries: SeniorJournalEntry[]; metric: Metric }) {
  if (entries.length < 3) return <Minus size={14} className="text-[#A19B95]" />;
  const recent = entries.slice(0, 3).map(e => e[metric] as number);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const older = entries.slice(3, 6).map(e => e[metric] as number);
  if (!older.length) return <Minus size={14} className="text-[#A19B95]" />;
  const oldAvg = older.reduce((a, b) => a + b, 0) / older.length;
  if (avg > oldAvg + 0.3) return <TrendingUp size={14} className="text-emerald-500" />;
  if (avg < oldAvg - 0.3) return <TrendingDown size={14} className="text-red-400" />;
  return <Minus size={14} className="text-[#A19B95]" />;
}

export default function SeniorJournal() {
  const { user } = useFirebase();
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState('');
  const [viewDate, setViewDate] = useState(new Date());
  const [entries, setEntries] = useState<SeniorJournalEntry[]>([]);
  const [todayEntry, setTodayEntry] = useState<Omit<SeniorJournalEntry, 'id' | 'petId' | 'timestamp'>>({
    date: format(new Date(), 'yyyy-MM-dd'),
    appetite: 2,
    mobility: 2,
    water: 2,
    mood: 2,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const selectedPet = pets.find(p => p.id === selectedPetId);
  const dateKey = format(viewDate, 'yyyy-MM-dd');
  const existingEntry = entries.find(e => e.date === dateKey);
  const isToday = isSameDay(viewDate, new Date());

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
    const q = query(collection(db, 'users', user.uid, 'seniorJournal'), orderBy('date', 'desc'));
    return onSnapshot(q, snap => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SeniorJournalEntry).filter(e => e.petId === selectedPetId));
    });
  }, [user, selectedPetId]);

  useEffect(() => {
    if (existingEntry) {
      setTodayEntry({ date: existingEntry.date, appetite: existingEntry.appetite, mobility: existingEntry.mobility, water: existingEntry.water, mood: existingEntry.mood, notes: existingEntry.notes ?? '' });
    } else {
      setTodayEntry(e => ({ ...e, date: dateKey }));
    }
  }, [existingEntry, dateKey]);

  const handleSave = async () => {
    if (!user || !selectedPetId) return;
    setSaving(true);
    const id = `${selectedPetId}_${dateKey}`;
    await setDoc(doc(db, 'users', user.uid, 'seniorJournal', id), { ...todayEntry, petId: selectedPetId, timestamp: new Date().toISOString() });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const generateVetSummary = () => {
    if (entries.length === 0) return '';
    const last14 = entries.slice(0, 14);
    const avg = (metric: Metric) => (last14.reduce((s, e) => s + e[metric], 0) / last14.length).toFixed(1);
    return `Pawesome Senior Journal — ${selectedPet?.name} (last ${last14.length} days)\n\nAppetite avg: ${avg('appetite')}/3\nMobility avg: ${avg('mobility')}/3\nWater intake avg: ${avg('water')}/3\nMood avg: ${avg('mood')}/3\n\nRecent notes:\n${last14.filter(e => e.notes).slice(0, 5).map(e => `${e.date}: ${e.notes}`).join('\n') || 'None recorded.'}`;
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-bold text-[#1A1A1A]">Senior Pet Journal</h2>
        <p className="text-[#A19B95] text-sm mt-0.5">Daily health check-ins. Trends you can bring to the vet.</p>
      </div>

      {pets.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {pets.map(p => (
            <button key={p.id} onClick={() => setSelectedPetId(p.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${selectedPetId === p.id ? 'bg-[#5A5A40] text-white' : 'bg-[#F5F0EB] text-[#5A5A40]'}`}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      {selectedPet && (
        <>
          <div className="flex items-center justify-between bg-white border border-[#F0EBE6] rounded-2xl px-4 py-3">
            <button onClick={() => setViewDate(d => subDays(d, 1))} className="p-1 hover:bg-[#F5F0EB] rounded-lg transition-colors">
              <ChevronLeft size={18} className="text-[#5A5A40]" />
            </button>
            <div className="text-center">
              <p className="font-bold text-[#1A1A1A] text-sm">{isToday ? 'Today' : format(viewDate, 'EEEE')}</p>
              <p className="text-xs text-[#A19B95]">{format(viewDate, 'dd MMM yyyy')}</p>
            </div>
            <button onClick={() => setViewDate(d => addDays(d, 1))} disabled={isToday} className="p-1 hover:bg-[#F5F0EB] rounded-lg transition-colors disabled:opacity-30">
              <ChevronRight size={18} className="text-[#5A5A40]" />
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-[#F0EBE6] p-5 space-y-5">
            {METRICS.map(({ key, label, emoji }) => (
              <div key={key}>
                <p className="text-sm font-semibold text-[#1A1A1A] mb-2">{emoji} {label}</p>
                <ScorePicker value={todayEntry[key] as Score} onChange={s => setTodayEntry(e => ({ ...e, [key]: s }))} />
              </div>
            ))}
            <div>
              <label className="text-xs font-semibold text-[#A19B95] uppercase tracking-wide">Notes</label>
              <textarea value={todayEntry.notes} onChange={e => setTodayEntry(f => ({ ...f, notes: e.target.value }))} placeholder="Anything worth noting today..." rows={2} className="mt-1 w-full border border-[#F0EBE6] rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20" />
            </div>
            <button onClick={handleSave} disabled={saving} className="w-full bg-[#5A5A40] text-white py-3 rounded-2xl text-sm font-bold disabled:opacity-40 transition-colors hover:bg-[#4A4A33]">
              {saved ? '✓ Saved' : saving ? 'Saving...' : existingEntry ? 'Update entry' : 'Save entry'}
            </button>
          </div>

          {entries.length >= 3 && (
            <div className="bg-white rounded-3xl border border-[#F0EBE6] p-5">
              <h3 className="font-bold text-[#1A1A1A] mb-4 flex items-center gap-2">
                <Heart size={16} className="text-[#5A5A40]" /> 7-day trends
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {METRICS.map(({ key, label, emoji }) => {
                  const last7 = entries.slice(0, 7);
                  const avg = last7.reduce((s, e) => s + (e[key] as number), 0) / last7.length;
                  const score = Math.round(avg) as Score;
                  return (
                    <div key={key} className={`rounded-2xl border px-4 py-3 ${SCORE_COLOURS[score]}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">{emoji} {label}</span>
                        <TrendIcon entries={entries} metric={key} />
                      </div>
                      <p className="text-lg font-bold mt-1">{SCORE_LABELS[score]}</p>
                      <p className="text-xs opacity-70">avg {avg.toFixed(1)}/3</p>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => navigator.clipboard.writeText(generateVetSummary())} className="mt-4 w-full border border-[#F0EBE6] text-[#5A5A40] py-2.5 rounded-2xl text-sm font-bold hover:bg-[#F5F0EB] transition-colors">
                Copy vet summary
              </button>
            </div>
          )}

          {entries.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-bold text-[#1A1A1A]">History</h3>
              {entries.slice(0, 10).map(e => (
                <div key={e.id} className="bg-white rounded-2xl border border-[#F0EBE6] px-4 py-3 flex items-center gap-4">
                  <p className="text-xs text-[#A19B95] w-20 shrink-0">{format(new Date(e.date), 'dd MMM')}</p>
                  <div className="flex gap-2 flex-1">
                    {METRICS.map(({ key, emoji }) => (
                      <span key={key} title={key} className={`text-xs px-2 py-0.5 rounded-lg border font-bold ${SCORE_COLOURS[e[key] as Score]}`}>{emoji}</span>
                    ))}
                  </div>
                  {e.notes && <p className="text-xs text-[#A19B95] truncate max-w-[120px]">{e.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {pets.length === 0 && (
        <div className="bg-white rounded-3xl border border-[#F0EBE6] p-10 text-center">
          <Heart size={32} className="text-[#D4CFC9] mx-auto mb-3" />
          <p className="text-[#A19B95] text-sm">Add a pet profile first to start the journal.</p>
        </div>
      )}
    </div>
  );
}
