
import React from 'react';
import { UserProfile, Task, Course } from '../types';
import { Icons } from '../constants';

interface Props {
  user: UserProfile;
  tasks: Task[];
  courses: Course[];
  onNavigate: (p: any) => void;
}

const AIPage: React.FC<Props> = ({ user, tasks, courses, onNavigate }) => {
  return (
    <div className="p-6 space-y-8 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-uitm-navy tracking-tight">AI Smart Hub</h1>
        <div className="bg-uitm-gold text-white px-3 py-1 rounded-full text-[10px] font-black">Week {user.currentWeek}/14</div>
      </div>

      {/* NEW: ACTIVE LEARNING CTA */}
      <section className="bg-uitm-gold/10 border border-uitm-gold/20 p-6 rounded-[2.5rem] space-y-4">
        <div className="flex items-center gap-3">
          <Icons.Sparkles className="w-6 h-6 text-uitm-gold" />
          <h3 className="font-black text-uitm-navy text-sm uppercase tracking-widest">Knowledge Check</h3>
        </div>
        <p className="text-xs text-gray-600 font-medium">
          Simulated AI detects a learning gap in <span className="font-black text-uitm-navy">IPS551</span>. Take a quick practice quiz to solidify your Week 10 concepts.
        </p>
        <button 
          onClick={() => onNavigate('notesHub')}
          className="w-full bg-uitm-navy text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-premium active:scale-95 transition-all"
        >
          Generate Practice Quiz
        </button>
      </section>

      {/* Smart Prioritization */}
      <section className="bg-white rounded-[2.5rem] border border-gray-100 shadow-premium p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-uitm-navy text-white rounded-2xl flex items-center justify-center">
            <Icons.Sparkles />
          </div>
          <div>
            <h3 className="font-black text-uitm-navy text-sm uppercase tracking-widest">Smart Priority</h3>
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Simulated Logic</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex gap-4">
            <span className="text-lg font-black text-uitm-gold italic">01</span>
            <div className="flex-1">
              <div className="text-sm font-black text-uitm-navy">CSC584 Final Project</div>
              <p className="text-xs text-gray-400 font-medium">Reason: High credit weight + upcoming Week 13 spike.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <span className="text-lg font-black text-uitm-gold opacity-30 italic">02</span>
            <div className="flex-1">
              <div className="text-sm font-black text-gray-800">ICT502 SOW Lab</div>
              <p className="text-xs text-gray-400 font-medium">Reason: Required foundation for Week 12 project.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stress Insights */}
      <section className="bg-uitm-navy text-white p-8 rounded-[2.5rem] shadow-premium relative overflow-hidden">
        <h3 className="text-sm font-black mb-4 flex items-center gap-2 uppercase tracking-widest">
          <Icons.TrendingUp /> Workload Analysis
        </h3>
        <p className="text-xs leading-relaxed text-blue-100 font-medium opacity-90">
          Your current stress load is <span className="text-uitm-gold font-black">7.5/10</span>. 
          Comparing your tasks to the FSKM ISE Part 4 SOW, Week 12 will be your peak "Critical Window". 
        </p>
        <button className="w-full mt-8 bg-white/10 hover:bg-white/20 text-white text-[10px] py-4 rounded-2xl font-black uppercase tracking-widest transition-colors border border-white/10">
          Refresh AI Brain State
        </button>
        <div className="absolute top-[-20%] right-[-10%] w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
      </section>
    </div>
  );
};

export default AIPage;
