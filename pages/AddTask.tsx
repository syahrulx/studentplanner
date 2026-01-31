
import React, { useState } from 'react';
import { Task, TaskType, Priority, Course } from '../types';
import { Icons } from '../constants';

interface Props {
  courses: Course[];
  onAdd: (task: Task) => void;
  onBack: () => void;
}

const AddTask: React.FC<Props> = ({ courses, onAdd, onBack }) => {
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState(courses[0]?.id || '');
  const [type, setType] = useState<TaskType>(TaskType.Assignment);
  const [dueDate, setDueDate] = useState('2025-01-15');
  const [dueTime, setDueTime] = useState('23:59');
  const [priority, setPriority] = useState<Priority>(Priority.Medium);
  const [effort, setEffort] = useState(4);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = () => {
    if (!title.trim()) return;
    
    setIsSaving(true);
    setTimeout(() => {
      const newTask: Task = {
        id: `t${Date.now()}`,
        title,
        courseId,
        type,
        dueDate,
        dueTime,
        priority,
        effort,
        notes,
        isDone: false,
        deadlineRisk: priority === Priority.High ? 'High' : priority === Priority.Medium ? 'Medium' : 'Low',
        suggestedWeek: 12
      };
      onAdd(newTask);
      onBack();
    }, 800);
  };

  return (
    <div className="min-h-screen pb-32">
      {/* Header */}
      <div className="p-6 flex items-center gap-4">
        <button onClick={onBack} className="p-2 bg-gray-50 rounded-xl">
          <Icons.ArrowRight className="rotate-180 w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-black text-uitm-navy">Add New Task</h1>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Manual Entry</p>
        </div>
      </div>

      {/* Form */}
      <div className="px-6 space-y-5">
        {/* Title */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Task Title *</label>
          <input 
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Final Project Report"
            className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-semibold outline-none focus:border-uitm-navy focus:bg-white transition-all"
          />
        </div>

        {/* Course */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Subject</label>
          <select 
            value={courseId}
            onChange={e => setCourseId(e.target.value)}
            className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-semibold outline-none focus:border-uitm-navy"
          >
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.id} - {c.name}</option>
            ))}
          </select>
        </div>

        {/* Type & Priority Row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Type</label>
            <select 
              value={type}
              onChange={e => setType(e.target.value as TaskType)}
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-semibold outline-none"
            >
              {Object.values(TaskType).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Priority</label>
            <select 
              value={priority}
              onChange={e => setPriority(e.target.value as Priority)}
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-semibold outline-none"
            >
              {Object.values(Priority).map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Due Date & Time Row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Due Date</label>
            <input 
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-semibold outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Time</label>
            <input 
              type="time"
              value={dueTime}
              onChange={e => setDueTime(e.target.value)}
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-semibold outline-none"
            />
          </div>
        </div>

        {/* Effort */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Estimated Effort: {effort} hours</label>
          <input 
            type="range"
            min="1" max="20"
            value={effort}
            onChange={e => setEffort(parseInt(e.target.value))}
            className="w-full accent-uitm-navy"
          />
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Notes (Optional)</label>
          <textarea 
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add any details..."
            rows={3}
            className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-semibold outline-none focus:border-uitm-navy resize-none"
          />
        </div>
      </div>

      {/* Fixed Footer */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white p-6 border-t border-gray-100 shadow-lg">
        <button 
          onClick={handleSubmit}
          disabled={!title.trim() || isSaving}
          className="w-full bg-uitm-navy text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
              </div>
              Adding Task...
            </>
          ) : (
            <>
              <Icons.Plus className="w-5 h-5" />
              Add Task
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default AddTask;
