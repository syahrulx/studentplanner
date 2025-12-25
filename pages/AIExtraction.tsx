
import React, { useState, useEffect } from 'react';
import { Icons } from '../constants';
import { Task, TaskType, Priority, Course } from '../types';

interface Props {
  sourceMessage: string;
  courses: Course[];
  onAdd: (task: Task) => void;
  onCancel: () => void;
}

const AIExtraction: React.FC<Props> = ({ sourceMessage, courses, onAdd, onCancel }) => {
  const [loading, setLoading] = useState(true);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [formData, setFormData] = useState<Partial<Task>>({
    title: 'Lab 4 - Normalization Study',
    courseId: 'IPS551',
    type: TaskType.Lab,
    dueDate: '2024-05-24',
    dueTime: '23:59',
    priority: Priority.High,
    effort: 4,
    notes: 'Follow the specific ERD to Normalization mapping taught in Week 10.'
  });

  const analysisSteps = [
    "Identifying keywords...",
    "Detecting course code (FSKM/ISE)...",
    "Mapping deadline to Semester Week...",
    "Analyzing SOW risk factors..."
  ];

  useEffect(() => {
    let step = 0;
    const interval = setInterval(() => {
      if (step < analysisSteps.length - 1) {
        step++;
        setAnalysisStep(step);
      } else {
        clearInterval(interval);
        setLoading(false);
      }
    }, 600);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-12 text-center space-y-10 animate-pulse">
        <div className="relative">
          <div className="w-24 h-24 border-4 border-gray-50 border-t-uitm-navy rounded-[2.5rem] animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center text-uitm-navy">
            <Icons.Sparkles className="w-8 h-8" />
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-black text-uitm-navy uppercase tracking-widest">Brain Processing</h2>
          <p className="text-xs text-uitm-gold font-black uppercase tracking-widest transition-all duration-300">{analysisSteps[analysisStep]}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 pb-24 animate-slide-in">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-black text-uitm-navy tracking-tight">AI Audit</h1>
        <div className="flex items-center gap-2 bg-green-50 px-4 py-2 rounded-full border border-green-100">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
          <span className="text-[10px] font-black text-green-700 uppercase tracking-widest">98% Accuracy</span>
        </div>
      </div>

      {/* Message Context */}
      <div className="relative group">
        <div className="absolute -top-3 left-6 bg-white px-3 py-1 text-[8px] font-black text-gray-400 uppercase tracking-widest border border-gray-100 rounded-full z-10 shadow-sm">WhatsApp Raw Input</div>
        <div className="bg-gray-50 p-8 rounded-[2.5rem] border border-gray-100 italic text-xs text-gray-500 leading-relaxed group-hover:bg-gray-100 transition-colors">
          "{sourceMessage || 'Assalammualaikum students. Sila hantar Lab 4 sebelum Jumaat ni jam 11:59PM. TQ.'}"
        </div>
      </div>

      {/* Refined Form Area */}
      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Task Title</label>
          <input 
            value={formData.title}
            onChange={e => setFormData({...formData, title: e.target.value})}
            className="w-full bg-white border border-gray-100 rounded-2xl p-5 text-sm font-bold shadow-sm focus:border-uitm-navy outline-none transition-all"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Course ID</label>
            <select className="w-full bg-white border border-gray-100 rounded-2xl p-5 text-sm font-bold shadow-sm outline-none">
              {courses.map(c => <option key={c.id} selected={c.id === formData.courseId}>{c.id}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Category</label>
            <select className="w-full bg-white border border-gray-100 rounded-2xl p-5 text-sm font-bold shadow-sm outline-none">
              {Object.values(TaskType).map(t => <option key={t} selected={t === formData.type}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Due Date</label>
            <input type="date" value={formData.dueDate} className="w-full bg-white border border-gray-100 rounded-2xl p-5 text-sm font-bold shadow-sm outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Target Time</label>
            <input type="time" value={formData.dueTime} className="w-full bg-white border border-gray-100 rounded-2xl p-5 text-sm font-bold shadow-sm outline-none" />
          </div>
        </div>
      </div>

      {/* Critical Insight Affordance */}
      <div className="bg-uitm-navy rounded-[2.5rem] p-8 text-white shadow-premium relative overflow-hidden">
        <div className="relative z-10 flex items-center gap-4 mb-5">
           <div className="p-3 bg-white/10 rounded-2xl"><Icons.Sparkles className="w-5 h-5 text-uitm-gold" /></div>
           <h3 className="text-sm font-black uppercase tracking-widest">SOW Workload Match</h3>
        </div>
        <div className="relative z-10 flex justify-between items-center mb-4">
          <span className="text-[10px] font-bold text-blue-200 uppercase tracking-widest">Collision Risk</span>
          <span className="text-xs font-black text-red-400 uppercase tracking-widest">HIGH (Week 13 Proximity)</span>
        </div>
        <p className="relative z-10 text-xs leading-relaxed text-blue-100 opacity-90 font-medium">
          Completing this <span className="text-white font-black underline decoration-uitm-gold">Normalization Study</span> in Week 11 is vital. If delayed to Week 12, it will overlap with your Enterprise Programming finale. 
        </p>
        <div className="absolute top-[-20%] right-[-10%] w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
      </div>

      {/* Primary Action Stack */}
      <div className="flex gap-4 pt-4">
        <button onClick={onCancel} className="flex-1 bg-gray-50 border border-gray-100 py-5 rounded-[1.5rem] font-black text-gray-400 uppercase tracking-widest text-[10px] active:scale-95 transition-all">Discard</button>
        <button 
          onClick={() => onAdd({
            ...formData as Task,
            id: Math.random().toString(),
            isDone: false,
            deadlineRisk: 'High',
            suggestedWeek: 11,
            sourceMessage
          })}
          className="flex-[2] bg-uitm-navy text-white py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-[11px] shadow-premium active:scale-95 transition-all"
        >
          Confirm & Schedule
        </button>
      </div>
    </div>
  );
};

export default AIExtraction;
