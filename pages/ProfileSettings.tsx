
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
    <div className="bg-[#F8FAFC] min-h-screen pb-32 animate-slide-in relative">
      {/* 1. HERO: Executive Digital ID */}
      <section className="pt-10 px-6 pb-6 relative z-10">
        <div className="relative w-full bg-uitm-navy rounded-[2.5rem] p-7 text-white shadow-xl overflow-hidden border border-white/5">
          {/* Very Subtle Decorative Glow */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-uitm-gold opacity-[0.05] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          
          <div className="relative z-10 flex flex-col gap-5">
            <div className="flex justify-between items-start">
               {/* Photo Initials */}
               <div className="w-16 h-16 rounded-2xl bg-white/10 p-1 ring-1 ring-white/10">
                  <div className="w-full h-full rounded-xl bg-white flex items-center justify-center shadow-inner">
                     <span className="text-xl font-black text-uitm-navy tracking-tighter">
                       {user.name.split(' ').map(n => n[0]).join('')}
                     </span>
                  </div>
               </div>
               
               {/* Metadata Column */}
               <div className="flex flex-col items-end">
                  <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.3em] mb-1">Status</span>
                  <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-full border border-white/5 ring-1 ring-white/5">
                     <div className="w-1 h-1 bg-green-400 rounded-full animate-pulse"></div>
                     <span className="text-[8px] font-black uppercase tracking-widest text-white/80">Active</span>
                  </div>
               </div>
            </div>

            <div className="space-y-3">
               <h1 className="text-2xl font-black text-white tracking-tight leading-none">{user.name}</h1>
               
               <div className="flex items-center gap-6">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[7px] font-black uppercase tracking-[0.2em] text-white/30">Matrix Number</span>
                    <span className="text-[10px] font-bold tracking-widest text-white/90">{user.studentId}</span>
                  </div>
                  <div className="w-[1px] h-6 bg-white/10"></div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[7px] font-black uppercase tracking-[0.2em] text-white/30">Program Code</span>
                    <span className="text-[10px] font-bold tracking-widest text-white/90">{user.program}</span>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. PROGRESS: Level Bar */}
      <section className="px-6 mb-8">
         <div className="bg-white rounded-[2.5rem] p-5 shadow-sm border border-gray-100 flex flex-col gap-3">
            <div className="flex justify-between items-end">
                <div className="flex items-center gap-2">
                    <Icons.Sparkles className="w-3.5 h-3.5 text-uitm-gold" />
                    <span className="text-[10px] font-black text-uitm-navy uppercase tracking-widest">Scholar Level 5</span>
                </div>
                <span className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">65% Progress</span>
            </div>
            <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden ring-1 ring-gray-100">
                <div className="h-full bg-uitm-navy w-[65%] rounded-full shadow-sm shadow-blue-900/10"></div>
            </div>
         </div>
      </section>

      {/* 3. PERFORMANCE STATS: Horizontal Grid */}
      <section className="mb-8 overflow-hidden">
        <h3 className="px-8 text-[9px] font-black text-[#8E9AAF] uppercase tracking-[0.3em] mb-4">Performance Metrics</h3>
        <div className="flex gap-4 overflow-x-auto no-scrollbar px-6">
           {/* Rank Badge */}
           <div className="min-w-[150px] bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col gap-4">
              <div className="flex justify-between items-center">
                 <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-orange-500 shadow-sm shadow-orange-100">
                    <Icons.TrendingUp className="w-4 h-4" />
                 </div>
                 <span className="text-[8px] font-black text-green-500 bg-green-50 px-2 py-1 rounded-md border border-green-100">+3</span>
              </div>
              <div>
                 <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Class Rank</p>
                 <p className="text-2xl font-black text-uitm-navy tracking-tighter">#02</p>
              </div>
           </div>

           {/* CGPA Badge */}
           <div className="min-w-[150px] bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col gap-4">
              <div className="flex justify-between items-center">
                 <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-500 shadow-sm shadow-purple-100">
                    <Icons.CheckCircle className="w-4 h-4" />
                 </div>
                 <span className="text-[8px] font-black text-purple-500 bg-purple-50 px-2 py-1 rounded-md border border-purple-100">Top 5%</span>
              </div>
              <div>
                 <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">CGPA Est.</p>
                 <p className="text-2xl font-black text-uitm-navy tracking-tighter">3.85</p>
              </div>
           </div>

            {/* Tasks Badge */}
           <div className="min-w-[150px] bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col gap-4">
              <div className="flex justify-between items-center">
                 <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500 shadow-sm shadow-blue-100">
                    <Icons.List className="w-4 h-4" />
                 </div>
                 <span className="text-[8px] font-black text-blue-500 bg-blue-50 px-2 py-1 rounded-md border border-blue-100">Optimal</span>
              </div>
              <div>
                 <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Tasks Done</p>
                 <p className="text-2xl font-black text-uitm-navy tracking-tighter">{tasks.filter(t => t.isDone).length}</p>
              </div>
           </div>
        </div>
      </section>

      {/* 4. SETTINGS: Unified App Grid */}
      <section className="px-6 mb-10">
         <h3 className="text-[9px] font-black text-[#8E9AAF] uppercase tracking-[0.3em] mb-4">Account Controls</h3>
         <div className="grid grid-cols-2 gap-4">
            <SettingsButton icon={Icons.Settings} label="Workflow" sub="AI Config" />
            <SettingsButton icon={Icons.Share} label="Export" sub="PDF / CSV" />
            <SettingsButton 
              icon={Icons.HelpCircle} 
              label="Support" 
              sub="Tutorial" 
              onClick={() => { localStorage.removeItem('hasSeenTutorial'); onNavigate('startTutorial'); }}
            />
            <SettingsButton icon={Icons.Lock} label="Security" sub="Password" />
         </div>
      </section>

      {/* 5. ACTION: Sign Out */}
      <section className="px-6">
         <button 
           onClick={() => onNavigate('login')}
           className="w-full bg-white text-red-500 rounded-[2rem] py-5 font-black text-[10px] uppercase tracking-[0.2em] border border-gray-200 shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-3 hover:bg-red-50 hover:border-red-100"
         >
           <Icons.User className="w-3.5 h-3.5" />
           <span>Deactivate Session</span>
         </button>
      </section>
    </div>
  );
};

const SettingsButton = ({ icon: Icon, label, sub, onClick }: any) => (
  <button 
    onClick={onClick}
    className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col items-start gap-4 active:scale-[0.98] transition-all hover:border-uitm-navy group"
  >
     <div className="w-10 h-10 bg-gray-50 rounded-2xl flex items-center justify-center text-uitm-navy group-hover:bg-uitm-navy group-hover:text-white transition-all shadow-inner">
        <Icon className="w-5 h-5" />
     </div>
     <div>
        <span className="block text-[10px] font-black text-uitm-navy uppercase tracking-widest mb-0.5">{label}</span>
        <span className="block text-[8px] font-bold text-gray-300 uppercase tracking-widest">{sub}</span>
     </div>
  </button>
);

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
