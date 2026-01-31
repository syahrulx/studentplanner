
import React, { useState } from 'react';
import { Task, TaskType, Priority } from '../types';
import { Icons } from '../constants';

interface Props {
  task: Task | null;
  onBack: () => void;
  onUpdate: (t: Task) => void;
  onToggleDone: () => void;
  onDelete: () => void;
}

const TaskDetails: React.FC<Props> = ({ task, onBack, onToggleDone, onDelete }) => {
  if (!task) return null;

  return (
    <div className="p-6 space-y-8 bg-white min-h-full">
      <header className="flex items-center justify-between">
        <button onClick={onBack} className="p-3 bg-gray-50 rounded-2xl text-gray-600 hover:bg-gray-100 transition-all">
          <Icons.ArrowRight className="rotate-180" />
        </button>
        <div className="text-center">
           <p className="text-[9px] font-black text-uitm-gold uppercase tracking-widest">Task ID: {task.id.slice(0, 4)}</p>
        </div>
        <button className="p-3 bg-gray-50 rounded-2xl text-gray-600">
            <Icons.Settings />
        </button>
      </header>

      <div className="space-y-8">
        <div className="space-y-3">
          <div className="flex gap-2">
            <span className="bg-uitm-navy text-white text-[9px] px-3 py-1 rounded-full font-black uppercase tracking-wider">
                {task.courseId}
            </span>
            <span className="bg-gray-100 text-gray-500 text-[9px] px-3 py-1 rounded-full font-black uppercase tracking-wider">
                {task.type}
            </span>
          </div>
          <h2 className="text-3xl font-black text-uitm-navy leading-tight tracking-tight">{task.title}</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <InfoBox label="DUE DATE" value={task.dueDate} icon={<Icons.Calendar />} />
          <InfoBox label="PRIORITY" value={task.priority} color={task.priority === Priority.High ? 'text-red-500' : 'text-uitm-gold'} />
          <InfoBox label="DEADLINE" value={task.dueTime} icon={<Icons.Bell />} />
          <InfoBox label="EST. EFFORT" value={`${task.effort} Hours`} />
        </div>

        {/* AI Deadline Risk Analysis */}
        <div className={`rounded-[2rem] p-6 text-white shadow-premium ${task.deadlineRisk === 'High' ? 'bg-red-500' : 'bg-uitm-navy'}`}>
          <div className="flex items-center gap-2 mb-4">
            <Icons.Sparkles />
            <h3 className="font-black uppercase text-[10px] tracking-widest">AI Safety Assessment: {task.deadlineRisk} RISK</h3>
          </div>
          <p className="text-xs leading-relaxed opacity-90 font-medium">
            {task.deadlineRisk === 'High' 
              ? "Critical collision detected. This deadline falls within the Week 11-13 SOW workload surge. Week 13 shows peak stress for CSC584 and IPS551. Start now to avoid burnout."
              : "Safe window confirmed. Current Week 11 workload is manageable. Completing this early gives you buffer before the Week 13 critical peak."}
          </p>
        </div>

        {/* Source Content */}
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">WhatsApp Extraction Source</h3>
                <span className="text-[9px] font-bold text-green-500 uppercase tracking-widest flex items-center gap-1">
                    <div className="w-1 h-1 bg-green-500 rounded-full"></div> Verified by AI
                </span>
            </div>
            <div className="bg-gray-50 p-6 rounded-[2rem] border border-gray-100 text-sm text-gray-500 italic leading-relaxed relative">
                <div className="absolute -top-3 left-6 px-3 py-1 bg-white border border-gray-100 rounded-full text-[8px] font-black text-gray-400 uppercase">Message Log</div>
                "{task.sourceMessage || 'Assalammualaikum students. Sila hantar Lab 4 sebelum Jumaat ni jam 11:59PM. Make sure follow format normalization yang saya ajar tadi. TQ.'}"
            </div>
        </div>

        <div className="flex gap-4 pt-6">
          <button className="p-5 bg-gray-50 text-gray-600 rounded-3xl transition-all hover:bg-gray-100 active:scale-90">
             <Icons.Share />
          </button>
          <button 
            onClick={onDelete}
            className="p-5 bg-red-50 text-red-500 rounded-3xl transition-all hover:bg-red-100 active:scale-90"
          >
             <Icons.Plus className="rotate-45" />
          </button>
          <button 
            onClick={onToggleDone}
            className={`flex-1 py-5 rounded-3xl font-black text-white shadow-premium transition-all active:scale-95 ${task.isDone ? 'bg-gray-400' : 'bg-uitm-navy'}`}
          >
            {task.isDone ? 'Task Completed' : 'Mark as Done'}
          </button>
        </div>
      </div>
    </div>
  );
};

const InfoBox = ({ label, value, icon, color }: any) => (
  <div className="bg-gray-50 p-5 rounded-3xl border border-gray-100/50">
    <div className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1.5">{label}</div>
    <div className={`text-sm font-extrabold flex items-center gap-2 ${color || 'text-uitm-navy'}`}>
      {icon && <span className="opacity-40">{icon}</span>} {value}
    </div>
  </div>
);

export default TaskDetails;
