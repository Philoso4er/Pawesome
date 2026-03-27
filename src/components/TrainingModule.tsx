import React, { useState, useEffect, useRef } from 'react';
import {
  Play, CheckCircle, Clock, BookOpen, ChevronRight, Star,
  Video, Loader2, Sparkles, AlertCircle, Upload, Volume2,
  VolumeX, Download, X, FileText,
} from 'lucide-react';
import { db } from '../firebase';
import {
  collection, addDoc, onSnapshot, query, where,
  updateDoc, doc, serverTimestamp, getDoc, setDoc,
} from 'firebase/firestore';
import { useFirebase } from '../FirebaseProvider';
import { TrainingTask, TrainingProgress, Pet } from '../types';
import { getPetAdvice } from '../services/gemini';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';

const STATIC_TASKS: TrainingTask[] = [
  { id: 'sit', title: 'Sit', description: 'Teach your pet to sit on command.', category: 'basic', difficulty: 'easy' },
  { id: 'stay', title: 'Stay', description: 'Teach your pet to stay in one place.', category: 'basic', difficulty: 'medium' },
  { id: 'come', title: 'Come', description: 'Recall your pet from a distance.', category: 'basic', difficulty: 'easy' },
  { id: 'leash', title: 'Leash Walking', description: 'Walking calmly on a leash without pulling.', category: 'behavior', difficulty: 'medium' },
  { id: 'potty', title: 'Potty Training', description: 'Essential house training for new pets.', category: 'behavior', difficulty: 'hard' },
  { id: 'down', title: 'Lie Down', description: 'Teach your pet to lie down on command.', category: 'basic', difficulty: 'easy' },
  { id: 'paw', title: 'Shake Paw', description: 'Teach your pet to offer their paw.', category: 'basic', difficulty: 'easy' },
  { id: 'leave', title: 'Leave It', description: 'Prevent your pet from picking up unwanted items.', category: 'behavior', difficulty: 'medium' },
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface TrainingGuide {
  taskId: string;
  petId: string;
  content: string;
  generatedAt: number;
}

interface VideoFeedback {
  score: number;
  feedback: string;
  tips: string[];
}

// ── Audio hook ─────────────────────────────────────────────────────────────────

function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const cleaned = text.replace(/[#*`]/g, '').replace(/\n+/g, ' ');
    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utteranceRef.current = utterance;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const stop = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);

  return { isSpeaking, speak, stop };
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TrainingModule() {
  const { user } = useFirebase();
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState('');
  const [progress, setProgress] = useState<TrainingProgress[]>([]);
  const [activeTask, setActiveTask] = useState<TrainingTask | null>(null);

  // Guide state
  const [guide, setGuide] = useState<string | null>(null);
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);
  const [guideError, setGuideError] = useState<string | null>(null);

  // Video upload + analysis state
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);
  const [videoFeedback, setVideoFeedback] = useState<VideoFeedback | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const { isSpeaking, speak, stop } = useTextToSpeech();

  // ── Load pets ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'users', user.uid, 'pets')),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Pet[];
        setPets(list);
        if (list.length > 0 && !selectedPetId) setSelectedPetId(list[0].id);
      }
    );
    return () => unsub();
  }, [user]);

  // ── Load progress ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user || !selectedPetId) return;
    const unsub = onSnapshot(
      query(collection(db, 'users', user.uid, 'training'), where('petId', '==', selectedPetId)),
      (snap) => setProgress(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as TrainingProgress[])
    );
    return () => unsub();
  }, [user, selectedPetId]);

  // ── Reset state when task or pet changes ─────────────────────────────────────

  useEffect(() => {
    setGuide(null);
    setGuideError(null);
    setVideoFeedback(null);
    setVideoPreview(null);
    stop();
  }, [activeTask, selectedPetId]);

  // ── Load cached guide from Firestore ─────────────────────────────────────────

  useEffect(() => {
    if (!activeTask || !selectedPetId || !user) return;

    const loadCachedGuide = async () => {
      const cacheRef = doc(db, 'users', user.uid, 'training_guides', `${activeTask.id}_${selectedPetId}`);
      const snap = await getDoc(cacheRef);
      if (snap.exists()) {
        setGuide(snap.data().content);
      }
    };

    loadCachedGuide();
  }, [activeTask, selectedPetId, user]);

  // ── Generate written guide ────────────────────────────────────────────────────

  const handleGenerateGuide = async () => {
    if (!activeTask || !selectedPetId || !user) return;
    const pet = pets.find((p) => p.id === selectedPetId);
    if (!pet) return;

    setIsGeneratingGuide(true);
    setGuideError(null);

    const prompt = `Create a comprehensive, detailed, and warm training guide for teaching "${activeTask.title}" to ${pet.name}, a ${pet.age} year old ${pet.breed} ${pet.species}.

Structure the guide with these exact sections using markdown:

## 🐾 Overview
Brief intro personalized to ${pet.name}'s breed and age.

## 🎯 What You'll Need
A short bulleted list of supplies.

## 📋 Step-by-Step Training
Numbered steps with clear, simple instructions. Each step should describe:
- What to do
- What ${pet.name} should do
- How to reward correctly

Include breed-specific tips for a ${pet.breed} where relevant.

## ⏱️ Training Schedule
How many minutes per day, how many sessions per week, and realistic timeline to see results for a ${pet.age} year old ${pet.breed}.

## 🚫 Common Mistakes to Avoid
3-5 specific mistakes owners make when teaching this command.

## 🌟 Pro Tips for ${pet.name}
2-3 personalized tips based on ${pet.breed} temperament and ${pet.age} year old energy levels.

## 📈 How to Know It's Working
Signs of progress to look for.

Make it warm, encouraging, and specific to ${pet.name}. Use ${pet.name}'s name throughout.`;

    try {
      const result = await getPetAdvice(prompt);
      const content = result.text || '';
      setGuide(content);

      // Cache it in Firestore so it persists between sessions
      const cacheRef = doc(db, 'users', user.uid, 'training_guides', `${activeTask.id}_${selectedPetId}`);
      await setDoc(cacheRef, {
        taskId: activeTask.id,
        petId: selectedPetId,
        content,
        generatedAt: Date.now(),
      });
    } catch (err) {
      console.error('Guide generation error:', err);
      setGuideError('Failed to generate guide. Please try again.');
    } finally {
      setIsGeneratingGuide(false);
    }
  };

  // ── Download guide as text file ───────────────────────────────────────────────

  const handleDownloadGuide = () => {
    if (!guide || !activeTask) return;
    const pet = pets.find((p) => p.id === selectedPetId);
    const blob = new Blob([guide], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pet?.name || 'pet'}_${activeTask.title.replace(/\s+/g, '_')}_training_guide.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Video upload + AI analysis ────────────────────────────────────────────────

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeTask) return;

    const pet = pets.find((p) => p.id === selectedPetId);
    setIsAnalyzingVideo(true);
    setVideoFeedback(null);

    // Show preview
    const previewUrl = URL.createObjectURL(file);
    setVideoPreview(previewUrl);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = (reader.result as string).split(',')[1];
      try {
        const prompt = `Analyze this video of ${pet?.name || 'this pet'} (a ${pet?.breed || 'dog'}) practicing the "${activeTask.title}" command.

Please evaluate:
1. Is the pet performing the command correctly?
2. Is the owner using correct positive reinforcement technique?
3. Body language and engagement level of the pet
4. Timing of rewards

Return your analysis in this exact JSON format:
{
  "score": <number 1-10>,
  "feedback": "<2-3 sentence overall assessment>",
  "tips": ["<specific tip 1>", "<specific tip 2>", "<specific tip 3>"]
}`;

        const result = await getPetAdvice(prompt, undefined, [{ mimeType: file.type, data: base64Data }]);
        const text = result.text || '';

        // Extract JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          setVideoFeedback(parsed);
        } else {
          setVideoFeedback({
            score: 7,
            feedback: text,
            tips: ['Keep practicing consistently!', 'Use high-value treats for motivation.', 'Keep sessions short and positive.'],
          });
        }
      } catch (err) {
        console.error('Video analysis error:', err);
        setVideoFeedback({
          score: 0,
          feedback: 'Could not analyze the video. Please try a shorter clip.',
          tips: [],
        });
      } finally {
        setIsAnalyzingVideo(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ── Update progress ───────────────────────────────────────────────────────────

  const updateProgress = async (taskId: string, status: TrainingProgress['status']) => {
    if (!user || !selectedPetId) return;
    const existing = progress.find((p) => p.taskId === taskId);
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
    } catch (err) {
      console.error('Progress update error:', err);
    }
  };

  const getTaskStatus = (taskId: string) =>
    progress.find((p) => p.taskId === taskId)?.status || 'not_started';

  const selectedPet = pets.find((p) => p.id === selectedPetId);

  // ── Render: task list ─────────────────────────────────────────────────────────

  if (!activeTask) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-serif font-bold text-[#5A5A40]">Training Module</h2>
          <select
            value={selectedPetId}
            onChange={(e) => setSelectedPetId(e.target.value)}
            className="bg-white border-[#F0EBE6] rounded-full text-sm px-4 py-2 text-[#5A5A40] font-semibold"
          >
            {pets.map((pet) => (
              <option key={pet.id} value={pet.id}>{pet.name}</option>
            ))}
          </select>
        </div>

        {pets.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-[#F0EBE6]">
            <p className="text-[#A19B95] font-bold">Add a pet profile first to get personalized training guides.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {STATIC_TASKS.map((task) => {
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
                      'text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full',
                      status === 'mastered' ? 'bg-emerald-100 text-emerald-700' :
                      status === 'in_progress' ? 'bg-orange-100 text-orange-700' :
                      'bg-[#F5F2ED] text-[#A19B95]'
                    )}>
                      {status.replace('_', ' ')}
                    </div>
                  </div>
                  <h4 className="text-xl font-serif font-bold text-[#5A5A40] mb-1">{task.title}</h4>
                  <p className="text-sm text-[#A19B95] line-clamp-2">{task.description}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className={cn(
                      'text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full',
                      task.difficulty === 'easy' ? 'bg-emerald-50 text-emerald-600' :
                      task.difficulty === 'medium' ? 'bg-orange-50 text-orange-600' :
                      'bg-red-50 text-red-600'
                    )}>
                      {task.difficulty}
                    </span>
                    <ChevronRight size={16} className="text-[#A19B95]" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Render: task detail ───────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-in slide-in-from-right duration-300 pb-20">
      {/* Hidden video input */}
      <input
        type="file"
        ref={videoInputRef}
        className="hidden"
        accept="video/*"
        onChange={handleVideoUpload}
      />

      {/* Back + header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => { setActiveTask(null); stop(); }}
          className="text-sm font-bold text-[#A19B95] hover:text-[#5A5A40] flex items-center gap-1 transition-colors"
        >
          ← Back to Library
        </button>
        <select
          value={selectedPetId}
          onChange={(e) => setSelectedPetId(e.target.value)}
          className="bg-white border-[#F0EBE6] rounded-full text-sm px-4 py-2 text-[#5A5A40] font-semibold"
        >
          {pets.map((pet) => (
            <option key={pet.id} value={pet.id}>{pet.name}</option>
          ))}
        </select>
      </div>

      {/* Task title card */}
      <div className="bg-white rounded-[32px] p-8 border border-[#F0EBE6] shadow-sm">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-3xl font-serif font-bold text-[#5A5A40]">{activeTask.title}</h3>
          <span className={cn(
            'text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full',
            activeTask.difficulty === 'easy' ? 'bg-emerald-100 text-emerald-700' :
            activeTask.difficulty === 'medium' ? 'bg-orange-100 text-orange-700' :
            'bg-red-100 text-red-700'
          )}>
            {activeTask.difficulty}
          </span>
        </div>
        <p className="text-[#7C7670]">{activeTask.description}</p>
        {selectedPet && (
          <p className="text-sm text-[#A19B95] mt-2">
            Personalized for <span className="font-bold text-[#5A5A40]">{selectedPet.name}</span> — {selectedPet.age} year old {selectedPet.breed}
          </p>
        )}
      </div>

      {/* Progress tracker */}
      <div className="grid grid-cols-3 gap-3">
        {(['not_started', 'in_progress', 'mastered'] as const).map((status) => (
          <button
            key={status}
            onClick={() => updateProgress(activeTask.id, status)}
            className={cn(
              'p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2',
              getTaskStatus(activeTask.id) === status
                ? 'border-[#5A5A40] bg-[#5A5A40] text-white'
                : 'border-[#F0EBE6] bg-white text-[#A19B95] hover:border-[#5A5A40]/30'
            )}
          >
            {status === 'mastered' ? <CheckCircle size={20} /> :
             status === 'in_progress' ? <Clock size={20} /> :
             <BookOpen size={20} />}
            <span className="text-[10px] font-bold uppercase tracking-widest">
              {status.replace('_', ' ')}
            </span>
          </button>
        ))}
      </div>

      {/* Training Guide section */}
      <div className="bg-white rounded-[32px] border border-[#F0EBE6] overflow-hidden">
        <div className="p-6 border-b border-[#F0EBE6] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F5F2ED] rounded-xl flex items-center justify-center text-[#5A5A40]">
              <FileText size={20} />
            </div>
            <div>
              <h4 className="font-bold text-[#5A5A40]">AI Training Guide</h4>
              <p className="text-xs text-[#A19B95]">Personalized for {selectedPet?.name || 'your pet'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {guide && (
              <>
                {/* Audio toggle */}
                <button
                  onClick={() => isSpeaking ? stop() : speak(guide)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border',
                    isSpeaking
                      ? 'bg-[#5A5A40] text-white border-[#5A5A40]'
                      : 'bg-white text-[#5A5A40] border-[#F0EBE6] hover:border-[#5A5A40]'
                  )}
                  title={isSpeaking ? 'Stop reading' : 'Listen to guide'}
                >
                  {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  {isSpeaking ? 'Stop' : 'Listen'}
                </button>

                {/* Download */}
                <button
                  onClick={handleDownloadGuide}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white text-[#5A5A40] border border-[#F0EBE6] hover:border-[#5A5A40] transition-all"
                  title="Download guide"
                >
                  <Download size={14} />
                  Download
                </button>
              </>
            )}

            {/* Generate / Regenerate button */}
            <button
              onClick={handleGenerateGuide}
              disabled={isGeneratingGuide}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#5A5A40] text-white hover:bg-[#4a4a34] transition-all disabled:opacity-50"
            >
              {isGeneratingGuide ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {guide ? 'Regenerate' : 'Generate Guide'}
            </button>
          </div>
        </div>

        <div className="p-6">
          {isGeneratingGuide ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
              <div className="w-16 h-16 bg-[#F5F2ED] rounded-2xl flex items-center justify-center text-[#5A5A40] animate-pulse">
                <Sparkles size={32} />
              </div>
              <p className="font-serif font-bold text-[#5A5A40] text-lg">
                Creating your personalized guide...
              </p>
              <p className="text-sm text-[#A19B95]">
                Tailoring advice for {selectedPet?.name} ({selectedPet?.breed})
              </p>
            </div>
          ) : guideError ? (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm">
              <AlertCircle size={18} />
              {guideError}
            </div>
          ) : guide ? (
            <div className="prose prose-sm max-w-none text-[#5A5A40] prose-headings:font-serif prose-headings:text-[#5A5A40] prose-p:text-[#7C7670] prose-li:text-[#7C7670] prose-strong:text-[#5A5A40]">
              <ReactMarkdown>{guide}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-center py-12 text-[#A19B95]">
              <FileText size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-bold">No guide yet</p>
              <p className="text-xs mt-1">Click "Generate Guide" for a personalized training plan for {selectedPet?.name || 'your pet'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Practice video upload + analysis */}
      <div className="bg-white rounded-[32px] border border-[#F0EBE6] overflow-hidden">
        <div className="p-6 border-b border-[#F0EBE6] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F5F2ED] rounded-xl flex items-center justify-center text-[#5A5A40]">
              <Video size={20} />
            </div>
            <div>
              <h4 className="font-bold text-[#5A5A40]">Practice Video Analysis</h4>
              <p className="text-xs text-[#A19B95]">Upload a clip and get AI feedback on your technique</p>
            </div>
          </div>
          <button
            onClick={() => videoInputRef.current?.click()}
            disabled={isAnalyzingVideo}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#5A5A40] text-white hover:bg-[#4a4a34] transition-all disabled:opacity-50"
          >
            {isAnalyzingVideo ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Upload size={14} />
            )}
            {isAnalyzingVideo ? 'Analyzing...' : 'Upload Video'}
          </button>
        </div>

        <div className="p-6">
          {isAnalyzingVideo ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3 text-center">
              <Loader2 size={32} className="animate-spin text-[#5A5A40]" />
              <p className="font-bold text-[#5A5A40]">Analyzing your training session...</p>
              <p className="text-xs text-[#A19B95]">This takes about 15-30 seconds</p>
            </div>
          ) : videoFeedback ? (
            <div className="space-y-6">
              {videoPreview && (
                <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
                  <video src={videoPreview} controls className="w-full h-full object-contain" />
                  <button
                    onClick={() => { setVideoPreview(null); setVideoFeedback(null); }}
                    className="absolute top-3 right-3 bg-black/60 text-white p-1.5 rounded-full hover:bg-black/80"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Score */}
              <div className="flex items-center gap-4 p-4 bg-[#F5F2ED] rounded-2xl">
                <div className="text-center">
                  <div className={cn(
                    'text-4xl font-black font-serif',
                    videoFeedback.score >= 8 ? 'text-emerald-600' :
                    videoFeedback.score >= 5 ? 'text-orange-500' : 'text-red-500'
                  )}>
                    {videoFeedback.score}/10
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">Score</div>
                </div>
                <p className="text-sm text-[#7C7670] leading-relaxed flex-1">{videoFeedback.feedback}</p>
              </div>

              {/* Tips */}
              {videoFeedback.tips.length > 0 && (
                <div className="space-y-3">
                  <h5 className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">AI Tips</h5>
                  {videoFeedback.tips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                      <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <p className="text-sm text-emerald-800">{tip}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-10 text-[#A19B95]">
              <Upload size={36} className="mx-auto mb-3 opacity-30" />
              <p className="font-bold text-sm">No video uploaded yet</p>
              <p className="text-xs mt-1">Record {selectedPet?.name || 'your pet'} practicing this command and upload for AI feedback</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}