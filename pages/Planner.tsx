import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Task, Course, Priority, TaskType } from '../types';
import { Icons } from '../constants';
import { GoogleGenAI } from "@google/genai";

interface Props {
  tasks: Task[];
  courses: Course[];
  onSelectTask: (t: Task) => void;
  onNavigate: (p: any) => void;
  onToggleTask: (id: string) => void;
  onAddTask: (task: Task) => void;
  autoOpenChat?: boolean;
  onChatOpened?: () => void;
  onTutorialStep?: (step: number) => void;
  shouldCloseChat?: boolean;
}

const Planner: React.FC<Props> = ({ tasks, courses, onSelectTask, onNavigate, onToggleTask, onAddTask, autoOpenChat, onChatOpened, onTutorialStep, shouldCloseChat }) => {
  const [activeDate, setActiveDate] = useState(26);
  const [view, setView] = useState<'week' | 'month' | 'all'>('week');
  const [aiInsight, setAiInsight] = useState<string>("Analyzing your SOW workload patterns...");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<{role: 'ai' | 'user', text: string}[]>([
    { role: 'ai', text: "Hello Syahrul! I've analyzed your schedule. Week 13 is critical for CSC584 & IPS551. Need help rescheduling any deadlines?" }
  ]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-open chat when triggered from center button
  useEffect(() => {
    if (autoOpenChat) {
      setIsChatOpen(true);
      onChatOpened?.();
    }
  }, [autoOpenChat, onChatOpened]);

  useEffect(() => {
    if (isChatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatOpen]);

  // Close chat when requested (e.g. by tutorial)
  useEffect(() => {
    if (shouldCloseChat) {
      setIsChatOpen(false);
    }
  }, [shouldCloseChat]);

  // Week 11: Dec 23-29
  const weekDays = [
    { label: 'M', date: 23 }, { label: 'T', date: 24 }, { label: 'W', date: 25 },
    { label: 'T', date: 26 }, { label: 'F', date: 27 }, { label: 'S', date: 28 }, { label: 'S', date: 29 }
  ];

  // Hardcoded AI insight for Week 11
  useEffect(() => {
    setAiInsight("Focus on completing the CSC584 Backend API project by Dec 27. This clears your schedule before the Week 13 critical window when CSC584 and IPS551 assignments overlap.");
  }, []);

  const monthDays = useMemo(() => {
    const days = [];
    days.push(null, null, null, null, null, null); // Dec 1 is Sunday, so 6 empty slots
    for (let i = 1; i <= 31; i++) days.push(i);
    return days;
  }, []);

  const filteredTasks = useMemo(() => {
    if (view === 'all') {
      return tasks.sort((a, b) => (a.isDone === b.isDone ? 0 : a.isDone ? 1 : -1));
    }
    return tasks.filter(t => {
      const day = parseInt(t.dueDate.split('-')[2]);
      const month = parseInt(t.dueDate.split('-')[1]);
      // Filter for December (12) or January (1)
      return day === activeDate && (month === 12 || month === 1);
    }).sort((a, b) => (a.isDone === b.isDone ? 0 : a.isDone ? 1 : -1));
  }, [tasks, activeDate, view]);

  const hasTaskOnDay = (day: number) => {
    return tasks.some(t => {
      const d = parseInt(t.dueDate.split('-')[2]);
      const m = parseInt(t.dueDate.split('-')[1]);
      return d === day && (m === 12 || m === 1);
    });
  };

  const handleAiUpdate = async () => {
    if (!chatInput.trim()) return;
    
    const userMsg = chatInput.toLowerCase();
    const originalMsg = chatInput;
    setMessages(prev => [...prev, { role: 'user', text: chatInput }]);
    setChatInput('');
    setIsProcessing(true);

    // Detect "add task" intent OR WhatsApp-style assignment message
    const isAddTask = userMsg.includes('add') && userMsg.includes('task') ||
                      userMsg.includes('create') && userMsg.includes('task') ||
                      userMsg.includes('new task');
    
    const isWhatsAppMessage = userMsg.includes('submission') || 
                               userMsg.includes('assignment') || 
                               userMsg.includes('lab') ||
                               userMsg.includes('deadline') ||
                               userMsg.includes('hantar');

    setTimeout(() => {
      if (isAddTask || isWhatsAppMessage) {
        // Try to extract title from message
        let extractedTitle = 'Lab Assignment';
        if (userMsg.includes('lab')) extractedTitle = 'Lab Assignment cum Practice';
        if (userMsg.includes('quiz')) extractedTitle = 'Quiz';
        if (userMsg.includes('project')) extractedTitle = 'Project Submission';
        
        // Try to extract date - look for common patterns
        let extractedDate = '2026-01-29'; // Default to Jan 29
        
        // Look for "29 January 2026" pattern
        const dateMatch = originalMsg.match(/(\d{1,2})\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})/i);
        if (dateMatch) {
          const day = dateMatch[1].padStart(2, '0');
          const monthNames: {[key: string]: string} = {
            'january': '01', 'february': '02', 'march': '03', 'april': '04',
            'may': '05', 'june': '06', 'july': '07', 'august': '08',
            'september': '09', 'october': '10', 'november': '11', 'december': '12'
          };
          const month = monthNames[dateMatch[2].toLowerCase()];
          const year = dateMatch[3];
          extractedDate = `${year}-${month}-${day}`;
        }

        const newTask: Task = {
          id: `t${Date.now()}`,
          title: extractedTitle,
          courseId: 'CSC584',
          type: TaskType.Lab,
          dueDate: extractedDate,
          dueTime: '23:59',
          priority: Priority.High,
          effort: 6,
          notes: originalMsg.substring(0, 200),
          isDone: false,
          deadlineRisk: 'High',
          suggestedWeek: 13,
          sourceMessage: originalMsg
        };
        
        onAddTask(newTask);
        
        setMessages(prev => [...prev, { 
          role: 'ai', 
          text: `✅ Task extracted!\n\n📝 **${extractedTitle}**\n📅 Due: ${extractedDate}\n⚡ Priority: High\n\nI've added this to your planner. Check your task list!`
        }]);
      } else {
        setMessages(prev => [...prev, { 
          role: 'ai', 
          text: "Understood. I've re-optimized your planner. CSC584 preparation time has been allocated for Friday morning to ensure you stay ahead of the critical wave."
        }]);
      }
      setIsProcessing(false);
    }, 1500);
  };

  return (
    <div className="bg-[#F8FAFC] min-h-screen pb-32 animate-slide-in relative">
       {/* Header */}
       <header className="px-6 pt-10 pb-6 flex items-center justify-between sticky top-0 bg-[#F8FAFC]/80 backdrop-blur-md z-30">
        <div>
          <h1 className="text-xl font-black text-uitm-navy tracking-tight leading-none mb-1">
            Task Planner
          </h1>
          <p className="text-[9px] font-black text-[#8E9AAF] uppercase tracking-widest">DECEMBER • WEEK 11</p>
        </div>
        <div className="flex bg-white p-1 rounded-2xl border border-gray-100 shadow-sm">
          <button 
            onClick={() => setView('week')} 
            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${view === 'week' ? 'bg-uitm-navy text-white shadow-md' : 'text-gray-400 hover:text-uitm-navy'}`}
          >
            Week
          </button>
          <button 
            onClick={() => setView('month')} 
            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${view === 'month' ? 'bg-uitm-navy text-white shadow-md' : 'text-gray-400 hover:text-uitm-navy'}`}
          >
            Month
          </button>
          <button 
             onClick={() => setView('all')} 
             className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${view === 'all' ? 'bg-uitm-navy text-white shadow-md' : 'text-gray-400 hover:text-uitm-navy'}`}
           >
             All
           </button>
        </div>
      </header>
 
       <div className="px-6 space-y-6">
 
        {/* Calendar Strip - Week View */}
        {view === 'week' && (
          <div className="flex justify-between items-center px-1">
            {weekDays.map((day) => {
               const isSelected = activeDate === day.date;
               return (
                 <button 
                   key={day.date}
                   onClick={() => setActiveDate(day.date)}
                   className={`flex flex-col items-center gap-3 transition-all duration-300 group ${isSelected ? 'scale-110' : 'opacity-40 hover:opacity-70'}`}
                 >
                   <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">{day.label}</span>
                   <div className={`w-10 h-14 rounded-2xl flex items-center justify-center text-lg font-black border transition-all ${isSelected ? 'bg-white border-gray-200 text-uitm-navy shadow-lg' : 'bg-transparent border-transparent text-gray-400'}`}>
                      {day.date}
                   </div>
                   <div className={`w-1 h-1 rounded-full transition-all ${hasTaskOnDay(day.date) ? 'bg-uitm-gold' : 'bg-transparent'} ${isSelected ? 'scale-125' : ''}`}></div>
                 </button>
               );
            })}
          </div>
        )}
 
        {/* Calendar Grid - Month View */}
        {view === 'month' && (
            <div className="bg-white rounded-[2rem] p-6 border border-gray-100 shadow-sm">
             <div className="grid grid-cols-7 gap-y-4 gap-x-2">
                {['S','M','T','W','T','F','S'].map(d => (
                    <span key={d} className="text-center text-[10px] font-black text-gray-300">{d}</span>
                ))}
                {monthDays.map((d, i) => (
                    <button 
                      key={i} 
                      disabled={!d}
                      onClick={() => d && setActiveDate(d)}
                      className={`aspect-square flex flex-col items-center justify-center rounded-xl text-xs font-bold relative transition-all ${d === activeDate ? 'bg-uitm-navy text-white shadow-lg scale-110' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        {d}
                        {d && hasTaskOnDay(d) && d !== activeDate && (
                            <div className="absolute bottom-1.5 w-1 h-1 bg-uitm-gold rounded-full"></div>
                        )}
                    </button>
                ))}
             </div>
           </div>
        )}
 
        {/* Task List Header */}
        <div className="flex justify-between items-end px-2 pt-2">
           <h3 className="text-xs font-black text-uitm-navy uppercase tracking-widest">
              {view === 'all' ? 'All Assignments' : `Deadlines • Dec ${activeDate}`}
           </h3>
           <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{filteredTasks.length} Tasks</span>
        </div>
 
        {/* Task List */}
        <div className="space-y-4">
          {filteredTasks.length > 0 ? (
            filteredTasks.map((task, index) => (
              <div 
                key={task.id}
                onClick={() => onSelectTask(task)}
                className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm active:scale-[0.98] transition-all flex items-start gap-4 group cursor-pointer hover:border-gray-200 hover:shadow-md"
              >
                {/* Checkbox */}
                <div 
                  onClick={(e) => { e.stopPropagation(); onToggleTask(task.id); }}
                  className={`mt-1 w-6 h-6 rounded-xl border-2 flex items-center justify-center transition-all ${task.isDone ? 'bg-green-500 border-green-500' : 'border-gray-200 group-hover:border-uitm-navy text-transparent group-hover:text-gray-200'}`}
                >
                  <Icons.CheckCircle className="w-3.5 h-3.5 text-white" />
                </div>
                
                <div className="flex-1 min-w-0 space-y-2">
                   <div className="flex justify-between items-start">
                      <span className="text-[9px] font-black uppercase tracking-widest text-[#8E9AAF]">{task.courseId}</span>
                      <span className={`text-[8px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider ${task.priority === Priority.High ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                         {task.priority}
                      </span>
                   </div>
                   
                   <h3 className={`text-sm font-black text-uitm-navy leading-tight ${task.isDone ? 'line-through opacity-40' : ''}`}>
                      {task.title}
                   </h3>
                   
                   <div className="flex items-center gap-4 pt-1">
                      <div className="flex items-center gap-1.5 opacity-60">
                         <Icons.Calendar className="w-3.5 h-3.5" />
                         <span className="text-[10px] font-bold">{task.dueTime}</span>
                      </div>
                      <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
                      <div className="flex items-center gap-1.5 opacity-60">
                         <Icons.TrendingUp className="w-3.5 h-3.5" />
                         <span className="text-[10px] font-bold">{task.effort}h Effort</span>
                      </div>
                   </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-16 opacity-40">
              <div className="w-16 h-16 bg-gray-100 rounded-3xl mx-auto flex items-center justify-center mb-4 text-gray-300">
                 <Icons.CheckCircle className="w-8 h-8" />
              </div>
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">No tasks for today</p>
              <p className="text-[10px] text-gray-300 mt-1">Enjoy your free time!</p>
            </div>
          )}
        </div>
       </div>
 
       {/* AI Chat Popup */}
       {isChatOpen && (
         <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={() => setIsChatOpen(false)}>
           <div 
             className="bg-white w-full max-w-md rounded-t-[2.5rem] shadow-2xl overflow-hidden" 
             style={{maxHeight: '80vh'}}
             onClick={(e) => e.stopPropagation()}
           >
             {/* Header */}
             <div className="p-6 bg-uitm-navy text-white flex items-center justify-between">
               <div className="flex items-center gap-4">
                 <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                    <Icons.Sparkles className="w-5 h-5 text-uitm-gold" />
                 </div>
                 <div>
                   <h2 className="text-sm font-black tracking-tight">AI Strategist</h2>
                   <p className="text-[9px] text-white/60 font-black uppercase tracking-widest">Academic Co-Pilot</p>
                 </div>
               </div>
               <button onClick={() => setIsChatOpen(false)} className="opacity-60 hover:opacity-100 transition-opacity">
                 <Icons.Plus className="rotate-45 w-6 h-6" />
               </button>
             </div>
 
             {/* Messages */}
             <div className="p-6 space-y-4 overflow-y-auto bg-gray-50" style={{maxHeight: 'calc(80vh - 160px)', minHeight: '300px'}}>
               {messages.map((m, i) => (
                 <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                   <div className={`max-w-[85%] p-4 text-xs font-medium rounded-2xl shadow-sm ${
                     m.role === 'user' 
                       ? 'bg-uitm-navy text-white rounded-br-none' 
                       : 'bg-white text-gray-700 rounded-bl-none border border-gray-100'
                   }`}>
                     {m.text}
                   </div>
                 </div>
               ))}
               {isProcessing && (
                 <div className="flex justify-start">
                   <div className="bg-white px-4 py-3 rounded-2xl border border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                     Analyzing...
                   </div>
                 </div>
               )}
               <div ref={chatEndRef} />
             </div>
 
             {/* Input */}
             <div className="p-4 bg-white border-t border-gray-100 flex gap-3">
               <input 
                 id="ai-chat-input"
                 autoFocus
                 value={chatInput}
                 onChange={e => setChatInput(e.target.value)}
                 onKeyPress={e => e.key === 'Enter' && handleAiUpdate()}
                 placeholder="Type your plan or request..."
                 className="flex-1 bg-gray-50 rounded-2xl py-3 px-5 text-sm font-medium outline-none focus:ring-2 focus:ring-uitm-navy transition-all"
               />
               <button 
                 onClick={handleAiUpdate}
                 disabled={!chatInput.trim() || isProcessing}
                 className="bg-uitm-navy p-3.5 rounded-2xl text-white shadow-lg disabled:opacity-50 hover:bg-uitm-navy/90 active:scale-95 transition-all"
               >
                 <Icons.ArrowRight className="w-5 h-5" />
               </button>
             </div>
           </div>
         </div>
       )}
    </div>
  );
};
export default Planner;
