import React, { useState, useEffect } from 'react';
import {
  HelpCircle, MessageSquare, ShieldCheck, UserCheck, Loader2,
  Send, CheckCircle2, Bot, User, ArrowRight, X, AlertTriangle,
} from 'lucide-react';
import { db } from '../firebase';
import {
  collection, addDoc, onSnapshot, query, orderBy, limit,
  updateDoc, doc, serverTimestamp, where,
} from 'firebase/firestore';
import { useFirebase } from '../FirebaseProvider';
import { ExpertQuestion, Pet } from '../types';
import { answerExpertQuestion } from '../services/gemini';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export default function ExpertQA() {
  const { user, isAdmin, loading: authLoading } = useFirebase();
  const [questions, setQuestions] = useState<ExpertQuestion[]>([]);
  const [adminQuestions, setAdminQuestions] = useState<ExpertQuestion[]>([]);
  const [viewMode, setViewMode] = useState<'user' | 'admin'>('user');
  const [pets, setPets] = useState<Pet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAsking, setIsAsking] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<ExpertQuestion | null>(null);
  const [expertResponse, setExpertResponse] = useState('');
  const [isSubmittingExpert, setIsSubmittingExpert] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newQuestion, setNewQuestion] = useState({ question: '', petId: '' });

  useEffect(() => {
    if (authLoading || !user) return;

    const petsUnsub = onSnapshot(
      query(collection(db, 'users', user.uid, 'pets')),
      (snap) => setPets(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Pet[]),
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/pets`)
    );

    const questionsQuery = query(
      collection(db, 'expert_questions'),
      where('authorId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const questionsUnsub = onSnapshot(
      questionsQuery,
      (snap) => {
        setQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ExpertQuestion[]);
        setIsLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'expert_questions')
    );

    return () => { petsUnsub(); questionsUnsub(); };
  }, [authLoading, user]);

  useEffect(() => {
    if (!isAdmin || !user) return;
    const adminUnsub = onSnapshot(
      query(collection(db, 'expert_questions'), where('status', '==', 'escalated'), orderBy('createdAt', 'desc')),
      (snap) => setAdminQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ExpertQuestion[]),
      (err) => handleFirestoreError(err, OperationType.LIST, 'expert_questions (admin)')
    );
    return () => adminUnsub();
  }, [isAdmin, user]);

  const handleAskQuestion = async () => {
    if (!user || !newQuestion.question.trim()) return;
    setIsAnswering(true);
    setError(null);

    const selectedPet = pets.find((p) => p.id === newQuestion.petId);
    const petContext = selectedPet
      ? `${selectedPet.name} is a ${selectedPet.age} year old ${selectedPet.breed} ${selectedPet.species}.`
      : '';

    try {
      // Save question first
      const questionDoc = await addDoc(collection(db, 'expert_questions'), {
        authorId: user.uid,
        authorName: user.displayName || 'Pet Owner',
        petId: newQuestion.petId || null,
        petName: selectedPet?.name || null,
        question: newQuestion.question,
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      // Get AI answer — FIX: was not awaiting correctly and error was swallowed
      const aiResponse = await answerExpertQuestion(newQuestion.question, petContext);

      if (!aiResponse) throw new Error('No response from AI');

      await updateDoc(doc(db, 'expert_questions', questionDoc.id), {
        aiAnswer: aiResponse,
        status: 'answered',
      });

      setNewQuestion({ question: '', petId: '' });
      setIsAsking(false);
    } catch (err: any) {
      console.error('Expert Q&A error:', err);
      setError('Failed to get an answer. Please try again.');
    } finally {
      setIsAnswering(false);
    }
  };

  const handleEscalate = async (questionId: string) => {
    try {
      await updateDoc(doc(db, 'expert_questions', questionId), { status: 'escalated' });
      alert('Your question has been escalated to our human veterinary specialists.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `expert_questions/${questionId}`);
    }
  };

  const handleAnswerAsExpert = async () => {
    if (!selectedQuestion || !expertResponse.trim() || !user) return;
    setIsSubmittingExpert(true);
    try {
      await updateDoc(doc(db, 'expert_questions', selectedQuestion.id), {
        expertAnswer: expertResponse,
        expertName: user.displayName || 'Human Specialist',
        status: 'answered',
      });
      setExpertResponse('');
      setSelectedQuestion(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `expert_questions/${selectedQuestion.id}`);
    } finally {
      setIsSubmittingExpert(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Admin toggle */}
      {isAdmin && (
        <div className="flex justify-center">
          <div className="bg-[#151619] p-1 rounded-2xl flex gap-1">
            {(['user', 'admin'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  'px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all',
                  viewMode === mode ? 'bg-white text-[#151619]' : 'text-[#8E9299] hover:text-white'
                )}
              >
                {mode === 'user' ? 'User View' : 'Specialist Dashboard'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="bg-[#151619] rounded-[40px] p-12 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10 space-y-6 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full border border-white/20 text-xs font-bold uppercase tracking-widest text-[#8E9299]">
            <ShieldCheck size={16} className="text-emerald-400" />
            Verified Expert Network
          </div>
          <h1 className="text-6xl font-serif font-black leading-none tracking-tighter">
            Expert Q&A<br />
            <span className="text-[#8E9299]">Support System</span>
          </h1>
          <p className="text-lg text-[#8E9299] leading-relaxed">
            Get professional advice from Pawesome AI or escalate complex cases to our network of human veterinary specialists.
          </p>
          <button
            onClick={() => setIsAsking(true)}
            className="bg-white text-[#151619] px-10 py-4 rounded-2xl font-black text-lg hover:scale-105 transition-transform shadow-xl flex items-center gap-3"
          >
            Ask a Question <ArrowRight size={20} />
          </button>
        </div>
      </div>

      {/* Ask modal */}
      {isAsking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-[#151619] border border-white/10 rounded-[48px] w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="p-10 space-y-8">
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-serif font-bold text-white">Ask the Experts</h2>
                <button onClick={() => { setIsAsking(false); setError(null); }} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X size={24} className="text-[#8E9299]" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">Select Pet (Optional)</label>
                  <select
                    value={newQuestion.petId}
                    onChange={(e) => setNewQuestion({ ...newQuestion, petId: e.target.value })}
                    className="w-full bg-[#1C1D21] border-white/10 rounded-2xl text-white text-sm py-4 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    <option value="">General Question</option>
                    {pets.map((pet) => (
                      <option key={pet.id} value={pet.id}>{pet.name} ({pet.breed})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">Your Question</label>
                  <textarea
                    placeholder="Describe your concern in detail..."
                    value={newQuestion.question}
                    onChange={(e) => setNewQuestion({ ...newQuestion, question: e.target.value })}
                    className="w-full min-h-[200px] bg-[#1C1D21] border-white/10 rounded-2xl text-white text-sm py-4 px-4 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm">
                    <AlertTriangle size={18} />
                    {error}
                  </div>
                )}
              </div>

              <button
                onClick={handleAskQuestion}
                disabled={isAnswering || !newQuestion.question.trim()}
                className="w-full bg-emerald-500 text-white py-5 rounded-2xl font-black text-xl shadow-xl hover:bg-emerald-400 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {isAnswering ? (
                  <>
                    <Loader2 className="animate-spin" size={24} />
                    Consulting AI Expert...
                  </>
                ) : (
                  <>
                    <Send size={24} />
                    Submit Question
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Questions list */}
      <div className="space-y-6">
        <h3 className="text-2xl font-serif font-bold text-[#5A5A40] border-b border-[#F0EBE6] pb-4 flex items-center gap-3">
          <MessageSquare size={24} />
          {viewMode === 'admin' ? 'Escalated Consultations' : 'Your Consultations'}
        </h3>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-[#5A5A40]" size={40} />
          </div>
        ) : (viewMode === 'admin' ? adminQuestions : questions).length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[40px] border border-dashed border-[#F0EBE6]">
            <HelpCircle size={48} className="mx-auto text-[#A19B95] mb-4" />
            <p className="text-[#A19B95] font-bold uppercase tracking-widest text-sm">No questions yet</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {(viewMode === 'admin' ? adminQuestions : questions).map((q) => (
              <div
                key={q.id}
                className="bg-white rounded-[40px] border border-[#F0EBE6] p-8 hover:shadow-xl transition-all duration-500 group cursor-pointer"
                onClick={() => setSelectedQuestion(q)}
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest',
                      q.status === 'answered' ? 'bg-emerald-100 text-emerald-700' :
                      q.status === 'escalated' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                    )}>
                      {q.status}
                    </div>
                    {q.petName && (
                      <div className="px-3 py-1 bg-[#F5F2ED] text-[#5A5A40] rounded-full text-[10px] font-bold uppercase tracking-widest">
                        {q.petName}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-[#A19B95] font-bold uppercase tracking-widest">
                    {q.createdAt?.seconds ? format(new Date(q.createdAt.seconds * 1000), 'MMM dd, yyyy') : 'Just now'}
                  </span>
                </div>

                <h4 className="text-xl font-bold text-[#5A5A40] mb-4 line-clamp-2 group-hover:text-[#8B8B6B] transition-colors">
                  {q.question}
                </h4>

                {q.aiAnswer && (
                  <div className="flex items-start gap-4 bg-[#FDFCFB] p-6 rounded-[32px] border border-[#F0EBE6]">
                    <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white flex-shrink-0">
                      <Bot size={18} />
                    </div>
                    <p className="text-sm text-[#7C7670] line-clamp-3 leading-relaxed">{q.aiAnswer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Question detail modal */}
      {selectedQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-white rounded-[48px] w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom-10 duration-500">
            <div className="flex-1 overflow-y-auto p-12 space-y-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest',
                    selectedQuestion.status === 'answered' ? 'bg-emerald-100 text-emerald-700' :
                    selectedQuestion.status === 'escalated' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                  )}>
                    {selectedQuestion.status}
                  </div>
                  {selectedQuestion.petName && (
                    <div className="px-4 py-1.5 bg-[#F5F2ED] text-[#5A5A40] rounded-full text-xs font-bold uppercase tracking-widest">
                      Pet: {selectedQuestion.petName}
                    </div>
                  )}
                </div>
                <button onClick={() => setSelectedQuestion(null)} className="p-3 hover:bg-[#F5F2ED] rounded-full transition-colors">
                  <X size={24} className="text-[#A19B95]" />
                </button>
              </div>

              <div className="flex gap-6">
                <div className="w-14 h-14 bg-[#F5F2ED] rounded-2xl flex items-center justify-center text-[#5A5A40] flex-shrink-0">
                  <User size={32} />
                </div>
                <div className="space-y-2">
                  <h5 className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">Your Question</h5>
                  <p className="text-2xl font-serif font-bold text-[#5A5A40] leading-tight">{selectedQuestion.question}</p>
                </div>
              </div>

              {selectedQuestion.aiAnswer && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-emerald-600">
                    <Bot size={20} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Pawesome AI Expert Response</span>
                  </div>
                  <div className="bg-emerald-50/50 border border-emerald-100 p-10 rounded-[40px] text-lg text-[#5A5A40] leading-relaxed whitespace-pre-wrap">
                    {selectedQuestion.aiAnswer}
                  </div>
                </div>
              )}

              {selectedQuestion.expertAnswer && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-blue-600">
                    <ShieldCheck size={20} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Human Specialist — {selectedQuestion.expertName}</span>
                  </div>
                  <div className="bg-blue-50/50 border border-blue-100 p-10 rounded-[40px] text-lg text-[#5A5A40] leading-relaxed whitespace-pre-wrap">
                    {selectedQuestion.expertAnswer}
                  </div>
                </div>
              )}

              {viewMode === 'admin' && selectedQuestion.status === 'escalated' && (
                <div className="space-y-4 pt-6 border-t border-[#F0EBE6]">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">Provide Specialist Answer</label>
                  <textarea
                    placeholder="Write your expert response here..."
                    value={expertResponse}
                    onChange={(e) => setExpertResponse(e.target.value)}
                    className="w-full min-h-[150px] bg-[#FDFCFB] border-[#F0EBE6] rounded-2xl text-[#5A5A40] text-sm py-4 px-4 resize-none"
                  />
                  <button
                    onClick={handleAnswerAsExpert}
                    disabled={isSubmittingExpert || !expertResponse.trim()}
                    className="w-full bg-[#151619] text-white py-4 rounded-2xl font-black text-lg shadow-xl hover:bg-black transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                  >
                    {isSubmittingExpert ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={24} />}
                    Submit Expert Response
                  </button>
                </div>
              )}

              {viewMode === 'user' && selectedQuestion.status === 'answered' && !selectedQuestion.expertAnswer && (
                <div className="flex items-center justify-between p-8 bg-[#151619] rounded-[32px] text-white">
                  <div className="space-y-1">
                    <h5 className="font-bold text-lg">Not satisfied with the AI answer?</h5>
                    <p className="text-sm text-[#8E9299]">Escalate to a human veterinary specialist.</p>
                  </div>
                  <button
                    onClick={() => handleEscalate(selectedQuestion.id)}
                    className="bg-white text-[#151619] px-6 py-3 rounded-xl font-black text-sm hover:scale-105 transition-transform"
                  >
                    Escalate to Human Expert
                  </button>
                </div>
              )}

              {selectedQuestion.status === 'escalated' && (
                <div className="flex items-center gap-4 p-8 bg-blue-50 border border-blue-100 rounded-[32px] text-blue-800">
                  <UserCheck size={32} />
                  <div>
                    <h5 className="font-bold">Escalated to Human Expert</h5>
                    <p className="text-sm opacity-80">A specialist is reviewing your case and will respond soon.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}