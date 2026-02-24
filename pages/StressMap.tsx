
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Course, UserProfile } from '../types';
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

const StressMap = ({ user, courses, onBack }: { user: UserProfile, courses: Course[], onBack: () => void }) => {
  const currentWeek = user.currentWeek;
  const [sowData, setSowData] = useState<Record<string, number[]>>(INITIAL_SOW_DATA);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<{role: 'ai' | 'user', text: string}[]>([
    { role: 'ai', text: `Hello ! I see we're in Week ${user.currentWeek}. I can help you recalibrate your SOW if any deadlines have shifted. What's changed?` }
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

  return (
    <div className="min-h-screen flex flex-col relative animate-slide-in">
      {/* Compact Header - Original Blue-Grey Palette */}
      <div className="p-4 pt-6 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 bg-gray-50 rounded-xl text-gray-400">
            <Icons.ArrowRight className="rotate-180 w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-black text-gray-800 leading-tight">SOW Intelligence</h1>
            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{user.program} • PART {user.part} • AI MANAGED</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Workload Velocity Card - Original Styling but Compacted */}
        <section id="stress-graph" className="bg-[#5E7A94] rounded-[2rem] p-6 text-white shadow-xl relative overflow-hidden h-[260px] flex flex-col">
          <div className="relative z-10 flex justify-between items-start mb-4">
            <div className="space-y-0.5">
              <h2 className="text-[8px] font-black uppercase tracking-[0.2em] opacity-40">WORKLOAD VELOCITY</h2>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></div>
                <span className="text-[8px] font-black text-red-100 uppercase tracking-widest">CRITICAL WAVE</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-3xl font-black tracking-tighter block leading-none">W14</span>
              <p className="text-[7px] font-black opacity-30 uppercase tracking-[0.1em]">SCALE RANGE</p>
            </div>
          </div>

          {/* Chart Visualization */}
          <div className="flex-1 relative flex items-end justify-between gap-1.5 pt-4 pb-2">
            {aggregateStress.map((stress, i) => {
              const h = (stress / 10) * 100;
              const isCurrent = (i + 1) === currentWeek;
              return (
                <div key={i} className="flex-1 h-full flex flex-col items-center justify-end group">
                  <div 
                    style={{ height: `${Math.max(h, 5)}%` }}
                    className={`w-full rounded-full transition-all duration-500 ${isCurrent ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.4)]' : 'bg-white/20'}`}
                  >
                  </div>
                  <span className={`text-[6px] mt-2 font-black ${isCurrent ? 'text-white' : 'opacity-30'}`}>W{i+1}</span>
                </div>
              );
            })}
          </div>
          <div className="absolute top-[-20%] right-[-10%] w-48 h-48 bg-white/5 rounded-full blur-[60px]"></div>
        </section>

        {/* Compact Stats Cards */}
        <div className="grid grid-cols-2 gap-3">
           <div className="bg-gray-50/50 border border-gray-100 p-5 rounded-[1.5rem] flex flex-col items-center justify-center text-center">
              <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">AVG. STRESS</p>
              <h4 className="text-2xl font-black text-gray-700">4.3</h4>
           </div>
           <div className="bg-gray-50/50 border border-gray-100 p-5 rounded-[1.5rem] flex flex-col items-center justify-center text-center">
              <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">HIGHEST WEEK</p>
              <h4 className="text-2xl font-black text-red-400">W13</h4>
           </div>
        </div>

        {/* Labels */}
        <div className="flex justify-between items-center px-2 py-2">
          <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest">SUBJECT LOAD BREAKDOWN</h3>
          <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">AI SYNC ACTIVE</span>
        </div>

        {/* Breakdown List - Compact Original Styling */}
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 space-y-6">
          {Object.entries(sowData).slice(0, 5).map(([code, levelsData]) => {
            const levels = levelsData as number[];
            const currentLevel = levels[currentWeek - 1] || 0;
            return (
              <div key={code} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-gray-700">{code}</span>
                  <span className="text-[8px] font-black text-gray-300">LEVEL {currentLevel.toFixed(1)}</span>
                </div>
                <div className="flex gap-1 h-1">
                  {levels.map((lvl, idx) => (
                    <div 
                      key={idx} 
                      className={`flex-1 rounded-full transition-all ${idx === currentWeek - 1 ? 'bg-[#5E7A94] h-2 -mt-0.5' : 'bg-gray-100'}`}
                    ></div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StressMap;
