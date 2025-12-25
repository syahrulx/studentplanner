
import React, { useState, useMemo } from 'react';
import { Task, Course, Priority } from '../types';
import { Icons } from '../constants';

interface Props {
  tasks: Task[];
  courses: Course[];
  onSelectTask: (t: Task) => void;
  onNavigate: (p: any) => void;
  onToggleTask: (id: string) => void;
}

const Planner: React.FC<Props> = ({ tasks, courses, onSelectTask, onNavigate, onToggleTask }) => {
  const [activeDate, setActiveDate] = useState(20);
  const [view, setView] = useState<'week' | 'month'>('week');

  const weekDays = [
    { label: 'M', date: 20 }, { label: 'T', date: 21 }, { label: 'W', date: 22 },
    { label: 'T', date: 23 }, { label: 'F', date: 24 }, { label: 'S', date: 25 }, { label: 'S', date: 26 }
  ];

  const monthDays = useMemo(() => {
    const days = [];
    // May 2024 starts on a Wednesday
    days.push(null, null); 
    for (let i = 1; i <= 31; i++) days.push(i);
    return days;
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const day = parseInt(t.dueDate.split('-')[2]);
      const month = parseInt(t.dueDate.split('-')[1]);
      return day === activeDate && month === 5;
    }).sort((a, b) => (a.isDone === b.isDone ? 0 : a.isDone ? 1 : -1));
  }, [tasks, activeDate]);

  const hasTaskOnDay = (day: number) => {
    return tasks.some(t => {
      const d = parseInt(t.dueDate.split('-')[2]);
      const m = parseInt(t.dueDate.split('-')[1]);
      return d === day && m === 5;
    });
  };

  return (
    <div className="p-5 space-y-5 bg-white min-h-screen pb-32 animate-slide-in">
      <header className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-extrabold text-uitm-navy tracking-tight">Academic Planner</h1>
          <p className="text-[9px] text-uitm-gold font-black uppercase tracking-widest">May 2024 • W11</p>
        </div>
        <div className="flex bg-gray-50/50 p-1 rounded-xl border border-gray-100/50">
          <button 
            onClick={() => setView('week')} 
            className={`px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${view === 'week' ? 'bg-white shadow-sm text-uitm-navy' : 'text-gray-400 opacity-60'}`}
          >
            Week
          </button>
          <button 
            onClick={() => setView('month')} 
            className={`px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${view === 'month' ? 'bg-white shadow-sm text-uitm-navy' : 'text-gray-400 opacity-60'}`}
          >
            Month
          </button>
        </div>
      </header>

      {/* Calendar Switcher */}
      <div className="bg-gray-50/30 rounded-[1.5rem] border border-gray-100/30 p-4">
        {view === 'week' ? (
          <div className="flex justify-between items-center gap-1 overflow-x-auto hide-scrollbar">
            {weekDays.map(d => (
              <button
                key={d.date}
                onClick={() => setActiveDate(d.date)}
                className={`flex flex-col items-center gap-1.5 px-3 py-4 rounded-2xl transition-all min-w-[50px] ${activeDate === d.date ? 'bg-uitm-navy text-white shadow-lg' : 'text-gray-400 hover:bg-gray-50'}`}
              >
                <span className={`text-[7px] font-black uppercase tracking-widest ${activeDate === d.date ? 'text-blue-200/50' : 'text-gray-300'}`}>{d.label}</span>
                <span className="text-sm font-black tracking-tighter">{d.date}</span>
                {hasTaskOnDay(d.date) && <div className={`w-1 h-1 rounded-full ${activeDate === d.date ? 'bg-uitm-gold' : 'bg-uitm-navy/20'}`}></div>}
              </button>
            ))}
          </div>
        ) : (
          <div className="animate-slide-in">
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => (
                <span key={d} className="text-[7px] font-black text-gray-300 uppercase tracking-widest">{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthDays.map((day, idx) => (
                <button
                  key={idx}
                  disabled={day === null}
                  onClick={() => day !== null && setActiveDate(day)}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center transition-all relative ${
                    day === null ? 'opacity-0' : 
                    activeDate === day ? 'bg-uitm-navy text-white shadow-md' : 
                    'text-uitm-navy font-bold text-[10px] hover:bg-gray-100'
                  }`}
                >
                  <span className={activeDate === day ? 'scale-110' : ''}>{day}</span>
                  {day !== null && hasTaskOnDay(day) && (
                    <div className={`absolute bottom-1 w-1 h-1 rounded-full ${activeDate === day ? 'bg-uitm-gold' : 'bg-uitm-gold/30'}`}></div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Task List Header - Compact */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[8px] font-black text-gray-300 uppercase tracking-[0.2em]">
          {filteredTasks.length} Deadlines • May {activeDate}
        </h3>
        <button className="text-[8px] font-black text-uitm-navy/30 uppercase tracking-widest">Filter</button>
      </div>

      {/* Task List - Compact */}
      <div className="space-y-3 pb-8">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 opacity-20 text-center">
             <Icons.CheckCircle className="w-8 h-8 text-gray-400 mb-2" />
             <p className="text-[8px] font-black uppercase tracking-widest text-uitm-navy">Clear Day</p>
          </div>
        ) : (
          filteredTasks.map(task => (
            <div 
              key={task.id}
              onClick={() => onSelectTask(task)}
              className={`bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-start gap-4 transition-all active:scale-[0.98] relative overflow-hidden ${task.isDone ? 'opacity-40 grayscale' : ''}`}
            >
              {task.priority === Priority.High && !task.isDone && (
                <div className="absolute top-0 left-0 w-1 h-full bg-red-500/80"></div>
              )}
              
              <button 
                onClick={(e) => { e.stopPropagation(); onToggleTask(task.id); }}
                className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all flex-shrink-0 ${task.isDone ? 'bg-uitm-navy border-uitm-navy' : 'border-gray-100 bg-gray-50/50'}`}
              >
                {task.isDone && <Icons.CheckCircle className="w-4 h-4 text-white" />}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex gap-1.5">
                    <span className="text-[7px] font-black text-uitm-navy/40 uppercase tracking-widest">{task.courseId}</span>
                    <span className="text-[7px] font-black text-gray-300 uppercase tracking-widest">{task.type}</span>
                  </div>
                  {task.priority === Priority.High && (
                    <span className="text-[7px] font-black text-red-400 uppercase tracking-widest">Urgent</span>
                  )}
                </div>
                <h4 className={`text-xs font-bold text-uitm-navy tracking-tight mb-2 truncate ${task.isDone ? 'line-through' : ''}`}>
                  {task.title}
                </h4>
                <div className="flex items-center gap-4 text-[8px] text-gray-400 font-black uppercase tracking-widest">
                  <div className="flex items-center gap-1">
                    <Icons.Calendar className="w-2.5 h-2.5 opacity-30" /> 
                    <span>{task.dueTime}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Icons.TrendingUp className="w-2.5 h-2.5 opacity-30" /> 
                    <span>{task.effort}h effort</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Planner;
