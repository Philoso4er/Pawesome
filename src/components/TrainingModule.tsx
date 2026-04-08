import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle, Clock, BookOpen, ChevronRight, Star,
  Video, Loader2, Sparkles, AlertCircle, Upload,
  Volume2, VolumeX, Printer, X, FileText, RefreshCw,
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

// ── Text to Speech ─────────────────────────────────────────────────────────────
function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[#*`]/g, '').replace(/\n+/g, ' '));
    utterance.rate = 0.9;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };
  const stop = () => { window.speechSynthesis?.cancel(); setIsSpeaking(false); };
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);
  return { isSpeaking, speak, stop };
}

// ── Rich PDF Print ─────────────────────────────────────────────────────────────
function printRichGuide(guide: string, taskTitle: string, pet: Pet) {
  const sectionColors = ['#FFF8F0', '#F0F8FF', '#F0FFF4', '#FFF0F8', '#FFFBF0', '#F5F0FF', '#F0FFFF'];
  const sections = guide.split(/\n## /).filter(Boolean);

  const htmlSections = sections.map((section, i) => {
    const lines = section.split('\n');
    const rawHeading = lines[0].replace(/^#+\s*/, '');
    const emoji = rawHeading.match(/[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{26FF}]/u)?.[0] || '•';
    const heading = rawHeading.replace(/[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{26FF}]/gu, '').trim();
    const body = lines.slice(1).join('\n')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^-\s+(.+)$/gm, '<li style="margin:5px 0;color:#444;">$1</li>')
      .replace(/^(\d+)\.\s+(.+)$/gm, '<li style="margin:8px 0;" value="$1"><strong style="color:#5A5A40;">Step $1:</strong> $2</li>')
      .replace(/(<li[^>]*>.*<\/li>\n?)+/gs, (m) =>
        m.includes('value=')
          ? `<ol style="padding-left:18px;margin:10px 0;">${m}</ol>`
          : `<ul style="padding-left:18px;margin:10px 0;">${m}</ul>`
      )
      .replace(/\n\n+/g, '</p><p style="margin:8px 0;line-height:1.7;color:#555;">')
      .replace(/\n/g, '<br/>');

    return `
      <div style="background:${sectionColors[i % sectionColors.length]};border-radius:14px;padding:22px 26px;margin-bottom:18px;border-left:5px solid #5A5A40;page-break-inside:avoid;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <span style="font-size:26px;">${emoji}</span>
          <h3 style="margin:0;color:#5A5A40;font-size:17px;font-family:Georgia,serif;font-weight:700;">${heading}</h3>
        </div>
        <div style="font-size:13.5px;line-height:1.7;color:#444;">
          <p style="margin:6px 0;line-height:1.7;color:#555;">${body}</p>
        </div>
      </div>`;
  }).join('');

  const tips = [
    'Use high-value treats your pet does not get any other time',
    'Keep sessions to 5-10 minutes max to maintain focus',
    'Always end on a success — even a simple one',
    'Practice in different locations once basics are solid',
    `Be patient — ${pet.name} is learning a new language!`,
  ];
  const tipEmojis = ['🍖', '⏰', '🎉', '🔄', '💙'];

  const printWindow = window.open('', '_blank');
  if (!printWindow) { alert('Please allow popups to open the PDF preview.'); return; }

  printWindow.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"/>
<title>${pet.name} — ${taskTitle} Training Guide</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#333;}
  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .no-print{display:none!important;}
  }
  .print-btn{position:fixed;top:20px;right:20px;background:#5A5A40;color:#fff;border:none;padding:12px 28px;border-radius:50px;font-size:15px;font-weight:700;cursor:pointer;z-index:999;box-shadow:0 4px 20px rgba(0,0,0,0.2);}
  .print-btn:hover{background:#4a4a34;}
</style>
</head><body>
<button class="print-btn no-print" onclick="window.print()">🖨️ Save as PDF / Print</button>

<!-- Cover -->
<div style="background:linear-gradient(135deg,#5A5A40 0%,#8B8B6B 60%,#B5A98A 100%);min-height:260px;padding:50px 60px 40px;color:#fff;position:relative;overflow:hidden;">
  <div style="position:absolute;right:40px;top:20px;font-size:90px;opacity:0.12;">🐾</div>
  <div style="position:absolute;right:160px;bottom:10px;font-size:55px;opacity:0.08;">🐾</div>
  <div style="position:relative;z-index:1;">
    <div style="display:inline-block;background:rgba(255,255,255,0.18);padding:5px 16px;border-radius:50px;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin-bottom:14px;">
      Pawesome AI · Personalized Training Guide
    </div>
    <h1 style="font-family:Georgia,serif;font-size:46px;font-weight:900;margin-bottom:8px;line-height:1.1;text-shadow:0 2px 8px rgba(0,0,0,0.2);">${taskTitle}</h1>
    <p style="font-size:17px;opacity:0.85;margin-bottom:18px;">Personalized for <strong>${pet.name}</strong></p>
    <div style="display:flex;gap:12px;flex-wrap:wrap;">
      <span style="background:rgba(255,255,255,0.2);padding:7px 16px;border-radius:50px;font-size:12px;font-weight:600;">🐕 ${pet.breed}</span>
      <span style="background:rgba(255,255,255,0.2);padding:7px 16px;border-radius:50px;font-size:12px;font-weight:600;">📅 ${pet.age} years old</span>
      <span style="background:rgba(255,255,255,0.2);padding:7px 16px;border-radius:50px;font-size:12px;font-weight:600;">🐾 ${pet.species}</span>
    </div>
  </div>
</div>

<!-- Intro bar -->
<div style="background:#F5F2ED;padding:14px 60px;border-bottom:1px solid #E8E4DF;">
  <p style="color:#7C7670;font-size:12.5px;line-height:1.6;">
    Generated by <strong style="color:#5A5A40;">Pawesome AI</strong> for ${pet.name} — a ${pet.age}-year-old ${pet.breed}. Uses positive reinforcement techniques tailored to breed temperament. Always consult your veterinarian for health concerns.
  </p>
</div>

<!-- Body -->
<div style="display:flex;gap:28px;padding:36px 60px;max-width:1100px;margin:0 auto;">
  <div style="flex:1;min-width:0;">${htmlSections}</div>

  <!-- Sidebar -->
  <div style="width:230px;flex-shrink:0;">
    <div style="background:#5A5A40;color:#fff;border-radius:14px;padding:18px;position:sticky;top:20px;">
      <h3 style="font-family:Georgia,serif;font-size:15px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.2);">🌟 Universal Tips</h3>
      ${tips.map((tip, i) => `
        <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;padding:8px;background:rgba(255,255,255,0.08);border-radius:8px;">
          <span style="font-size:17px;flex-shrink:0;">${tipEmojis[i]}</span>
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.85);line-height:1.5;">${tip}</p>
        </div>`).join('')}
    </div>
    <div style="background:#F5F2ED;border-radius:14px;padding:18px;margin-top:18px;border:2px dashed #C8C4BE;">
      <h3 style="font-family:Georgia,serif;font-size:14px;color:#5A5A40;margin-bottom:12px;">📊 Progress Tracker</h3>
      ${['Week 1', 'Week 2', 'Week 3', 'Week 4'].map(w => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:9px;">
          <div style="width:16px;height:16px;border:2px solid #5A5A40;border-radius:3px;flex-shrink:0;"></div>
          <span style="font-size:12px;color:#7C7670;">${w}</span>
        </div>`).join('')}
      <p style="font-size:10px;color:#A19B95;margin-top:8px;">Print and tick off each week</p>
    </div>
  </div>
</div>

<!-- Footer -->
<div style="background:#5A5A40;color:rgba(255,255,255,0.65);text-align:center;padding:18px;font-size:11px;margin-top:20px;">
  🐾 Generated by Pawesome AI · For informational purposes only · Always consult your vet for health concerns
</div>
</body></html>`);

  printWindow.document.close();
  printWindow.focus();
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function TrainingModule() {
  const { user } = useFirebase();
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState('');
  const [progress, setProgress] = useState<TrainingProgress[]>([]);
  const [activeTask, setActiveTask] = useState<TrainingTask | null>(null);
  const [guide, setGuide] = useState<string | null>(null);
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);
  const [guideError, setGuideError] = useState<string | null>(null);
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);
  const [videoFeedback, setVideoFeedback] = useState<{ score: number; feedback: string; tips: string[] } | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const { isSpeaking, speak, stop } = useTextToSpeech();

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(query(collection(db, 'users', user.uid, 'pets')), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Pet[];
      setPets(list);
      if (list.length > 0 && !selectedPetId) setSelectedPetId(list[0].id);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user || !selectedPetId) return;
    const unsub = onSnapshot(
      query(collection(db, 'users', user.uid, 'training'), where('petId', '==', selectedPetId)),
      (snap) => setProgress(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as TrainingProgress[])
    );
    return () => unsub();
  }, [user, selectedPetId]);

  useEffect(() => {
    setGuide(null); setGuideError(null); setVideoFeedback(null); setVideoPreview(null); stop();
    if (!activeTask || !selectedPetId || !user) return;
    const loadCache = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid, 'training_guides', `${activeTask.id}_${selectedPetId}`));
        if (snap.exists()) setGuide(snap.data().content);
      } catch { /* no cache yet */ }
    };
    loadCache();
  }, [activeTask?.id, selectedPetId]);

  const handleGenerateGuide = async () => {
    if (!activeTask || !selectedPetId || !user) return;
    const pet = pets.find((p) => p.id === selectedPetId);
    if (!pet) return;
    setIsGeneratingGuide(true);
    setGuideError(null);
    try {
      const result = await getPetAdvice(
        `Create a comprehensive training guide for teaching "${activeTask.title}" to ${pet.name}, a ${pet.age} year old ${pet.breed} ${pet.species}.\n\nUse these exact markdown section headings:\n## 🐾 Overview\n## 🎯 What You'll Need\n## 📋 Step-by-Step Training\n## ⏱️ Training Schedule\n## 🚫 Common Mistakes to Avoid\n## 🌟 Pro Tips for ${pet.name}\n## 📈 How to Know It's Working\n\nMake it warm, detailed, breed-specific, and use ${pet.name}'s name throughout.`
      );
      const content = result.text;
      if (!content) throw new Error('Empty response from AI');
      setGuide(content);
      await setDoc(doc(db, 'users', user.uid, 'training_guides', `${activeTask.id}_${selectedPetId}`), {
        taskId: activeTask.id, petId: selectedPetId, content, generatedAt: Date.now(),
      });
    } catch (err: any) {
      setGuideError(`Failed to generate guide: ${err?.message || 'Unknown error'}. Please try again.`);
    } finally {
      setIsGeneratingGuide(false);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeTask) return;
    const pet = pets.find((p) => p.id === selectedPetId);
    setIsAnalyzingVideo(true);
    setVideoFeedback(null);
    setVideoPreview(URL.createObjectURL(file));
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = (reader.result as string).split(',')[1];
      try {
        const result = await getPetAdvice(
          `Analyze this training video of ${pet?.name || 'this pet'} (${pet?.breed || 'dog'}) practicing "${activeTask.title}". Evaluate technique and return JSON: {"score":<1-10>,"feedback":"<2-3 sentences>","tips":["tip1","tip2","tip3"]}`,
          undefined,
          [{ mimeType: file.type, data: base64Data }]
        );
        const jsonMatch = (result.text || '').match(/\{[\s\S]*\}/);
        setVideoFeedback(jsonMatch ? JSON.parse(jsonMatch[0]) : { score: 7, feedback: result.text || '', tips: [] });
      } catch {
        setVideoFeedback({ score: 0, feedback: 'Could not analyze. Try a shorter clip under 30 seconds.', tips: [] });
      } finally { setIsAnalyzingVideo(false); }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const updateProgress = async (taskId: string, status: TrainingProgress['status']) => {
    if (!user || !selectedPetId) return;
    const existing = progress.find((p) => p.taskId === taskId);
    if (existing) {
      await updateDoc(doc(db, 'users', user.uid, 'training', existing.id), { status, lastPracticed: serverTimestamp() });
    } else {
      await addDoc(collection(db, 'users', user.uid, 'training'), { petId: selectedPetId, taskId, status, lastPracticed: serverTimestamp() });
    }
  };

  const getTaskStatus = (taskId: string) => progress.find((p) => p.taskId === taskId)?.status || 'not_started';
  const selectedPet = pets.find((p) => p.id === selectedPetId);

  if (!activeTask) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-serif font-bold text-[#5A5A40]">Training Module</h2>
          <select value={selectedPetId} onChange={(e) => setSelectedPetId(e.target.value)} className="bg-white border-[#F0EBE6] rounded-full text-sm px-4 py-2 text-[#5A5A40] font-semibold">
            {pets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                <div key={task.id} onClick={() => setActiveTask(task)} className="p-6 bg-white rounded-[32px] border border-[#F0EBE6] hover:shadow-lg transition-all cursor-pointer group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-[#F5F2ED] rounded-2xl flex items-center justify-center text-[#5A5A40] group-hover:scale-110 transition-transform"><Star size={24} /></div>
                    <div className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full',
                      status === 'mastered' ? 'bg-emerald-100 text-emerald-700' :
                      status === 'in_progress' ? 'bg-orange-100 text-orange-700' : 'bg-[#F5F2ED] text-[#A19B95]'
                    )}>{status.replace('_', ' ')}</div>
                  </div>
                  <h4 className="text-xl font-serif font-bold text-[#5A5A40] mb-1">{task.title}</h4>
                  <p className="text-sm text-[#A19B95] line-clamp-2">{task.description}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full',
                      task.difficulty === 'easy' ? 'bg-emerald-50 text-emerald-600' :
                      task.difficulty === 'medium' ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-600'
                    )}>{task.difficulty}</span>
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

  return (
    <div className="space-y-6 animate-in slide-in-from-right duration-300 pb-20">
      <input type="file" ref={videoInputRef} className="hidden" accept="video/*" onChange={handleVideoUpload} />

      <div className="flex items-center justify-between">
        <button onClick={() => { setActiveTask(null); stop(); }} className="text-sm font-bold text-[#A19B95] hover:text-[#5A5A40] flex items-center gap-1">← Back to Library</button>
        <select value={selectedPetId} onChange={(e) => setSelectedPetId(e.target.value)} className="bg-white border-[#F0EBE6] rounded-full text-sm px-4 py-2 text-[#5A5A40] font-semibold">
          {pets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-[32px] p-8 border border-[#F0EBE6]">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-3xl font-serif font-bold text-[#5A5A40]">{activeTask.title}</h3>
          <span className={cn('text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full',
            activeTask.difficulty === 'easy' ? 'bg-emerald-100 text-emerald-700' :
            activeTask.difficulty === 'medium' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
          )}>{activeTask.difficulty}</span>
        </div>
        <p className="text-[#7C7670]">{activeTask.description}</p>
        {selectedPet && <p className="text-sm text-[#A19B95] mt-2">For <span className="font-bold text-[#5A5A40]">{selectedPet.name}</span> — {selectedPet.age} yr old {selectedPet.breed}</p>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(['not_started', 'in_progress', 'mastered'] as const).map((status) => (
          <button key={status} onClick={() => updateProgress(activeTask.id, status)}
            className={cn('p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2',
              getTaskStatus(activeTask.id) === status ? 'border-[#5A5A40] bg-[#5A5A40] text-white' : 'border-[#F0EBE6] bg-white text-[#A19B95] hover:border-[#5A5A40]/30'
            )}>
            {status === 'mastered' ? <CheckCircle size={20} /> : status === 'in_progress' ? <Clock size={20} /> : <BookOpen size={20} />}
            <span className="text-[10px] font-bold uppercase tracking-widest">{status.replace('_', ' ')}</span>
          </button>
        ))}
      </div>

      {/* Guide card */}
      <div className="bg-white rounded-[32px] border border-[#F0EBE6] overflow-hidden">
        <div className="p-6 border-b border-[#F0EBE6] flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F5F2ED] rounded-xl flex items-center justify-center text-[#5A5A40]"><FileText size={20} /></div>
            <div>
              <h4 className="font-bold text-[#5A5A40]">AI Training Guide</h4>
              <p className="text-xs text-[#A19B95]">Personalized for {selectedPet?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {guide && (
              <>
                <button onClick={() => isSpeaking ? stop() : speak(guide)}
                  className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border',
                    isSpeaking ? 'bg-[#5A5A40] text-white border-[#5A5A40]' : 'bg-white text-[#5A5A40] border-[#F0EBE6] hover:border-[#5A5A40]'
                  )}>
                  {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  {isSpeaking ? 'Stop' : 'Listen'}
                </button>
                <button onClick={() => selectedPet && printRichGuide(guide, activeTask.title, selectedPet)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all">
                  <Printer size={14} /> Save as PDF
                </button>
              </>
            )}
            <button onClick={handleGenerateGuide} disabled={isGeneratingGuide}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#5A5A40] text-white hover:bg-[#4a4a34] disabled:opacity-50 transition-all">
              {isGeneratingGuide ? <Loader2 size={14} className="animate-spin" /> : guide ? <RefreshCw size={14} /> : <Sparkles size={14} />}
              {guide ? 'Regenerate' : 'Generate Guide'}
            </button>
          </div>
        </div>
        <div className="p-6">
          {isGeneratingGuide ? (
            <div className="flex flex-col items-center py-16 gap-4 text-center">
              <div className="w-16 h-16 bg-[#F5F2ED] rounded-2xl flex items-center justify-center animate-pulse"><Sparkles size={32} className="text-[#5A5A40]" /></div>
              <p className="font-serif font-bold text-[#5A5A40] text-lg">Creating personalized guide for {selectedPet?.name}...</p>
            </div>
          ) : guideError ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm"><AlertCircle size={18} />{guideError}</div>
              <button onClick={handleGenerateGuide} className="flex items-center gap-2 text-sm font-bold text-[#5A5A40] hover:underline"><RefreshCw size={14} /> Try again</button>
            </div>
          ) : guide ? (
            <div>
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700 font-semibold flex items-center gap-2">
                <Printer size={14} /> Click <strong>"Save as PDF"</strong> above for a beautiful full-colour printable version with personalized sections and illustrations 🎨
              </div>
              <div className="prose prose-sm max-w-none prose-headings:font-serif prose-headings:text-[#5A5A40] prose-p:text-[#7C7670] prose-li:text-[#7C7670] prose-strong:text-[#5A5A40]">
                <ReactMarkdown>{guide}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-[#A19B95]">
              <FileText size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-bold">No guide yet</p>
              <p className="text-xs mt-1">Click "Generate Guide" for a personalized training plan</p>
              <p className="text-xs mt-2 text-emerald-600 font-semibold">✨ Saves as a beautiful full-colour PDF</p>
            </div>
          )}
        </div>
      </div>

      {/* Video card */}
      <div className="bg-white rounded-[32px] border border-[#F0EBE6] overflow-hidden">
        <div className="p-6 border-b border-[#F0EBE6] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F5F2ED] rounded-xl flex items-center justify-center text-[#5A5A40]"><Video size={20} /></div>
            <div>
              <h4 className="font-bold text-[#5A5A40]">Practice Video Analysis</h4>
              <p className="text-xs text-[#A19B95]">Upload a clip for AI feedback</p>
            </div>
          </div>
          <button onClick={() => videoInputRef.current?.click()} disabled={isAnalyzingVideo}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#5A5A40] text-white hover:bg-[#4a4a34] disabled:opacity-50 transition-all">
            {isAnalyzingVideo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {isAnalyzingVideo ? 'Analyzing...' : 'Upload Video'}
          </button>
        </div>
        <div className="p-6">
          {isAnalyzingVideo ? (
            <div className="flex flex-col items-center py-12 gap-3 text-center">
              <Loader2 size={32} className="animate-spin text-[#5A5A40]" />
              <p className="font-bold text-[#5A5A40]">Analyzing training session...</p>
              <p className="text-xs text-[#A19B95]">15–30 seconds</p>
            </div>
          ) : videoFeedback ? (
            <div className="space-y-6">
              {videoPreview && (
                <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
                  <video src={videoPreview} controls className="w-full h-full object-contain" />
                  <button onClick={() => { setVideoPreview(null); setVideoFeedback(null); }} className="absolute top-3 right-3 bg-black/60 text-white p-1.5 rounded-full"><X size={14} /></button>
                </div>
              )}
              <div className="flex items-center gap-4 p-4 bg-[#F5F2ED] rounded-2xl">
                <div className="text-center">
                  <div className={cn('text-4xl font-black font-serif', videoFeedback.score >= 8 ? 'text-emerald-600' : videoFeedback.score >= 5 ? 'text-orange-500' : 'text-red-500')}>
                    {videoFeedback.score}/10
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">Score</div>
                </div>
                <p className="text-sm text-[#7C7670] leading-relaxed flex-1">{videoFeedback.feedback}</p>
              </div>
              {videoFeedback.tips.length > 0 && (
                <div className="space-y-3">
                  <h5 className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">AI Tips</h5>
                  {videoFeedback.tips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                      <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5">{i + 1}</div>
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
              <p className="text-xs mt-1">Record {selectedPet?.name || 'your pet'} practicing and upload for AI feedback</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
