
import React from 'react';
import { Task, UserProfile } from '../types';
import { Icons } from '../constants';

const WeeklySummary = ({ user, tasks, onBack }: { user: UserProfile, tasks: Task[], onBack: () => void }) => {
  return (
    <div className="p-6 space-y-8 bg-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-gray-50 rounded-xl"><Icons.ArrowRight /></button>
          <h1 className="text-xl font-bold text-uitm-navy">Weekly Summary</h1>
        </div>
        <select className="bg-gray-50 border-none rounded-xl text-xs font-bold px-3 py-2">
          <option>Week 4</option>
          <option>Week 3</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-uitm-navy p-5 rounded-3xl text-white">
          <div className="text-2xl font-bold">12</div>
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Tasks Done</div>
        </div>
        <div className="bg-uitm-gold p-5 rounded-3xl text-white">
          <div className="text-2xl font-bold">2</div>
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Pending</div>
        </div>
      </div>

      <section className="bg-gray-50 p-6 rounded-3xl">
        <h3 className="font-bold text-gray-800 mb-4">AI Highlights</h3>
        <ul className="space-y-4">
          <li className="flex gap-3">
            <div className="text-green-500 pt-1"><Icons.CheckCircle /></div>
            <p className="text-xs text-gray-600 leading-relaxed font-medium">You completed <span className="font-bold text-gray-800">100% of CSC584</span> tasks on time. Great job!</p>
          </li>
          <li className="flex gap-3">
            <div className="text-yellow-500 pt-1"><Icons.Sparkles /></div>
            <p className="text-xs text-gray-600 leading-relaxed font-medium">Next Week (Week 5) shows a <span className="font-bold text-gray-800">20% workload increase</span>. Plan ahead.</p>
          </li>
        </ul>
      </section>

      <section>
        <h3 className="font-bold text-gray-800 mb-4">Self Reflection</h3>
        <textarea 
          placeholder="How did you feel about this week? (e.g. Challenging but productive)"
          className="w-full bg-gray-50 border border-gray-100 rounded-3xl p-4 text-xs font-medium outline-none h-24"
        />
      </section>

      <div className="flex gap-4 opacity-50 pointer-events-none">
        <button className="flex-1 border border-gray-200 py-4 rounded-2xl font-bold text-xs">Export PDF</button>
        <button className="flex-1 border border-gray-200 py-4 rounded-2xl font-bold text-xs">Share</button>
      </div>
    </div>
  );
};

export default WeeklySummary;
