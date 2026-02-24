
import React from 'react';
import { UserProfile, Task, Priority } from '../types';
import { Icons } from '../constants';

const QuickShortcut = ({ icon: Icon, label, color, onClick }: { icon: any, label: string, color: string, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className="flex flex-col items-center gap-2 transition-transform active:scale-90"
  >
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${color}`}>
      <Icon className="w-6 h-6" />
    </div>
    <span className="text-[10px] font-black uppercase tracking-widest text-[#8E9AAF]">{label}</span>
  </button>
);


interface Props {
  user: UserProfile;
  tasks: Task[];
  onNavigate: (p: any) => void;
  onTutorialStep?: (step: number) => void;
}

const Dashboard: React.FC<Props> = ({ user, tasks, onNavigate, onTutorialStep }) => {
  const pendingTasks = tasks.filter(t => !t.isDone);
  const highPriorityTasks = pendingTasks
    .filter(t => t.priority === Priority.High)
    .sort((a, b) => new Date(a.dueDate + 'T' + a.dueTime).getTime() - new Date(b.dueDate + 'T' + b.dueTime).getTime());
  
  const nextTask = highPriorityTasks.length > 0 ? highPriorityTasks[0] : pendingTasks[0];
  const completionRate = Math.round(((tasks.length - pendingTasks.length) / (tasks.length || 1)) * 100);

  const getUrgencyLabel = (task: Task) => {
    if (task.dueDate === '2024-12-26') return 'DUE TODAY';
    if (task.dueDate === '2024-12-27') return 'DUE TOMORROW';
    return `DUE ${task.dueDate.split('-')[1]}/${task.dueDate.split('-')[2]}`;
  };

  const schedule = [
    { time: '12:00', code: 'ISP573', room: 'Online Submission', type: 'DEADLINE', name: 'Case Study Analysis' },
    { time: '17:00', code: 'LCC401', room: 'Online Submission', type: 'DEADLINE', name: 'Critical Reading Exercise' }
  ];

  return (
    <div className="min-h-screen pb-32 animate-slide-in relative flex flex-col gap-6">
      {/* 1. Command Header */}
      <header className="px-6 pt-10 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-uitm-navy tracking-tight leading-none mb-1">
            Hi, {user.name.split(' ')[0]}
          </h1>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-[9px] font-black text-[#8E9AAF] uppercase tracking-widest">Part {user.part} • Active Session</span>
          </div>
        </div>
        <div className="bg-uitm-navy text-white px-4 py-2 rounded-2xl shadow-premium flex items-center gap-3">
          <button 
            onClick={() => onNavigate('stressMap')}
            className="text-xs font-black tracking-tight active:scale-95 transition-all outline-none"
          >
            Week {user.currentWeek}
          </button>
          <div className="w-[1px] h-3 bg-white/20"></div>
          <button 
            onClick={() => onNavigate('profileSettings')}
            className="cursor-pointer active:scale-90 transition-all outline-none"
          >
            <Icons.User className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. Today's Focus Hero */}
      <section className="px-6">
        <div 
          onClick={() => onNavigate('planner')}
          className="bg-uitm-navy rounded-[2.5rem] p-5 text-white overflow-hidden shadow-2xl relative group cursor-pointer active:scale-[0.98] transition-all"
        >
          {/* Subtle Glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-uitm-gold opacity-10 blur-[80px]"></div>
          
          <div className="relative z-10">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[9px] font-black text-uitm-gold uppercase tracking-[0.3em]">Today's Focus</span>
              <div className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/5">
                <span className="text-[9px] font-black text-white/80 uppercase tracking-widest">{nextTask ? getUrgencyLabel(nextTask) : 'No Tasks'}</span>
              </div>
            </div>

            {nextTask ? (
              <>
                <h2 className="text-xl font-black tracking-tight leading-tight mb-3 line-clamp-2">
                  {nextTask.title}
                </h2>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 opacity-60">
                    <Icons.CheckCircle className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-black tracking-widest uppercase">{nextTask.courseId}</span>
                  </div>
                  <div className="w-1 h-1 bg-white/20 rounded-full"></div>
                  <div className="flex items-center gap-1.5 opacity-60">
                    <Icons.Calendar className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-black tracking-widest uppercase">{nextTask.dueTime}</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-white/40 text-sm font-black italic">Ready for a fresh start!</p>
            )}
          </div>
        </div>
      </section>


      {/* 4. Quick Actions - Monochromatic & Professional */}
      <section className="px-6 grid grid-cols-3 gap-4">
        <QuickShortcut icon={Icons.Layers} label="Flashcard" color="bg-white border border-gray-200 text-uitm-navy" onClick={() => onNavigate('flashcardReview')} />
        <QuickShortcut icon={Icons.CheckCircle} label="Quiz" color="bg-white border border-gray-200 text-uitm-navy" onClick={() => onNavigate('quizConfig')} />
        <QuickShortcut icon={Icons.TrendingUp} label="Ranking" color="bg-white border border-gray-200 text-uitm-navy" onClick={() => onNavigate('leaderboard')} />
      </section>

      {/* 5. Micro-Timeline */}
      <section className="px-6 space-y-4">
        <div className="flex justify-between items-center ml-2">
           <h3 className="font-black text-[#8E9AAF] text-[10px] uppercase tracking-[0.2em]">Live Timeline</h3>
           <span className="text-[8px] font-black text-uitm-gold uppercase tracking-widest">DEC 26</span>
        </div>
        
        <div className="space-y-4 relative ml-3">
          {/* Line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-[1px] bg-gray-200"></div>
          
          {schedule.map((item, idx) => (
            <div key={idx} className="flex gap-6 relative transition-all active:scale-[0.98]">
              <div className="w-4 h-4 rounded-full bg-white border-2 border-uitm-navy z-10 mt-1 shadow-sm"></div>
              <div className="flex-1 bg-white border border-gray-400 p-4 rounded-3xl shadow-sm">
                <div className="flex justify-between items-start mb-1">
                   <span className="text-[9px] font-black text-uitm-navy uppercase tracking-widest">{item.time}</span>
                   <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${item.type === 'DEADLINE' ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-blue-50 text-blue-500'}`}>
                      {item.type}
                   </span>
                </div>
                <h4 className="text-xs font-black text-[#1A1C1E] tracking-tight">{item.name}</h4>
                <p className="text-[9px] font-black text-[#8E9AAF] uppercase tracking-widest mt-1 opacity-60">{item.code} • {item.room}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="h-4"></div>
    </div>
  );
};

export default Dashboard;
