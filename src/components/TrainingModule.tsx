import React, { useState, useEffect } from 'react';
import { Play, CheckCircle, Clock, BookOpen, ChevronRight, Star, Video, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useFirebase } from '../FirebaseProvider';
import { TrainingTask, TrainingProgress, Pet } from '../types';
import { generateTrainingVideo } from '../services/gemini';
import { cn } from '../lib/utils';

const STATIC_TASKS: TrainingTask[] = [
  { id: 'sit', title: 'Sit', description: 'Teach your pet to sit on command.', category: 'basic', difficulty: 'easy' },
  { id: 'stay', title: 'Stay', description: 'Teach your pet to stay in one place.', category: 'basic', difficulty: 'medium' },
  { id: 'come', title: 'Come', description: 'Recall your pet from a distance.', category: 'basic', difficulty: 'easy' },
  { id: 'leash', title: 'Leash Walking', description: 'Walking calmly on a leash without pulling.', category: 'behavior', difficulty: 'medium' },
  { id: 'potty', title: 'Potty Training', description: 'Essential house training for new pets.', category: 'behavior', difficulty: 'hard' },
];

export default function TrainingModule() {
  const { user } = useFirebase();
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string>('');
  const [progress, setProgress] = useState<TrainingProgress[]>([]);
  const [activeTask, setActiveTask] = useState<TrainingTask | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const steps = [
    "Analyzing pet profile...",
    "Designing custom training sequence...",
    "Synthesizing visual demonstrations...",
    "Rendering high-definition guide...",
    "Finalizing your personalized tutorial..."
  ];

  useEffect(() => {
    setVideoUrl(null);
    setError(null);
  }, [activeTask]);

  useEffect(() => {
    let interval: any;
    if (isGenerating) {
      interval = setInterval(() => {
        setGenerationStep(prev => (prev + 1) % steps.length);
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  const handleGenerateVideo = async () => {
    if (!activeTask || !selectedPetId) return;
    
    const pet = pets.find(p => p.id === selectedPetId);
    if (!pet) return;

    setError(null);
    
    // Check for API key selection (Veo requirement)
    const aistudio = (window as any).aistudio;
    if (aistudio) {
      const hasKey = await aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await aistudio.openSelectKey();
        // After opening the dialog, we assume the user will select a key and proceed.
        // The platform will rebuild/refresh if needed, but we can also just try to proceed.
      }
    }

    setIsGenerating(true);
    setGenerationStep(0);
    setVideoUrl(null);

    try {
      const petContext = `${pet.name} is a ${pet.age} year old ${pet.breed} ${pet.species}.`;
      const url = await generateTrainingVideo(activeTask.title, petContext);
      setVideoUrl(url);
    } catch (err: any) {
      console.error("Video generation error:", err);
      if (err.message?.includes("Requested entity was not found")) {
        setError("API Key issue. Please re-select your paid API key in settings.");
        if (aistudio) await aistudio.openSelectKey();
      } else {
        setError("Failed to generate video. Please try again later.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    // Fetch Pets
    const petsQuery = query(collection(db, 'users', user.uid, 'pets'));
    const unsubscribePets = onSnapshot(petsQuery, (snapshot) => {
      const petList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Pet[];
      setPets(petList);
      if (petList.length > 0 && !selectedPetId) setSelectedPetId(petList[0].id);
    });

    return () => unsubscribePets();
  }, [user]);

  useEffect(() => {
    if (!user || !selectedPetId) return;

    const progressQuery = query(
      collection(db, 'users', user.uid, 'training'),
      where('petId', '==', selectedPetId)
    );
    const unsubscribeProgress = onSnapshot(progressQuery, (snapshot) => {
      const progressList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as TrainingProgress[];
      setProgress(progressList);
    });

    return () => unsubscribeProgress();
  }, [user, selectedPetId]);

  const updateProgress = async (taskId: string, status: TrainingProgress['status']) => {
    if (!user || !selectedPetId) return;

    const existing = progress.find(p => p.taskId === taskId);
    try {
      if (existing) {
        await updateDoc(doc(db, 'users', user.uid, 'training', existing.id), {
          status,
          lastPracticed: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'users', user.uid, 'training'), {
          petId: selectedPetId,
          taskId,
          status,
          lastPracticed: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error("Error updating progress:", error);
    }
  };

  const getTaskStatus = (taskId: string) => {
    return progress.find(p => p.taskId === taskId)?.status || 'not_started';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-serif font-bold text-[#5A5A40]">Training Module</h2>
        <select 
          value={selectedPetId}
          onChange={e => setSelectedPetId(e.target.value)}
          className="bg-white border-[#F0EBE6] rounded-full text-sm px-4 py-2 text-[#5A5A40] font-semibold"
        >
          {pets.map(pet => (
            <option key={pet.id} value={pet.id}>{pet.name}</option>
          ))}
        </select>
      </div>

      {activeTask ? (
        <div className="bg-white rounded-[32px] p-8 border border-[#F0EBE6] space-y-6 animate-in slide-in-from-right duration-300">
          <button 
            onClick={() => setActiveTask(null)}
            className="text-sm font-bold text-[#A19B95] hover:text-[#5A5A40] flex items-center gap-1"
          >
            ← Back to Library
          </button>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-3xl font-serif font-bold text-[#5A5A40]">{activeTask.title}</h3>
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full",
                activeTask.difficulty === 'easy' ? "bg-emerald-100 text-emerald-700" :
                activeTask.difficulty === 'medium' ? "bg-orange-100 text-orange-700" :
                "bg-red-100 text-red-700"
              )}>
                {activeTask.difficulty}
              </span>
            </div>
            <p className="text-[#7C7670]">{activeTask.description}</p>
          </div>

          <div className="aspect-video bg-[#F5F2ED] rounded-3xl flex items-center justify-center text-[#A19B95] relative group overflow-hidden border border-[#F0EBE6]">
            {isGenerating ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#151619] text-white p-8 text-center space-y-6">
                <div className="relative">
                  <div className="w-20 h-20 bg-emerald-500/20 rounded-[32px] flex items-center justify-center text-emerald-400 animate-pulse">
                    <Sparkles size={40} />
                  </div>
                  <Loader2 className="absolute -bottom-2 -right-2 text-emerald-400 animate-spin" size={24} />
                </div>
                <div className="space-y-2">
                  <p className="text-xl font-serif font-bold tracking-tight">{steps[generationStep]}</p>
                  <p className="text-white/40 text-xs uppercase tracking-widest font-bold">Veo AI Generation in progress</p>
                </div>
                <div className="w-full max-w-xs bg-white/10 h-1 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-1000" 
                    style={{ width: `${((generationStep + 1) / steps.length) * 100}%` }} 
                  />
                </div>
              </div>
            ) : videoUrl ? (
              <video 
                src={videoUrl} 
                controls 
                autoPlay
                className="w-full h-full object-cover"
              />
            ) : (
              <div 
                onClick={handleGenerateVideo}
                className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer group"
              >
                <div className="absolute inset-0 bg-black/5 group-hover:bg-black/10 transition-colors" />
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform relative z-10">
                  <Play size={32} className="text-[#5A5A40] fill-[#5A5A40] ml-1" />
                </div>
                <div className="relative z-10 mt-4 text-center">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#5A5A40]">Generate AI Tutorial</p>
                  <p className="text-[10px] text-[#A19B95] mt-1">Powered by Veo</p>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm">
              <AlertCircle size={18} />
              <p>{error}</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            {(['not_started', 'in_progress', 'mastered'] as const).map(status => (
              <button
                key={status}
                onClick={() => updateProgress(activeTask.id, status)}
                className={cn(
                  "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2",
                  getTaskStatus(activeTask.id) === status 
                    ? "border-[#5A5A40] bg-[#5A5A40] text-white" 
                    : "border-[#F0EBE6] bg-white text-[#A19B95] hover:border-[#5A5A40]/30"
                )}
              >
                {status === 'mastered' ? <CheckCircle size={20} /> : status === 'in_progress' ? <Clock size={20} /> : <BookOpen size={20} />}
                <span className="text-[10px] font-bold uppercase tracking-widest">{status.replace('_', ' ')}</span>
              </button>
            ))}
          </div>

          <div className="p-6 bg-[#FDFCFB] rounded-2xl border border-[#F0EBE6] space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-[#5A5A40]">AI Feedback</h4>
              <button className="flex items-center gap-2 text-xs font-bold text-[#5A5A40] bg-white px-3 py-1.5 rounded-full border border-[#F0EBE6]">
                <Video size={14} />
                Upload Practice Video
              </button>
            </div>
            <p className="text-sm text-[#A19B95]">Upload a video of your pet practicing this command to get personalized AI feedback on your technique.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {STATIC_TASKS.map(task => {
            const status = getTaskStatus(task.id);
            return (
              <div 
                key={task.id}
                onClick={() => setActiveTask(task)}
                className="p-6 bg-white rounded-[32px] border border-[#F0EBE6] hover:shadow-lg transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-[#F5F2ED] rounded-2xl flex items-center justify-center text-[#5A5A40] group-hover:scale-110 transition-transform">
                    <Star size={24} />
                  </div>
                  <div className={cn(
                    "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full",
                    status === 'mastered' ? "bg-emerald-100 text-emerald-700" :
                    status === 'in_progress' ? "bg-orange-100 text-orange-700" :
                    "bg-[#F5F2ED] text-[#A19B95]"
                  )}>
                    {status.replace('_', ' ')}
                  </div>
                </div>
                <h4 className="text-xl font-serif font-bold text-[#5A5A40] mb-1">{task.title}</h4>
                <p className="text-sm text-[#A19B95] line-clamp-2">{task.description}</p>
                <div className="mt-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">
                  <span>{task.category}</span>
                  <ChevronRight size={16} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
