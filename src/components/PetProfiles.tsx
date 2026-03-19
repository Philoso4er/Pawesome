import React, { useState, useEffect, useRef } from 'react';
import { Plus, PawPrint, Trash2, Edit2, Loader2, Camera, Sparkles } from 'lucide-react';
import { Pet } from '../types';
import { cn } from '../lib/utils';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, query, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useFirebase } from '../FirebaseProvider';
import { recognizePetBreed } from '../services/gemini';

export default function PetProfiles() {
  const { user } = useFirebase();
  const [pets, setPets] = useState<Pet[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [newPet, setNewPet] = useState<Partial<Pet>>({
    name: '',
    species: 'Dog',
    breed: '',
    age: 0,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'users', user.uid, 'pets'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const petList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Pet[];
      setPets(petList);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching pets:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = (reader.result as string).split(',')[1];
      const result = await recognizePetBreed(base64Data, file.type);
      if (result) {
        setNewPet(prev => ({
          ...prev,
          species: result.species || prev.species,
          breed: result.breed || prev.breed
        }));
      }
      setIsAnalyzing(false);
    };
    reader.readAsDataURL(file);
  };

  const handleAddPet = async () => {
    if (!newPet.name || !user) return;
    
    try {
      await addDoc(collection(db, 'users', user.uid, 'pets'), {
        ownerId: user.uid,
        name: newPet.name,
        species: newPet.species,
        breed: newPet.breed || 'Unknown',
        age: Number(newPet.age) || 0,
        createdAt: serverTimestamp(),
      });
      setIsAdding(false);
      setNewPet({ name: '', species: 'Dog', breed: '', age: 0 });
    } catch (error) {
      console.error("Error adding pet:", error);
    }
  };

  const removePet = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'pets', id));
    } catch (error) {
      console.error("Error removing pet:", error);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-serif font-bold text-[#5A5A40]">My Pets</h2>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 bg-[#5A5A40] text-white px-4 py-2 rounded-full text-sm font-semibold hover:shadow-md transition-all"
        >
          <Plus size={18} />
          Add Pet
        </button>
      </div>

      {isAdding && (
        <div className="p-6 bg-white rounded-3xl border-2 border-[#5A5A40]/20 space-y-6 shadow-lg animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between">
            <h3 className="font-serif font-bold text-[#5A5A40]">New Pet Profile</h3>
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isAnalyzing}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#5A5A40] bg-[#F5F2ED] px-3 py-1.5 rounded-lg hover:bg-[#EBE7E0] transition-colors"
            >
              {isAnalyzing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Camera size={14} />
              )}
              {isAnalyzing ? 'Analyzing...' : 'Identify via Photo'}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleImageUpload}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">Name</label>
              <input 
                type="text" 
                value={newPet.name}
                onChange={e => setNewPet({...newPet, name: e.target.value})}
                className="w-full bg-[#FDFCFB] border-[#F0EBE6] rounded-xl text-sm focus:ring-[#5A5A40] focus:border-[#5A5A40]"
                placeholder="Buddy"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">Species</label>
              <select 
                value={newPet.species}
                onChange={e => setNewPet({...newPet, species: e.target.value})}
                className="w-full bg-[#FDFCFB] border-[#F0EBE6] rounded-xl text-sm focus:ring-[#5A5A40] focus:border-[#5A5A40]"
              >
                <option>Dog</option>
                <option>Cat</option>
                <option>Bird</option>
                <option>Reptile</option>
                <option>Other</option>
              </select>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">Breed</label>
                {isAnalyzing && <Sparkles size={10} className="text-[#5A5A40] animate-pulse" />}
              </div>
              <input 
                type="text" 
                value={newPet.breed}
                onChange={e => setNewPet({...newPet, breed: e.target.value})}
                className={cn(
                  "w-full bg-[#FDFCFB] border-[#F0EBE6] rounded-xl text-sm focus:ring-[#5A5A40] focus:border-[#5A5A40]",
                  isAnalyzing && "opacity-50"
                )}
                placeholder="Golden Retriever"
                disabled={isAnalyzing}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">Age (Years)</label>
              <input 
                type="number" 
                value={newPet.age}
                onChange={e => setNewPet({...newPet, age: Number(e.target.value)})}
                className="w-full bg-[#FDFCFB] border-[#F0EBE6] rounded-xl text-sm focus:ring-[#5A5A40] focus:border-[#5A5A40]"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button 
              onClick={handleAddPet}
              className="flex-1 bg-[#5A5A40] text-white py-2 rounded-xl font-bold text-sm"
            >
              Save Profile
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
        {pets.length > 0 ? (
          pets.map(pet => (
            <div key={pet.id} className="p-5 bg-white rounded-3xl border border-[#F0EBE6] flex items-center justify-between group hover:shadow-md transition-all">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-[#F5F2ED] rounded-2xl flex items-center justify-center text-[#5A5A40]">
                  <PawPrint size={28} />
                </div>
                <div>
                  <h4 className="font-bold text-[#5A5A40] text-lg">{pet.name}</h4>
                  <p className="text-sm text-[#A19B95]">{pet.breed} • {pet.age} years old</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="p-2 text-[#A19B95] hover:text-[#5A5A40] transition-colors">
                  <Edit2 size={18} />
                </button>
                <button 
                  onClick={() => removePet(pet.id)}
                  className="p-2 text-[#A19B95] hover:text-red-500 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-[#F0EBE6]">
            <div className="w-16 h-16 bg-[#FDFCFB] rounded-full flex items-center justify-center mx-auto mb-4 text-[#A19B95]">
              <PawPrint size={32} />
            </div>
            <p className="text-[#A19B95] font-medium">No pets added yet.</p>
            <p className="text-xs text-[#A19B95]/60 mt-1">Add your pet to get personalized AI advice.</p>
          </div>
        )}
      </div>
    </div>
  );
}
