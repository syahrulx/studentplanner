
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Course } from '../types';
import { Icons } from '../constants';
import { GoogleGenAI, Type } from "@google/genai";

const INITIAL_SOW_DATA: Record<string, number[]> = {
  'CSC584': [1, 2, 2, 3, 3, 4, 8, 2, 5, 6, 7, 9, 10, 4], 
  'ICT551': [2, 2, 3, 3, 4, 7, 5, 2, 4, 5, 8, 8, 9, 10], 
  'IPS551': [1, 1, 2, 3, 3, 4, 4, 1, 5, 7, 9, 8, 10, 3], 
  'ICT502': [2, 3, 4, 5, 8, 4, 3, 2, 4, 5, 6, 9, 7, 2], 
  'ISP573': [1, 2, 3, 3, 4, 4, 7, 2, 4, 6, 6, 9, 10, 3], 
  'CTU551': [1, 1, 1, 2, 2, 4, 3, 8, 3, 2, 3, 4, 3, 9], 
  'TAC451': [2, 2, 2, 3, 3, 3, 8, 2, 3, 4, 4, 5, 5, 10], 
  'LCC401': [1, 1, 2, 2, 3, 3, 3, 3, 9, 4, 4, 4, 5, 8], 
};

const StressMap = ({ courses, onBack }: { courses: Course[], onBack: () => void }) => {
  const currentWeek = 11;
  const [sowData, setSowData] = useState<Record<string, number[]>>(INITIAL_SOW_DATA);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [hoveredWeek, setHoveredWeek] = useState<number | null>(null);
  const [messages, setMessages] = useState<{role: 'ai' | 'user', text: string}[]>([
    { role: 'ai', text: "Hello! I am your AI SOW Tuner. I can handle any updates or changes to your semester workload. Just tell me what's changed in your schedule!" }
  ]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  const aggregateStress = useMemo(() => {
    const weeklyTotals = new Array(14).fill(0);
    const keys = Object.keys(sowData);
    if (keys.length === 0) return weeklyTotals;
    
    for (let w = 0; w < 14; w++) {
      let sum = 0;
      keys.forEach(key => { sum += (sowData[key][w] || 0); });
      weeklyTotals[w] = sum / keys.length;
    }
    return weeklyTotals;
  }, [sowData]);

  const handleAiUpdate = async () => {
    if (!chatInput.trim()) return;
    
    const userMsg = chatInput;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatInput('');
    setIsProcessing(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `You are the SOW Intelligence Engine for a UiTM student. 
        Current SOW Data: ${JSON.stringify(sowData)}. 
        Request: "${userMsg}". 
        Instruction: Process ANY update or change requested. This includes:
        - Adjusting specific week values (0-10 scale).
        - Shifting workload between weeks.
        - Bulk changes to all subjects.
        - Adding or removing subject codes if mentioned.
        
        Return a JSON object with:
        1. 'updatedData': The full new Record<string, number[]> with 14 weeks each.
        2. 'confirmation': A friendly, concise academic-toned response confirming exactly what was changed.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              updatedData: { 
                type: Type.OBJECT,
                description: "The complete updated SOW mapping"
              },
              confirmation: { type: Type.STRING }
            },
            required: ['updatedData', 'confirmation']
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      if (result.updatedData) {
        setSowData(result.updatedData);
        setMessages(prev => [...prev, { role: 'ai', text: result.confirmation }]);
      }
    } catch (error) {
      console.error("AI SOW Recalibration failed", error);
      setMessages(prev => [...prev, { role: 'ai', text: "Apologies, I encountered an error recalibrating your workload. Could you please rephrase your request?" }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col relative animate-slide-in">
      {/* Header */}
      <div className="p-6 pb-2 sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-3 bg-gray-50 rounded-2xl text-uitm-navy active:scale-90 transition-all">
            <Icons.ArrowRight className="w-4 h-4 rotate-180" />
          </button>
          <div>
            <h1 className="text-xl font-black text-uitm-navy tracking-tight">SOW Intelligence</h1>
            <p className="text-[9px] text-uitm-gold font-black uppercase tracking-widest">Part 4 ISE • AI Managed</p>
          </div>
        </div>
        <button 
          onClick={() => setIsChatOpen(true)}
          className="flex items-center gap-2 bg-uitm-navy text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-premium active:scale-95 transition-all"
        >
          <Icons.Sparkles className="w-3 h-3 text-uitm-gold" />
          Edit SOW
        </button>
      </div>

      <div className="p-6 space-y-8 pb-32">
        {/* Main Pulse Visualization */}
        <section className="bg-uitm-navy rounded-[2.5rem] p-8 text-white shadow-premium relative overflow-hidden group">
          <div className="relative z-10 flex justify-between items-start mb-8">
            <div className="space-y-1">
              <h2 className="text-[9px] font-black uppercase tracking-[0.3em] text-blue-200/40">Workload Velocity</h2>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">Critical Wave Detection</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-3xl font-black tracking-tighter">W14</span>
              <p className="text-[8px] font-black text-blue-200/20 uppercase tracking-[0.2em]">Scale Range</p>
            </div>
          </div>

          <div className="relative flex items-end justify-between h-44 gap-1.5 px-1 pb-2 z-10">
            {aggregateStress.map((stress, i) => {
              const h = (stress / 10) * 100;
              const isCurrent = (i + 1) === currentWeek;
              const isCritical = stress > 7.2;
              const isHovered = hoveredWeek === i + 1;
              
              return (
                <div 
                  key={i} 
                  className="flex-1 flex flex-col items-center"
                  onMouseEnter={() => setHoveredWeek(i + 1)}
                  onMouseLeave={() => setHoveredWeek(null)}
                >
                  <div className="relative w-full flex flex-col items-center justify-end h-full">
                    <div 
                      style={{ height: `${Math.max(h, 8)}%` }}
                      className={`w-full rounded-t-lg transition-all duration-700 ease-out relative ${
                        isCurrent ? 'bg-uitm-gold shadow-gold z-10' : 
                        isCritical ? 'bg-red-400/80' : 'bg-white/10'
                      } ${isHovered ? 'opacity-100 scale-x-110' : 'opacity-80'}`}
                    >
                      {isCurrent && (
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 flex flex-col items-center">
                          <div className="w-2 h-2 bg-white rounded-full ring-4 ring-uitm-gold/30"></div>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className={`text-[7px] font-black mt-3 transition-colors ${isCurrent ? 'text-uitm-gold' : 'text-blue-200/40'}`}>
                    W{i + 1}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="absolute top-[-40%] right-[-10%] w-64 h-64 bg-white/5 rounded-full blur-[80px]"></div>
        </section>

        {/* Dynamic Summary Cards */}
        <div className="grid grid-cols-2 gap-4">
           <div className="bg-gray-50/50 p-6 rounded-[2rem] border border-gray-100/50 space-y-2">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Avg. Stress</p>
              <h4 className="text-2xl font-black text-uitm-navy">{(aggregateStress.reduce((a,b)=>a+b,0)/14).toFixed(1)}</h4>
           </div>
           <div className="bg-gray-50/50 p-6 rounded-[2rem] border border-gray-100/50 space-y-2">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Highest Week</p>
              <h4 className="text-2xl font-black text-red-500">W{aggregateStress.indexOf(Math.max(...aggregateStress)) + 1}</h4>
           </div>
        </div>

        {/* Detailed List */}
        <section className="space-y-6">
          <div className="flex justify-between items-center px-4">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Subject Load breakdown</h3>
            <span className="text-[8px] font-black text-uitm-gold uppercase bg-uitm-gold/10 px-3 py-1 rounded-full">AI Sync Active</span>
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-premium border border-gray-50 p-8 space-y-8">
            {Object.entries(sowData).map(([code, levels]) => {
              const currentLevel = levels[currentWeek - 1] || 0;
              const isPeak = currentLevel >= 8;
              return (
                <div key={code} className="space-y-4 group">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-uitm-navy tracking-tight">{code}</span>
                      {isPeak && <span className="text-[7px] font-black bg-red-50 text-red-500 px-2 py-0.5 rounded uppercase tracking-widest border border-red-100">Peak Load</span>}
                    </div>
                    <span className="text-xs font-black text-uitm-navy/30">{currentLevel}/10</span>
                  </div>
                  <div className="flex gap-1 h-1.5 items-center">
                    {levels.map((lvl, idx) => (
                      <div 
                        key={idx} 
                        className={`h-full flex-1 rounded-full transition-all duration-500 ${
                          idx === currentWeek - 1 ? 'bg-uitm-navy h-2.5 scale-y-125' : 
                          lvl >= 8 ? 'bg-red-200' : 'bg-gray-100'
                        }`}
                      ></div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Advisory Insight */}
        <div className="bg-uitm-gold/5 p-8 rounded-[2.5rem] border border-uitm-gold/10 flex items-start gap-4">
           <div className="p-3 bg-white rounded-2xl shadow-sm text-uitm-gold">
              <Icons.Sparkles className="w-5 h-5" />
           </div>
           <div className="space-y-2">
              <h4 className="text-[10px] font-black text-uitm-navy uppercase tracking-widest">SOW Intelligence Forecast</h4>
              <p className="text-xs text-gray-500 font-medium leading-relaxed">
                Workload levels are derived from the official Scheme of Work. Any unofficial changes or shifts should be updated using the <strong>AI SOW Tuner</strong> to ensure your planner stays accurate.
              </p>
           </div>
        </div>
      </div>

      {/* AI TUNER CHAT MODAL */}
      {isChatOpen && (
        <div className="fixed inset-0 bg-uitm-navy/98 backdrop-blur-xl z-[100] flex flex-col animate-in fade-in duration-300">
           <header className="p-8 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-uitm-gold rounded-2xl flex items-center justify-center text-white shadow-gold">
                    <Icons.Sparkles className="w-6 h-6" />
                 </div>
                 <div>
                    <h2 className="text-xl font-black text-white tracking-tight">AI SOW Tuner</h2>
                    <p className="text-[9px] text-blue-200/40 font-black uppercase tracking-widest">Conversational Workload Recalibration</p>
                 </div>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="p-4 bg-white/5 rounded-2xl text-white/40 active:scale-90 transition-all">
                 <Icons.Plus className="rotate-45" />
              </button>
           </header>

           <div className="flex-1 overflow-y-auto p-8 space-y-6 hide-scrollbar">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-in`}>
                   <div className={`max-w-[85%] p-6 rounded-[2rem] text-sm font-medium leading-relaxed ${
                     m.role === 'user' ? 'bg-uitm-gold text-white rounded-br-lg shadow-gold' : 'bg-white/10 text-white rounded-bl-lg border border-white/5'
                   }`}>
                      {m.text}
                   </div>
                </div>
              ))}
              {isProcessing && (
                <div className="flex justify-start">
                   <div className="bg-white/5 p-4 rounded-2xl text-[9px] font-black uppercase tracking-widest text-blue-200/50 flex items-center gap-3">
                      <div className="w-2 h-2 bg-uitm-gold rounded-full animate-ping"></div>
                      Recalibrating Semester Pulse...
                   </div>
                </div>
              )}
              <div ref={chatEndRef} />
           </div>

           <div className="p-8 bg-black/20 border-t border-white/5">
              <div className="relative">
                 <input 
                   value={chatInput}
                   onChange={e => setChatInput(e.target.value)}
                   onKeyPress={e => e.key === 'Enter' && handleAiUpdate()}
                   placeholder="e.g. 'Move week 12 stress to week 13'"
                   className="w-full bg-white/5 border border-white/10 rounded-[2rem] py-6 px-8 text-sm font-bold text-white placeholder:text-white/20 outline-none focus:border-uitm-gold transition-all"
                 />
                 <button 
                   onClick={handleAiUpdate}
                   disabled={!chatInput.trim() || isProcessing}
                   className="absolute right-3 top-1/2 -translate-y-1/2 bg-uitm-gold p-4 rounded-2xl text-white shadow-gold active:scale-90 transition-all disabled:opacity-20"
                 >
                    <Icons.ArrowRight className="w-4 h-4" />
                 </button>
              </div>
              <p className="text-[9px] text-center mt-6 text-white/20 font-black uppercase tracking-[0.3em]">
                 Chat based SOW changes only
              </p>
           </div>
        </div>
      )}
    </div>
  );
};

export default StressMap;
