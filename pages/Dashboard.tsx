
import React from 'react';
import { UserProfile, Task, Priority } from '../types';
import { Icons } from '../constants';

interface Props {
  user: UserProfile;
  tasks: Task[];
  onNavigate: (p: any) => void;
}

const Dashboard: React.FC<Props> = ({ user, tasks, onNavigate }) => {
  const pendingTasks = tasks.filter(t => !t.isDone);
  const highPriorityTasks = pendingTasks.filter(t => t.priority === Priority.High);
  const nextTask = highPriorityTasks.length > 0 ? highPriorityTasks[0] : pendingTasks[0];
  
  const completionRate = Math.round(((tasks.length - pendingTasks.length) / (tasks.length || 1)) * 100);

  const schedule = [
    { time: '08:00 - 10:00', code: 'CSC584', room: 'Lab 2, L4', type: 'Lab' },
    { time: '14:00 - 16:00', code: 'IPS551', room: 'DK 1, Annex', type: 'Lecture' }
  ];

  return (
    <div className="p-5 bg-white space-y-6 animate-slide-in pb-10">
      {/* Mini Header */}
      <div className="flex items-center justify-between pt-1">
        <div className="cursor-pointer active:opacity-70 transition-opacity" onClick={() => onNavigate('profileSettings')}>
          <h1 className="text-xl font-extrabold text-uitm-navy tracking-tight">Salam, {user.name.split(' ')[0]}</h1>
          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{user.program} • P{user.part}</p>
        </div>
        <div className="flex gap-1.5">
            <button onClick={() => onNavigate('weeklySummary')} className="p-2.5 bg-gray-50 rounded-xl text-gray-400">
                <Icons.List className="w-4 h-4" />
            </button>
            <button className="relative p-2.5 bg-gray-50 rounded-xl text-gray-400">
                <Icons.Bell className="w-4 h-4" />
                <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-red-500 border-2 border-white rounded-full"></span>
            </button>
        </div>
      </div>

      {/* Week Pulse Card - Compact */}
      <div 
        onClick={() => onNavigate('stressMap')}
        className="relative bg-uitm-navy rounded-[1.75rem] p-6 text-white overflow-hidden shadow-lg cursor-pointer active:scale-[0.98] transition-all group"
      >
        <div className="relative z-10 flex justify-between items-center mb-6">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-black tracking-tighter">W11</span>
              <span className="text-uitm-gold font-black text-[10px] uppercase tracking-widest">Active</span>
            </div>
            <p className="text-blue-200/40 text-[8px] font-black uppercase tracking-widest mt-1">Semester Pulse</p>
          </div>
          <div className="bg-white/10 text-white/80 px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border border-white/5 backdrop-blur-md">
            W13 Peak Alert
          </div>
        </div>
        
        <div className="relative z-10 space-y-2">
          <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-blue-200/50">
            <span>Progress</span>
            <span>W14 Final</span>
          </div>
          <div className="flex gap-1 h-1.5 items-center">
            {[...Array(14)].map((_, i) => (
              <div key={i} className={`flex-1 rounded-full transition-all duration-700 ${i === 10 ? 'h-3 bg-uitm-gold shadow-gold' : i < 10 ? 'h-1 bg-blue-300/30' : 'h-1 bg-white/5'}`}></div>
            ))}
          </div>
        </div>
        
        <div className="absolute top-[-50%] right-[-10%] w-48 h-48 bg-white/5 rounded-full blur-[60px]"></div>
      </div>

      {/* Stats - Compact Grid */}
      <section className="grid grid-cols-3 gap-2">
        <div className="bg-gray-50/50 p-3 rounded-2xl border border-gray-100/50 flex flex-col items-center text-center">
          <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Focus</span>
          <span className="text-xs font-bold text-uitm-navy">4.5h</span>
        </div>
        <div className="bg-gray-50/50 p-3 rounded-2xl border border-gray-100/50 flex flex-col items-center text-center">
          <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Done</span>
          <span className="text-xs font-bold text-uitm-navy">{completionRate}%</span>
        </div>
        <div className="bg-gray-50/50 p-3 rounded-2xl border border-gray-100/50 flex flex-col items-center text-center">
          <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Rank</span>
          <span className="text-xs font-bold text-uitm-gold">#12</span>
        </div>
      </section>

      {/* Next Priority - Very Compact */}
      {nextTask && (
        <section 
          onClick={() => onNavigate('planner')}
          className="bg-white border border-gray-100 p-5 rounded-[1.5rem] shadow-premium relative overflow-hidden group active:scale-[0.98] transition-all cursor-pointer"
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-[8px] font-black text-uitm-navy/40 uppercase tracking-widest flex items-center gap-1.5">
               <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
               Priority
            </span>
            <span className="text-[7px] font-black text-uitm-gold uppercase tracking-widest">Today</span>
          </div>
          <h3 className="text-[13px] font-bold text-uitm-navy tracking-tight mb-2 truncate">{nextTask.title}</h3>
          <div className="flex items-center gap-3 text-[8px] font-black text-gray-400 uppercase tracking-widest">
            <div className="flex items-center gap-1">
               <Icons.Calendar className="w-2.5 h-2.5 opacity-50" />
               <span>{nextTask.dueTime}</span>
            </div>
            <div className="flex items-center gap-1">
               <Icons.CheckCircle className="w-2.5 h-2.5 opacity-50" />
               <span>{nextTask.courseId}</span>
            </div>
          </div>
        </section>
      )}

      {/* Schedule - Clean & Tight */}
      <section className="space-y-3">
        <h3 className="font-bold text-uitm-navy/30 text-[9px] uppercase tracking-[0.2em] ml-1">Today's Timeline</h3>
        <div className="space-y-2">
          {schedule.map((item, idx) => (
            <div key={idx} className="flex items-center gap-4 bg-gray-50/30 p-4 rounded-2xl border border-gray-100/30">
              <div className="w-10 text-center">
                <span className="text-[9px] font-black text-uitm-navy/40 block leading-none mb-1">{item.time.split(' ')[0]}</span>
                <span className="text-[9px] font-black text-gray-300 block leading-none">{item.time.split(' ')[2]}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider ${item.type === 'Lab' ? 'bg-blue-50 text-blue-500' : 'bg-purple-50 text-purple-500'}`}>{item.type}</span>
                  <span className="text-[9px] font-black text-uitm-navy/80 tracking-widest">{item.code}</span>
                </div>
                <h4 className="text-xs font-bold text-gray-800 tracking-tight">{item.code === 'CSC584' ? 'Enterprise Programming' : 'IS Development'}</h4>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="h-6"></div>
    </div>
  );
};

export default Dashboard;
