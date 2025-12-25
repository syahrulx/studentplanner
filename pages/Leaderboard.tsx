
import React from 'react';
import { Icons } from '../constants';

interface Props {
  onBack: () => void;
}

const Leaderboard: React.FC<Props> = ({ onBack }) => {
  const rankings = [
    { rank: 1, name: 'Sarah Amin', subject: 'CSC584', score: 1250, badge: true },
    { rank: 2, name: 'Aiman Hafiz (You)', subject: 'CSC584', score: 1180, badge: true },
    { rank: 3, name: 'Zul Hilmi', subject: 'CSC584', score: 950, badge: true },
    { rank: 4, name: 'Farah Wahida', subject: 'CSC584', score: 820, badge: false },
    { rank: 5, name: 'Iskandar Z.', subject: 'CSC584', score: 790, badge: false },
  ];

  return (
    <div className="p-6 bg-white space-y-8 animate-slide-in pb-10">
      <header className="flex items-center justify-between pt-2">
        <button onClick={onBack} className="p-3 bg-gray-50 rounded-2xl text-gray-400 active:scale-90 transition-all">
          <Icons.ArrowRight className="rotate-180" />
        </button>
        <h1 className="text-xl font-black text-uitm-navy tracking-tight">Leaderboard</h1>
        <div className="w-10"></div>
      </header>

      <div className="flex bg-gray-50 p-1 rounded-2xl border border-gray-100">
        <button className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl bg-white shadow-premium text-uitm-navy">This Week</button>
        <button className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">All Time</button>
      </div>

      <div className="space-y-4">
        {rankings.map((p, i) => (
          <div 
            key={i} 
            className={`flex items-center justify-between p-6 rounded-[2.5rem] border ${p.rank === 2 ? 'bg-uitm-navy text-white shadow-premium border-transparent' : 'bg-white border-gray-100 shadow-sm'}`}
          >
            <div className="flex items-center gap-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black ${p.rank === 1 ? 'bg-uitm-gold text-white' : p.rank === 2 ? 'bg-white/10 text-white' : 'bg-gray-50 text-gray-400'}`}>
                {p.rank}
              </div>
              <div>
                <h4 className="text-sm font-black tracking-tight">{p.name}</h4>
                <p className={`text-[9px] font-black uppercase tracking-widest ${p.rank === 2 ? 'text-blue-200' : 'text-gray-400'}`}>{p.subject} Champion</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-black tracking-tight">{p.score}</div>
              <div className={`text-[8px] font-black uppercase tracking-widest ${p.rank === 2 ? 'text-uitm-gold' : 'text-gray-300'}`}>PTS</div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-8 bg-gray-50 rounded-[2.5rem] border border-dashed border-gray-200 text-center">
        <p className="text-[10px] text-gray-400 font-medium italic">
          "The best way to predict your future is to create it." — FSKM academic motivation. 
          Leaderboard data is simulated for prototype purposes.
        </p>
      </div>
    </div>
  );
};

export default Leaderboard;
