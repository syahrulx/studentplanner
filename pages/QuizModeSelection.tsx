
import React from 'react';
import { Icons } from '../constants';

interface Props {
  onSelectSolo: () => void;
  onSelectMulti: () => void;
  onBack: () => void;
}

const QuizModeSelection: React.FC<Props> = ({ onSelectSolo, onSelectMulti, onBack }) => {
  return (
    <div className="p-6 bg-white space-y-12 animate-slide-in h-screen flex flex-col">
      <header className="flex items-center justify-between pt-2">
        <button onClick={onBack} className="p-3 bg-gray-50 rounded-2xl text-gray-400 active:scale-90 transition-all">
          <Icons.ArrowRight className="rotate-180" />
        </button>
        <h1 className="text-xl font-black text-uitm-navy tracking-tight">Select Mode</h1>
        <div className="w-10"></div>
      </header>

      <div className="flex-1 flex flex-col gap-6 justify-center">
        <button 
          onClick={onSelectSolo}
          className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-premium group active:scale-95 transition-all text-left space-y-4"
        >
          <div className="w-16 h-16 bg-blue-50 text-uitm-navy rounded-[1.5rem] flex items-center justify-center group-hover:bg-uitm-navy group-hover:text-white transition-all">
            <Icons.User className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-uitm-navy tracking-tight">Solo Practice</h2>
            <p className="text-xs text-gray-400 font-medium">Personal focus, no timers, learn at your own pace.</p>
          </div>
        </button>

        <button 
          onClick={onSelectMulti}
          className="bg-uitm-navy p-8 rounded-[3rem] shadow-premium group active:scale-95 transition-all text-left space-y-4 overflow-hidden relative"
        >
          <div className="relative z-10 w-16 h-16 bg-uitm-gold text-white rounded-[1.5rem] flex items-center justify-center shadow-gold">
            <Icons.Sparkles className="w-8 h-8" />
          </div>
          <div className="relative z-10">
            <h2 className="text-2xl font-black text-white tracking-tight">Multiplayer VS</h2>
            <p className="text-xs text-blue-200 font-medium">Battle classmates real-time and climb the leaderboard.</p>
          </div>
          <div className="absolute bottom-[-20%] right-[-10%] w-48 h-48 bg-white/5 rounded-full blur-3xl"></div>
        </button>
      </div>

      <p className="text-[10px] text-gray-300 font-black uppercase text-center tracking-widest pb-10">
        AI simulated matchmaking active
      </p>
    </div>
  );
};

export default QuizModeSelection;
