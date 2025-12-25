
import React from 'react';
import { Icons } from '../constants';

interface Props {
  score: number;
  onFinish: () => void;
}

const ResultsPage: React.FC<Props> = ({ score, onFinish }) => {
  return (
    <div className="p-6 bg-white space-y-12 animate-slide-in h-screen flex flex-col items-center justify-center text-center">
      <div className="relative">
        <div className="w-48 h-48 bg-uitm-navy rounded-[3.5rem] flex flex-col items-center justify-center text-white shadow-2xl relative z-10">
          <span className="text-5xl font-black tracking-tighter">{score}</span>
          <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Points</span>
        </div>
        <div className="absolute top-[-10%] right-[-10%] w-20 h-20 bg-uitm-gold rounded-full flex items-center justify-center shadow-lg animate-bounce z-20">
          <Icons.Sparkles className="w-10 h-10 text-white" />
        </div>
      </div>

      <div className="space-y-4 max-w-xs">
        <h1 className="text-3xl font-black text-uitm-navy tracking-tight">Excellent Work!</h1>
        <p className="text-xs text-gray-400 font-medium leading-relaxed">
          The simulated AI analyzer confirms you have a strong grasp of <span className="text-uitm-navy font-bold">MVC Patterns</span>. However, consider revisiting Hibernate mappings for a 100% score.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full px-4">
        <div className="bg-gray-50 p-6 rounded-[2.5rem] border border-gray-100">
           <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Time Taken</div>
           <div className="text-xl font-black text-uitm-navy">0:45s</div>
        </div>
        <div className="bg-gray-50 p-6 rounded-[2.5rem] border border-gray-100">
           <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Accuracy</div>
           <div className="text-xl font-black text-uitm-navy">85%</div>
        </div>
      </div>

      <button 
        onClick={onFinish}
        className="w-full bg-uitm-navy text-white py-5 rounded-[2rem] font-black uppercase tracking-widest shadow-premium active:scale-95 transition-all text-sm mt-8"
      >
        View Leaderboard
      </button>
    </div>
  );
};

export default ResultsPage;
