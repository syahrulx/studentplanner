
import React from 'react';
import { UserProfile } from '../types';
import { Icons } from '../constants';

interface Props {
  user: UserProfile;
  setUser: (u: UserProfile) => void;
  onNavigate: (p: any) => void;
}

const ProfileSettings: React.FC<Props> = ({ user, setUser, onNavigate }) => {
  return (
    <div className="bg-white min-h-screen pb-32 animate-slide-in">
      {/* Premium Header Card */}
      <div className="relative pt-12 pb-24 px-6 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-uitm-navy z-0">
          <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-uitm-gold/20 rounded-full blur-[80px]"></div>
          <div className="absolute bottom-[-10%] left-[-5%] w-48 h-48 bg-blue-400/10 rounded-full blur-[60px]"></div>
          {/* Subtle Geometric Pattern Overlay */}
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
        </div>

        <div className="relative z-10 flex flex-col items-center text-center space-y-4">
          <div className="relative">
            <div className="w-28 h-28 bg-white rounded-[2.5rem] shadow-2xl flex items-center justify-center p-1">
              <div className="w-full h-full bg-gray-50 rounded-[2.2rem] flex items-center justify-center text-uitm-navy">
                 <span className="text-3xl font-black tracking-tighter">
                   {user.name.split(' ').map(n => n[0]).join('')}
                 </span>
              </div>
            </div>
            <button className="absolute bottom-1 right-1 bg-uitm-gold text-white p-2.5 rounded-2xl shadow-lg border-4 border-uitm-navy active:scale-90 transition-transform">
              <Icons.Plus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-white tracking-tight">{user.name}</h1>
            <p className="text-blue-200/60 text-[10px] font-black uppercase tracking-[0.2em]">{user.studentId}</p>
          </div>
        </div>
      </div>

      {/* Main Content Area - Shifted Up */}
      <div className="px-6 -mt-12 relative z-20 space-y-6">
        
        {/* Academic Identity Card */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-premium border border-gray-100 space-y-6">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[9px] font-black text-uitm-gold uppercase tracking-[0.2em]">Primary Program</span>
              <h2 className="text-sm font-black text-uitm-navy leading-tight max-w-[180px]">{user.program}</h2>
            </div>
            <div className="bg-uitm-navy text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">
              Part {user.part}
            </div>
          </div>

          {/* Semester Progress Visualization */}
          <div className="space-y-3 pt-2">
            <div className="flex justify-between items-end">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Semester Progress</span>
              <span className="text-[10px] font-black text-uitm-navy uppercase tracking-widest">W{user.currentWeek} of 14</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden flex gap-1 p-0.5">
              {[...Array(14)].map((_, i) => (
                <div 
                  key={i} 
                  className={`flex-1 rounded-full transition-all duration-1000 ${i < user.currentWeek ? 'bg-uitm-navy' : i === user.currentWeek - 1 ? 'bg-uitm-gold' : 'bg-gray-200 opacity-40'}`}
                ></div>
              ))}
            </div>
          </div>
          
          {/* Quick Academic Stats */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-50">
            <div className="space-y-1">
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Academic Status</span>
              <p className="text-xs font-black text-green-600 uppercase tracking-tight">Active / Good Standing</p>
            </div>
            <div className="space-y-1 text-right">
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Faculty Hub</span>
              <p className="text-xs font-black text-uitm-navy uppercase tracking-tight">FSKM Shah Alam</p>
            </div>
          </div>
        </div>

        {/* Settings Groups */}
        <div className="space-y-8 pt-4">
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-4">Semester Configuration</h3>
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
              <MenuLink icon={<Icons.Calendar className="text-blue-500" />} label="Academic Calendar" value={`Week ${user.currentWeek}`} />
              <div className="h-px bg-gray-50 mx-8"></div>
              <MenuLink icon={<Icons.TrendingUp className="text-orange-500" />} label="SOW Workload Map" value="Manual" />
              <div className="h-px bg-gray-50 mx-8"></div>
              <MenuLink icon={<Icons.Bell className="text-purple-500" />} label="Reminder Intervals" value="Every 2h" />
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-4">AI Preferences</h3>
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
              <MenuLink icon={<Icons.Sparkles className="text-uitm-gold" />} label="Simulated Brain Logic" value="High Precision" />
              <div className="h-px bg-gray-50 mx-8"></div>
              <MenuLink icon={<Icons.MessageCircle className="text-green-500" />} label="WhatsApp Parser" value="Active" />
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-red-400 uppercase tracking-[0.2em] ml-4">Account Security</h3>
            <div className="bg-red-50/50 rounded-[2.5rem] border border-red-100/30 overflow-hidden">
              <button className="w-full px-8 py-6 flex items-center justify-between active:bg-red-50 transition-colors text-left group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-red-500 shadow-sm border border-red-100">
                    <Icons.Settings className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-black text-red-600 tracking-tight">Reset Academic Data</span>
                </div>
                <Icons.ArrowRight className="text-red-200 group-hover:text-red-500 transition-colors" />
              </button>
              <div className="h-px bg-red-100/30 mx-8"></div>
              <button className="w-full px-8 py-6 flex items-center justify-between active:bg-red-100 transition-colors text-left">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-gray-400 shadow-sm">
                    <Icons.User className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-black text-gray-500 tracking-tight">Sign Out</span>
                </div>
              </button>
            </div>
          </section>
        </div>

        {/* Branding Footer */}
        <div className="text-center py-10 space-y-2">
          <p className="text-[9px] text-gray-300 font-black uppercase tracking-[0.3em]">Studly • v1.2.4</p>
          <div className="flex justify-center items-center gap-1.5 grayscale opacity-30">
             <div className="w-4 h-4 bg-uitm-navy rounded-sm"></div>
             <div className="w-4 h-4 bg-uitm-gold rounded-sm"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MenuLink = ({ icon, label, value }: any) => (
  <button className="w-full px-8 py-6 flex items-center justify-between active:bg-gray-50 transition-all text-left group">
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <span className="text-sm font-black text-uitm-navy tracking-tight">{label}</span>
    </div>
    <div className="flex items-center gap-3">
      {value && <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{value}</span>}
      <Icons.ArrowRight className="text-gray-200 group-hover:text-uitm-navy group-hover:translate-x-1 transition-all" />
    </div>
  </button>
);

export default ProfileSettings;
