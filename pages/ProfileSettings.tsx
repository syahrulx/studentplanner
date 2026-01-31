
import React from 'react';
import { UserProfile, Task } from '../types';
import { Icons } from '../constants';

const StatCard = ({ icon: Icon, label, value, sublabel }: { icon: any, label: string, value: string, sublabel?: string }) => (
  <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm flex flex-col gap-3 transition-all active:scale-95 group">
    <div className="flex justify-between items-start">
      <div className="w-10 h-10 rounded-2xl bg-uitm-navy/5 flex items-center justify-center text-uitm-navy group-hover:bg-uitm-navy group-hover:text-white transition-colors">
        <Icon className="w-5 h-5" />
      </div>
      {sublabel && <span className="text-[8px] font-black text-green-500 uppercase tracking-widest">{sublabel}</span>}
    </div>
    <div>
      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-xl font-black text-uitm-navy tracking-tight">{value}</p>
    </div>
  </div>
);

interface Props {
  user: UserProfile;
  tasks: Task[];
  setUser: (u: UserProfile) => void;
  onNavigate: (p: any) => void;
}

const ProfileSettings: React.FC<Props> = ({ user, tasks, setUser, onNavigate }) => {
  const pendingTasks = tasks.filter(t => !t.isDone);
  const completionRate = Math.round(((tasks.length - pendingTasks.length) / (tasks.length || 1)) * 100);

  return (
    <div className="bg-[#F8FAFC] min-h-screen pb-32 animate-slide-in">
      {/* 1. Premium Hero Identity */}
      <section className="relative pt-16 pb-32 px-6 overflow-hidden bg-uitm-navy">
        {/* Abstract Background Accents */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-uitm-gold opacity-10 blur-[100px] -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500 opacity-5 blur-[80px] translate-y-1/2 -translate-x-1/2"></div>
        
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-24 h-24 rounded-[2.5rem] bg-white/10 backdrop-blur-md p-1.5 mb-6 ring-1 ring-white/20">
            <div className="w-full h-full rounded-[2.2rem] bg-white flex items-center justify-center shadow-2xl">
              <span className="text-2xl font-black text-uitm-navy tracking-tighter">
                {user.name.split(' ').map(n => n[0]).join('')}
              </span>
            </div>
          </div>
          
          <h1 className="text-2xl font-black text-white tracking-tight mb-1">{user.name}</h1>
          <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em] mb-4">ID: {user.studentId}</p>
          
          <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 shadow-lg">
             <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
             <span className="text-[10px] font-black text-white/80 uppercase tracking-widest">{user.program.split('-')[0]} • PART {user.part}</span>
          </div>
        </div>
      </section>

      {/* 2. Main Stats Board */}
      <section className="px-6 -mt-16 relative z-20">
        <div className="grid grid-cols-2 gap-4">
          <StatCard icon={Icons.List} label="Active Tasks" value={pendingTasks.length.toString()} sublabel="Priority" />
          <StatCard icon={Icons.CheckCircle} label="Completion" value={`${completionRate}%`} sublabel="On Track" />
          <StatCard icon={Icons.TrendingUp} label="Class Rank" value="#02" sublabel="+3 Places" />
          <StatCard icon={Icons.Calendar} label="Current Week" value={user.currentWeek.toString()} sublabel="Semester 1" />
        </div>
      </section>

      {/* 3. Detailed Progress */}
      <section className="px-6 mt-8 space-y-4">
        <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm space-y-6">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[9px] font-black text-uitm-gold uppercase tracking-[0.2em] mb-1">Semester Pulse</p>
              <h3 className="text-base font-black text-uitm-navy tracking-tight">Academic Journey</h3>
            </div>
            <div className="text-right">
               <span className="text-xl font-black text-uitm-navy tracking-tight">{Math.round((user.currentWeek/14)*100)}%</span>
               <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Completed</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="h-4 bg-gray-50 rounded-2xl p-1 flex gap-1 ring-1 ring-gray-100">
               {[...Array(14)].map((_, i) => (
                  <div 
                    key={i} 
                    className={`flex-1 rounded-xl transition-all duration-1000 ${i < user.currentWeek ? 'bg-uitm-navy shadow-sm' : i === user.currentWeek ? 'bg-uitm-gold animate-pulse' : 'bg-gray-200/50'}`}
                  ></div>
               ))}
            </div>
            <div className="flex justify-between px-1">
               <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">START</span>
               <span className="text-[8px] font-black text-uitm-gold uppercase tracking-widest">WEEK {user.currentWeek}</span>
               <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">FINALS</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Configuration Hub */}
      <section className="px-6 mt-8 space-y-8">
        <div>
          <h3 className="text-[10px] font-black text-[#8E9AAF] uppercase tracking-[0.2em] ml-4 mb-4">Academic Controls</h3>
          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
            <MenuLink icon={Icons.Settings} label="Configure Workflow" value="Active" />
            <MenuLink icon={Icons.Share} label="Export Progress" value="PDF/CSV" />
            <div onClick={() => { localStorage.removeItem('hasSeenTutorial'); onNavigate('startTutorial'); }}>
              <MenuLink icon={Icons.Sparkles} label="Re-run Guide" value="Tutorial" />
            </div>
          </div>
        </div>

        <div>
           <button 
             onClick={() => onNavigate('login')}
             className="w-full bg-red-50 text-red-500 rounded-[2rem] py-5 font-black text-xs uppercase tracking-[0.2em] border border-red-100 active:scale-95 transition-all flex items-center justify-center gap-3"
           >
             <Icons.User className="w-4 h-4" />
             Sign Out Account
           </button>
        </div>
      </section>

      {/* Branding */}
      <div className="text-center mt-12 mb-8">
        <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.3em]">STUDLY INTELLIGENCE</p>
      </div>
    </div>
  );
};

const MenuLink = ({ icon: Icon, label, value }: any) => (
  <button className="w-full px-8 py-6 flex items-center justify-between active:bg-gray-50 transition-all text-left group">
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center group-hover:bg-uitm-navy group-hover:text-white transition-all shadow-sm">
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-sm font-black text-uitm-navy tracking-tight">{label}</span>
    </div>
    <div className="flex items-center gap-3">
      {value && <span className="text-[10px] font-black text-uitm-gold uppercase tracking-widest">{value}</span>}
      <Icons.ArrowRight className="text-gray-200 group-hover:text-uitm-navy group-hover:translate-x-1 transition-all" />
    </div>
  </button>
);

export default ProfileSettings;
