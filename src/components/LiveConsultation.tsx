import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Loader2, Sparkles, MessageSquare } from 'lucide-react';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { cn } from '../lib/utils';
import { PET_EXPERT_INSTRUCTION } from '../services/gemini';

export default function LiveConsultation({ onEnd }: { onEnd: () => void }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [transcription, setTranscription] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextAudioTimeRef = useRef<number>(0);

  const playAudio = useCallback(async (base64Data: string) => {
    if (!audioContextRef.current) return;
    
    try {
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const pcmData = new Int16Array(bytes.buffer);
      const floatData = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) floatData[i] = pcmData[i] / 0x7FFF;

      const buffer = audioContextRef.current.createBuffer(1, floatData.length, 24000);
      buffer.getChannelData(0).set(floatData);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      
      const startTime = Math.max(audioContextRef.current.currentTime, nextAudioTimeRef.current);
      source.start(startTime);
      nextAudioTimeRef.current = startTime + buffer.duration;
    } catch (err) {
      console.error("Error playing audio:", err);
    }
  }, []);

  const startStreaming = useCallback((session: any, stream: MediaStream) => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    audioContextRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      if (isMuted || !session) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
      }
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
      session.sendRealtimeInput({ audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' } });
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);

    const sendFrame = () => {
      if (!isVideoEnabled || !canvasRef.current || !videoRef.current || !session) {
        if (session) requestAnimationFrame(sendFrame);
        return;
      }
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, 320, 240);
        const base64Data = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];
        session.sendRealtimeInput({ video: { data: base64Data, mimeType: 'image/jpeg' } });
      }
      if (session) requestAnimationFrame(sendFrame);
    };
    sendFrame();
  }, [isMuted, isVideoEnabled]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !sessionRef.current) return;
    
    sessionRef.current.sendRealtimeInput({ text: inputText });
    setTranscription(prev => [...prev, { role: 'user', text: inputText }]);
    setInputText('');
  };

  const startSession = useCallback(async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: PET_EXPERT_INSTRUCTION + "\n\nYou are in a LIVE video consultation. Use your visual and auditory senses to help the user with their pet immediately. You can also receive text messages from the user.",
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } }
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            sessionPromise.then(session => {
              sessionRef.current = session;
              startStreaming(session, stream);
            });
          },
          onmessage: (message: LiveServerMessage) => {
            if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
              playAudio(message.serverContent.modelTurn.parts[0].inlineData.data);
            }
            
            if (message.serverContent?.interrupted) {
              nextAudioTimeRef.current = audioContextRef.current?.currentTime || 0;
            }

            if (message.serverContent?.modelTurn?.parts[0]?.text) {
              setTranscription(prev => [...prev, { role: 'ai', text: message.serverContent!.modelTurn!.parts[0].text! }]);
            }

            if (message.serverContent?.outputTranscription?.text) {
              setTranscription(prev => [...prev, { role: 'ai', text: message.serverContent!.outputTranscription!.text! }]);
            }

            if (message.serverContent?.inputTranscription?.text) {
              setTranscription(prev => [...prev, { role: 'user', text: message.serverContent!.inputTranscription!.text! }]);
            }
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            setError("Connection error. Please try again.");
          },
          onclose: () => {
            setIsConnected(false);
            onEnd();
          }
        }
      });
    } catch (err) {
      console.error("Failed to start live session:", err);
      setError("Could not access camera/microphone. Please ensure you have granted permissions.");
    }
  }, [onEnd, playAudio, startStreaming]);

  useEffect(() => {
    startSession();
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioContextRef.current?.close();
      if (sessionRef.current) {
        sessionRef.current.close();
        sessionRef.current = null;
      }
    };
  }, [startSession]);

  return (
    <div className="fixed inset-0 z-[100] bg-[#0A0A0A] flex flex-col md:flex-row">
      {/* Video Section */}
      <div className="flex-1 relative flex flex-col p-4 gap-4">
        <div className="flex-1 relative grid grid-cols-1 gap-4">
          <div className="relative bg-[#1A1A1A] rounded-3xl overflow-hidden shadow-2xl border border-white/5">
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              playsInline 
              className={cn("w-full h-full object-cover", !isVideoEnabled && "hidden")}
            />
            {!isVideoEnabled && (
              <div className="absolute inset-0 flex items-center justify-center text-white/10">
                <VideoOff size={80} />
              </div>
            )}
            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-white text-[10px] font-bold uppercase tracking-wider">
              Live Feed
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-[#1A1A1A] border border-white/5 rounded-[32px] p-6 flex items-center justify-center gap-6 shadow-2xl">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300",
              isMuted ? "bg-red-500 text-white" : "bg-white/5 text-white hover:bg-white/10"
            )}
          >
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
          
          <button 
            onClick={onEnd}
            className="w-20 h-14 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-all duration-300 shadow-[0_0_30px_rgba(239,68,68,0.3)]"
          >
            <PhoneOff size={28} />
          </button>

          <button 
            onClick={() => setIsVideoEnabled(!isVideoEnabled)}
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300",
              !isVideoEnabled ? "bg-red-500 text-white" : "bg-white/5 text-white hover:bg-white/10"
            )}
          >
            {!isVideoEnabled ? <VideoOff size={24} /> : <Video size={24} />}
          </button>
        </div>
      </div>

      {/* Chat Section */}
      <div className="w-full md:w-[400px] bg-[#111111] border-l border-white/5 flex flex-col">
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <div className="w-10 h-10 bg-[#5A5A40] rounded-xl flex items-center justify-center text-white shadow-[0_0_20px_rgba(90,90,64,0.2)]">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="text-white font-bold">Pawesome AI</h3>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Live Consultation</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
          {transcription.map((t, i) => (
            <div key={i} className={cn(
              "max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed",
              t.role === 'ai' 
                ? "bg-white/5 text-white self-start rounded-tl-none border border-white/5" 
                : "bg-[#5A5A40] text-white self-end rounded-tr-none ml-auto"
            )}>
              <p>{t.text}</p>
            </div>
          ))}
          <div className="h-2" />
        </div>

        <form onSubmit={handleSendMessage} className="p-6 bg-[#1A1A1A] border-t border-white/5">
          <div className="relative">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type a message..."
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#5A5A40] transition-all"
            />
            <button 
              type="submit"
              disabled={!inputText.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#5A5A40] hover:text-white disabled:opacity-30 transition-colors"
            >
              <MessageSquare size={20} />
            </button>
          </div>
        </form>
      </div>

      <canvas ref={canvasRef} width="320" height="240" className="hidden" />
      
      {!isConnected && !error && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center text-white z-[110]">
          <div className="w-20 h-20 bg-[#5A5A40] rounded-[32px] flex items-center justify-center text-white mb-8 animate-pulse shadow-[0_0_50px_rgba(90,90,64,0.3)]">
            <Sparkles size={40} />
          </div>
          <Loader2 size={32} className="animate-spin text-[#5A5A40] mb-4" />
          <p className="font-serif text-2xl font-bold tracking-tight">Connecting to Pawesome AI</p>
          <p className="text-white/40 text-sm mt-2">Preparing your live consultation session...</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center text-white z-[110] p-8 text-center">
          <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-6">
            <PhoneOff size={32} />
          </div>
          <h3 className="text-xl font-bold mb-2">Connection Failed</h3>
          <p className="text-white/60 mb-8 max-w-xs mx-auto">{error}</p>
          <button 
            onClick={onEnd} 
            className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-white/90 transition-all active:scale-95"
          >
            Return to Home
          </button>
        </div>
      )}
    </div>
  );
}
