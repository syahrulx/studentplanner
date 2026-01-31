
import React, { useState, useEffect } from 'react';
import { Icons } from '../constants';

interface Props {
  onStart: () => void;
  onBack: () => void;
}

const MatchLobby: React.FC<Props> = ({ onStart, onBack }) => {
  const [participants, setParticipants] = useState([
    { name: 'Syahrul Izwan (You)', status: 'Ready', isMe: true },
    { name: 'Syafiq ', status: 'Ready', isMe: false },
  ]);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onStart();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Simulate another player joining
    setTimeout(() => {
      setParticipants(prev => [...prev, { name: 'Zul Hilmi', status: 'Connecting...', isMe: false }]);
    }, 2000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="p-6 bg-white space-y-8 animate-slide-in h-screen flex flex-col">
      <header className="flex items-center justify-between pt-2">
        <button onClick={onBack} className="p-3 bg-gray-50 rounded-2xl text-gray-400 active:scale-90 transition-all">
          <Icons.ArrowRight className="rotate-180" />
        </button>
        <h1 className="text-xl font-black text-uitm-navy tracking-tight">Match Lobby</h1>
        <div className="w-10"></div>
      </header>

      <div className="bg-uitm-gold p-10 rounded-[3rem] text-white shadow-gold text-center space-y-3 relative overflow-hidden">
        <div className="relative z-10 text-5xl font-black tracking-tighter">{countdown}</div>
        <p className="relative z-10 text-[10px] font-black uppercase tracking-widest">Match starting in...</p>
        <div className="absolute top-[-50%] left-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
      </div>

      <div className="flex-1 space-y-6">
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Participants (3/4)</h3>
        <div className="space-y-4">
          {participants.map((p, i) => (
            <div key={i} className="flex items-center justify-between p-5 bg-gray-50 rounded-3xl border border-gray-100">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${p.isMe ? 'bg-uitm-navy text-white' : 'bg-white text-gray-400'}`}>
                  {p.name[0]}
                </div>
                <div>
                  <h4 className={`text-sm font-black ${p.isMe ? 'text-uitm-navy' : 'text-gray-800'}`}>{p.name}</h4>
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">ISE Part 4 Student</p>
                </div>
              </div>
              <span className={`text-[9px] font-black uppercase tracking-widest ${p.status === 'Ready' ? 'text-green-500' : 'text-orange-400 animate-pulse'}`}>
                {p.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-uitm-navy/5 p-6 rounded-[2rem] text-center">
        <p className="text-[10px] text-uitm-navy font-black uppercase tracking-widest">Subject: CSC584 - Enterprise Programming</p>
      </div>
    </div>
  );
};

export default MatchLobby;
