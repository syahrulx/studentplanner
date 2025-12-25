
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, Note } from '../types';
import { Icons } from '../constants';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';

interface Props {
  user: UserProfile;
  notes: Note[];
  onBack: () => void;
}

const AIVoiceAssistant: React.FC<Props> = ({ user, notes, onBack }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [transcription, setTranscription] = useState("Tap to start speaking...");
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);

  const startAssistant = async () => {
    setIsConnecting(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = inputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setIsConnecting(false);
            setIsActive(true);
            setTranscription("I'm listening. Ask me about your study plan!");
            
            // Start streaming microphone
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
              
              const bytes = new Uint8Array(int16.buffer);
              let binary = '';
              for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
              const base64 = btoa(binary);

              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
               const binaryString = atob(audioData);
               const bytes = new Uint8Array(binaryString.length);
               for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
               
               const dataInt16 = new Int16Array(bytes.buffer);
               const buffer = outputCtx.createBuffer(1, dataInt16.length, 24000);
               const channelData = buffer.getChannelData(0);
               for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;

               const source = outputCtx.createBufferSource();
               source.buffer = buffer;
               source.connect(outputCtx.destination);
               source.start();
            }
          },
          onclose: () => stopAssistant(),
          onerror: (e) => console.error("Live API Error", e)
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `You are the UiTM Study Assistant for ${user.name}. You are helpful, academic, and encouraging. You know the student is in Part 4 ISE at UiTM. Use their notes to answer questions: ${JSON.stringify(notes.map(n => ({ title: n.title, content: n.content })))}. Keep answers concise and spoken-friendly.`,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
        }
      });
      sessionRef.current = sessionPromise;

    } catch (e) {
      console.error(e);
      setIsConnecting(false);
    }
  };

  const stopAssistant = () => {
    setIsActive(false);
    setIsConnecting(false);
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioContextRef.current?.close();
    setTranscription("Voice Session Ended.");
  };

  return (
    <div className="h-screen bg-uitm-navy text-white flex flex-col items-center justify-between p-10 overflow-hidden relative">
      {/* Background Aura */}
      <div className={`absolute inset-0 transition-opacity duration-1000 ${isActive ? 'opacity-100' : 'opacity-20'}`}>
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-uitm-gold/20 rounded-full blur-[100px] animate-pulse"></div>
         <div className="absolute top-1/4 left-1/3 w-[300px] h-[300px] bg-blue-400/10 rounded-full blur-[80px] animate-bounce"></div>
      </div>

      <header className="relative z-10 w-full flex items-center justify-between pt-6">
        <button onClick={onBack} className="p-3 bg-white/5 rounded-2xl text-white/40 active:scale-90 transition-all">
          <Icons.ArrowRight className="rotate-180" />
        </button>
        <div className="text-center">
          <h1 className="text-lg font-black tracking-tight uppercase">AI Voice Tutor</h1>
          <p className="text-[9px] text-uitm-gold font-black uppercase tracking-widest">Live Synthesis active</p>
        </div>
        <button className="p-3 bg-white/5 rounded-2xl text-white/40">
           <Icons.Settings />
        </button>
      </header>

      {/* Main Pulse UI */}
      <div className="relative z-10 flex flex-col items-center gap-12 flex-1 justify-center w-full">
        <div className="relative">
          {/* Waveform rings */}
          {isActive && (
            <>
              <div className="absolute inset-0 rounded-full border-4 border-uitm-gold/30 animate-ping"></div>
              <div className="absolute inset-[-20px] rounded-full border-2 border-white/5 animate-ping [animation-delay:0.5s]"></div>
            </>
          )}
          
          <div className={`w-48 h-48 rounded-[4rem] bg-white flex items-center justify-center shadow-2xl transition-all duration-500 ${isActive ? 'scale-110 shadow-gold' : 'scale-100'}`}>
            {isActive ? (
              <Icons.Mic className="w-16 h-16 text-uitm-navy animate-pulse" />
            ) : (
              <div className="w-20 h-20 bg-uitm-navy rounded-3xl flex items-center justify-center">
                 <Icons.Sparkles className="w-10 h-10 text-white" />
              </div>
            )}
          </div>
        </div>

        <div className="text-center space-y-4 max-w-xs">
          <p className={`text-xl font-black tracking-tight leading-tight transition-all duration-300 ${isActive ? 'text-white' : 'text-blue-200 opacity-40'}`}>
            {isConnecting ? "Establishing Sync..." : transcription}
          </p>
          <div className="flex justify-center gap-1">
             {[...Array(5)].map((_, i) => (
               <div key={i} className={`w-1 h-3 rounded-full bg-uitm-gold transition-all duration-200 ${isActive ? 'animate-[bounce_0.5s_infinite]' : 'opacity-20'}`} style={{ animationDelay: `${i * 0.1}s` }}></div>
             ))}
          </div>
        </div>
      </div>

      {/* Control Area */}
      <div className="relative z-10 w-full pb-10 space-y-6">
        {!isActive && !isConnecting ? (
          <button 
            onClick={startAssistant}
            className="w-full bg-white text-uitm-navy py-6 rounded-[2.5rem] font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-all text-sm flex items-center justify-center gap-3"
          >
            <Icons.Mic className="w-5 h-5" />
            Start Voice Session
          </button>
        ) : (
          <button 
            onClick={stopAssistant}
            className="w-full bg-red-500/10 border border-red-500/20 text-red-500 py-6 rounded-[2.5rem] font-black uppercase tracking-widest active:scale-95 transition-all text-sm"
          >
            End Session
          </button>
        )}
        <p className="text-[9px] text-blue-300/40 font-black uppercase text-center tracking-[0.3em]">
          Powered by Gemini 2.5 Flash Native Audio
        </p>
      </div>
    </div>
  );
};

export default AIVoiceAssistant;
