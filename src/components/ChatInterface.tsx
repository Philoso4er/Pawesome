import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Image as ImageIcon,
  Video as VideoIcon,
  Loader2,
  User,
  Bot,
  Mic,
  MicOff,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';
import { getPetAdvice, transcribeAudio } from '../services/gemini';
import { ChatMessage } from '../types';
import { db } from '../firebase';
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { useFirebase } from '../FirebaseProvider';

export default function ChatInterface() {
  const { user } = useFirebase();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [attachments, setAttachments] = useState<
    { file: File; type: 'image' | 'video'; preview: string }[]
  >([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ── FIX: The original useEffect had an empty body — messages never loaded.
  // This subscribes to Firestore in real-time and keeps the list in sync.
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'users', user.uid, 'chats'),
      orderBy('timestamp', 'asc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ChatMessage[];
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [user]);

  // Auto-scroll to latest message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // ── Voice recording ────────────────────────────────────────────────────────

  const toggleListening = async () => {
    if (isListening) {
      mediaRecorderRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: 'audio/webm',
        });
        setIsTranscribing(true);

        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          try {
            const transcription = await transcribeAudio(
              base64Data,
              'audio/webm'
            );
            if (transcription) {
              setInput((prev) =>
                prev ? `${prev} ${transcription}` : transcription
              );
            }
          } catch (error) {
            console.error('Transcription error:', error);
          } finally {
            setIsTranscribing(false);
          }
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  // ── File attachments ───────────────────────────────────────────────────────

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'image' | 'video'
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onloadend = () => {
      setAttachments((prev) => [
        ...prev,
        { file, type, preview: reader.result as string },
      ]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Send message ───────────────────────────────────────────────────────────

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading || !user)
      return;

    const currentAttachments = [...attachments];

    const userMsg: any = {
      userId: user.uid,
      role: 'user' as const,
      content: input,
      timestamp: Date.now(),
    };

    if (currentAttachments.length > 0) {
      userMsg.attachments = currentAttachments.map((a) => ({
        type: a.type,
        url: a.preview,
      }));
    }

    try {
      if (isListening) {
        mediaRecorderRef.current?.stop();
        setIsListening(false);
      }

      setInput('');
      setAttachments([]);

      await addDoc(collection(db, 'users', user.uid, 'chats'), userMsg);
      setIsLoading(true);

      const geminiAttachments = currentAttachments.map((a) => ({
        mimeType: a.file.type,
        data: a.preview.split(',')[1],
      }));

      const result = await getPetAdvice(
        input || 'Analyze this media',
        undefined,
        geminiAttachments.length > 0 ? geminiAttachments : undefined
      );

      const modelMsg = {
        userId: user.uid,
        role: 'model' as const,
        content: result.text || 'I am sorry, I could not process that request.',
        timestamp: Date.now(),
      };

      await addDoc(collection(db, 'users', user.uid, 'chats'), modelMsg);
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] bg-white rounded-3xl border border-[#F0EBE6] overflow-hidden shadow-sm">
      {/* Hidden file inputs */}
      <input
        type="file"
        ref={imageInputRef}
        className="hidden"
        accept="image/*"
        onChange={(e) => handleFileSelect(e, 'image')}
      />
      <input
        type="file"
        ref={videoInputRef}
        className="hidden"
        accept="video/*"
        onChange={(e) => handleFileSelect(e, 'video')}
      />

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-60">
            <div className="w-16 h-16 bg-[#F5F2ED] rounded-full flex items-center justify-center">
              <Bot size={32} className="text-[#5A5A40]" />
            </div>
            <div>
              <h3 className="text-lg font-serif font-semibold">
                How can I help your pet today?
              </h3>
              <p className="text-sm max-w-xs">
                Ask me about health, training, nutrition, or find local pet
                services.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex gap-4 max-w-[85%]',
              msg.role === 'user'
                ? 'ml-auto flex-row-reverse'
                : 'mr-auto'
            )}
          >
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                msg.role === 'user'
                  ? 'bg-[#5A5A40] text-white'
                  : 'bg-[#F5F2ED] text-[#5A5A40]'
              )}
            >
              {msg.role === 'user' ? (
                <User size={16} />
              ) : (
                <Bot size={16} />
              )}
            </div>

            <div
              className={cn(
                'space-y-2',
                msg.role === 'user' ? 'items-end' : 'items-start'
              )}
            >
              {/* Attachments */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {msg.attachments.map((att, i) => (
                    <div
                      key={i}
                      className="relative rounded-xl overflow-hidden border border-[#F0EBE6] max-w-[200px]"
                    >
                      {att.type === 'image' ? (
                        <img
                          src={att.url}
                          alt="Attachment"
                          className="w-full h-auto object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <video
                          src={att.url}
                          className="w-full h-auto"
                          controls
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Text bubble */}
              <div
                className={cn(
                  'p-4 rounded-2xl text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-[#5A5A40] text-white rounded-tr-none'
                    : 'bg-[#F5F2ED] text-[#1A1A1A] rounded-tl-none'
                )}
              >
                <div className="prose prose-sm max-w-none prose-p:leading-relaxed">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex gap-4 mr-auto">
            <div className="w-8 h-8 rounded-full bg-[#F5F2ED] flex items-center justify-center">
              <Loader2 size={16} className="animate-spin text-[#5A5A40]" />
            </div>
            <div className="bg-[#F5F2ED] p-4 rounded-2xl rounded-tl-none">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-[#5A5A40]/40 rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-[#5A5A40]/40 rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-1.5 h-1.5 bg-[#5A5A40]/40 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 flex gap-2 overflow-x-auto bg-[#FDFCFB] border-t border-[#F0EBE6]">
          {attachments.map((att, i) => (
            <div
              key={i}
              className="relative w-16 h-16 rounded-lg overflow-hidden border border-[#F0EBE6] flex-shrink-0"
            >
              {att.type === 'image' ? (
                <img
                  src={att.preview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full bg-black flex items-center justify-center">
                  <VideoIcon size={20} className="text-white" />
                </div>
              )}
              <button
                onClick={() => removeAttachment(i)}
                className="absolute top-0 right-0 bg-black/60 text-white p-0.5 rounded-bl-lg hover:bg-black/80 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="p-4 bg-[#FDFCFB] border-t border-[#F0EBE6]">
        <div className="relative flex items-center gap-2 bg-white border border-[#F0EBE6] rounded-2xl p-2 shadow-sm focus-within:border-[#5A5A40] transition-colors">
          <button
            onClick={() => imageInputRef.current?.click()}
            className="p-2 text-[#A19B95] hover:text-[#5A5A40] transition-colors"
            title="Attach image"
          >
            <ImageIcon size={20} />
          </button>
          <button
            onClick={() => videoInputRef.current?.click()}
            className="p-2 text-[#A19B95] hover:text-[#5A5A40] transition-colors"
            title="Attach video"
          >
            <VideoIcon size={20} />
          </button>
          <button
            onClick={toggleListening}
            disabled={isTranscribing}
            className={cn(
              'p-2 transition-colors',
              isListening
                ? 'text-red-500 animate-pulse'
                : 'text-[#A19B95] hover:text-[#5A5A40]',
              isTranscribing && 'opacity-50 cursor-not-allowed'
            )}
            title={isListening ? 'Stop recording' : 'Start voice input'}
          >
            {isTranscribing ? (
              <Loader2 size={20} className="animate-spin" />
            ) : isListening ? (
              <MicOff size={20} />
            ) : (
              <Mic size={20} />
            )}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask anything about your pet..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 outline-none"
          />

          <button
            onClick={handleSend}
            disabled={
              (!input.trim() && attachments.length === 0) || isLoading
            }
            className={cn(
              'p-2 rounded-xl transition-all',
              (input.trim() || attachments.length > 0) && !isLoading
                ? 'bg-[#5A5A40] text-white shadow-md'
                : 'bg-[#F5F2ED] text-[#A19B95]'
            )}
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
