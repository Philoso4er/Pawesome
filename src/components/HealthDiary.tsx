import React, { useState, useEffect } from 'react';
import { Plus, Calendar, Activity, Pill, Stethoscope, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useFirebase } from '../FirebaseProvider';
import { HealthRecord, Pet } from '../types';
import { format } from 'date-fns';

export default function HealthDiary() {
  const { user } = useFirebase();
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState<string>('');
  const [newRecord, setNewRecord] = useState<Partial<HealthRecord>>({
    type: 'vaccination',
    date: format(new Date(), 'yyyy-MM-dd'),
    title: '',
    notes: '',
    vetName: '',
    medicationName: '',
    dosage: '',
  });

  useEffect(() => {
    if (!user) return;

    // Fetch Pets
    const petsQuery = query(collection(db, 'users', user.uid, 'pets'));
    const unsubscribePets = onSnapshot(petsQuery, (snapshot) => {
      const petList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Pet[];
      setPets(petList);
      if (petList.length > 0 && !selectedPetId) setSelectedPetId(petList[0].id);
    });

    // Fetch Health Records
    const healthQuery = query(
      collection(db, 'users', user.uid, 'health'),
      orderBy('date', 'desc')
    );
    const unsubscribeHealth = onSnapshot(healthQuery, (snapshot) => {
      const recordList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as HealthRecord[];
      setRecords(recordList);
    });

    return () => {
      unsubscribePets();
      unsubscribeHealth();
    };
  }, [user]);

  const handleAddRecord = async () => {
    if (!user || !selectedPetId || !newRecord.title) return;

    try {
      await addDoc(collection(db, 'users', user.uid, 'health'), {
        ...newRecord,
        petId: selectedPetId,
        timestamp: serverTimestamp(),
      });
      setIsAdding(false);
      setNewRecord({
        type: 'vaccination',
        date: format(new Date(), 'yyyy-MM-dd'),
        title: '',
        notes: '',
        vetName: '',
        medicationName: '',
        dosage: '',
      });
    } catch (error) {
      console.error("Error adding health record:", error);
    }
  };

  const deleteRecord = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'health', id));
    } catch (error) {
      console.error("Error deleting record:", error);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'vaccination': return <Activity className="text-blue-500" />;
      case 'medication': return <Pill className="text-purple-500" />;
      case 'vet_visit': return <Stethoscope className="text-emerald-500" />;
      case 'symptom': return <Activity className="text-red-500" />;
      default: return <Activity />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-serif font-bold text-[#5A5A40]">Health Diary</h2>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 bg-[#5A5A40] text-white px-4 py-2 rounded-full text-sm font-semibold hover:shadow-md transition-all"
        >
          <Plus size={18} />
          Add Entry
        </button>
      </div>

      {isAdding && (
        <div className="p-6 bg-white rounded-3xl border-2 border-[#5A5A40]/20 space-y-4 shadow-lg animate-in zoom-in-95 duration-200">
          <h3 className="font-serif font-bold text-[#5A5A40]">New Health Entry</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">Select Pet</label>
              <select 
                value={selectedPetId}
                onChange={e => setSelectedPetId(e.target.value)}
                className="w-full bg-[#FDFCFB] border-[#F0EBE6] rounded-xl text-sm"
              >
                {pets.map(pet => (
                  <option key={pet.id} value={pet.id}>{pet.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">Entry Type</label>
              <select 
                value={newRecord.type}
                onChange={e => setNewRecord({...newRecord, type: e.target.value as any})}
                className="w-full bg-[#FDFCFB] border-[#F0EBE6] rounded-xl text-sm"
              >
                <option value="vaccination">Vaccination</option>
                <option value="medication">Medication</option>
                <option value="vet_visit">Vet Visit</option>
                <option value="symptom">Symptom Tracking</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">Title / Reason</label>
              <input 
                type="text" 
                value={newRecord.title}
                onChange={e => setNewRecord({...newRecord, title: e.target.value})}
                className="w-full bg-[#FDFCFB] border-[#F0EBE6] rounded-xl text-sm"
                placeholder="Annual Checkup"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">Date</label>
              <input 
                type="date" 
                value={newRecord.date}
                onChange={e => setNewRecord({...newRecord, date: e.target.value})}
                className="w-full bg-[#FDFCFB] border-[#F0EBE6] rounded-xl text-sm"
              />
            </div>
            {newRecord.type === 'vet_visit' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">Vet Name</label>
                <input 
                  type="text" 
                  value={newRecord.vetName}
                  onChange={e => setNewRecord({...newRecord, vetName: e.target.value})}
                  className="w-full bg-[#FDFCFB] border-[#F0EBE6] rounded-xl text-sm"
                  placeholder="Dr. Smith"
                />
              </div>
            )}
            {newRecord.type === 'medication' && (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">Medication Name</label>
                  <input 
                    type="text" 
                    value={newRecord.medicationName}
                    onChange={e => setNewRecord({...newRecord, medicationName: e.target.value})}
                    className="w-full bg-[#FDFCFB] border-[#F0EBE6] rounded-xl text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">Dosage</label>
                  <input 
                    type="text" 
                    value={newRecord.dosage}
                    onChange={e => setNewRecord({...newRecord, dosage: e.target.value})}
                    className="w-full bg-[#FDFCFB] border-[#F0EBE6] rounded-xl text-sm"
                  />
                </div>
              </>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">Notes</label>
            <textarea 
              value={newRecord.notes}
              onChange={e => setNewRecord({...newRecord, notes: e.target.value})}
              className="w-full bg-[#FDFCFB] border-[#F0EBE6] rounded-xl text-sm min-h-[80px]"
              placeholder="Any specific observations..."
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button 
              onClick={handleAddRecord}
              className="flex-1 bg-[#5A5A40] text-white py-2 rounded-xl font-bold text-sm"
            >
              Save Entry
            </button>
            <button 
              onClick={() => setIsAdding(false)}
              className="flex-1 bg-[#F5F2ED] text-[#5A5A40] py-2 rounded-xl font-bold text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {records.length > 0 ? (
          records.map(record => {
            const pet = pets.find(p => p.id === record.petId);
            return (
              <div key={record.id} className="p-5 bg-white rounded-3xl border border-[#F0EBE6] hover:shadow-md transition-all">
                <div className="flex items-start justify-between">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 bg-[#F5F2ED] rounded-2xl flex items-center justify-center">
                      {getIcon(record.type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-[#5A5A40]">{record.title}</h4>
                        <span className="text-[10px] font-bold uppercase tracking-widest bg-[#F5F2ED] text-[#A19B95] px-2 py-0.5 rounded-full">
                          {pet?.name || 'Unknown Pet'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#A19B95] mt-1">
                        <Calendar size={12} />
                        {format(new Date(record.date), 'MMM dd, yyyy')}
                        {record.vetName && <span>• Vet: {record.vetName}</span>}
                      </div>
                      {record.notes && (
                        <p className="text-sm text-[#7C7670] mt-2 italic">"{record.notes}"</p>
                      )}
                      {record.medicationName && (
                        <div className="mt-2 p-2 bg-[#FDFCFB] rounded-lg border border-[#F0EBE6] text-xs">
                          <span className="font-bold text-[#5A5A40]">Medication:</span> {record.medicationName} ({record.dosage})
                        </div>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => deleteRecord(record.id)}
                    className="p-2 text-[#A19B95] hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-[#F0EBE6]">
            <p className="text-[#A19B95] font-medium">No health records yet.</p>
            <p className="text-xs text-[#A19B95]/60 mt-1">Start tracking your pet's health journey.</p>
          </div>
        )}
      </div>
    </div>
  );
}
