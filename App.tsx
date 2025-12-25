
import React, { useState } from 'react';
import { Page, UserProfile, Course, Task, TaskType, Priority, Note, Flashcard } from './types';
import { DEFAULT_COURSES, Icons } from './constants';

// --- Pages ---
import Onboarding from './pages/Onboarding';
import Login from './pages/Login';
import ProfileSetup from './pages/ProfileSetup';
import Dashboard from './pages/Dashboard';
import Import from './pages/Import';
import AIExtraction from './pages/AIExtraction';
import Planner from './pages/Planner';
import TaskDetails from './pages/TaskDetails';
import AIPage from './pages/AIPage';
import StressMap from './pages/StressMap';
import WeeklySummary from './pages/WeeklySummary';
import Groups from './pages/Groups';
import ProfileSettings from './pages/ProfileSettings';

// --- New Feature Pages ---
import NotesHub from './pages/NotesHub';
import NotesList from './pages/NotesList';
import NotesEditor from './pages/NotesEditor';
import QuizConfig from './pages/QuizConfig';
import QuizModeSelection from './pages/QuizModeSelection';
import MatchLobby from './pages/MatchLobby';
import QuizGameplay from './pages/QuizGameplay';
import ResultsPage from './pages/ResultsPage';
import Leaderboard from './pages/Leaderboard';
import FlashcardReview from './pages/FlashcardReview';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('onboarding');
  const [user, setUser] = useState<UserProfile>({
    name: 'Aiman Hafiz',
    studentId: '2022456789',
    program: 'FSKM - Information System Engineering',
    part: 4,
    currentWeek: 11,
    startDate: '2024-03-04'
  });

  const [courses] = useState<Course[]>(
    DEFAULT_COURSES.map(id => ({
      id,
      name: id === 'IPS551' ? 'IS Development' : 
            id === 'CSC584' ? 'Enterprise Programming' : 
            id === 'ICT551' ? 'Mobile App Development' : 
            id === 'ICT502' ? 'IT Infrastructure' : `Course ${id}`,
      creditHours: 3,
      workload: [2, 3, 4, 6, 5, 7, 8, 4, 6, 8, 10, 9, 10, 4] 
    }))
  );

  const [tasks, setTasks] = useState<Task[]>([
    {
      id: 't1',
      title: 'Final Project: Backend API',
      courseId: 'CSC584',
      type: TaskType.Project,
      dueDate: '2024-05-20',
      dueTime: '23:59',
      priority: Priority.High,
      effort: 12,
      notes: 'Implement JWT authentication and CRUD for student modules.',
      isDone: false,
      deadlineRisk: 'High',
      suggestedWeek: 11,
      sourceMessage: 'Dr. Zali: Please ensure the API documentation is updated by Monday night.'
    },
    {
      id: 't2',
      title: 'Lab 5: Retrofit & REST API',
      courseId: 'ICT551',
      type: TaskType.Lab,
      dueDate: '2024-05-22',
      dueTime: '17:00',
      priority: Priority.Medium,
      effort: 4,
      notes: 'Connect the mobile app to the mock server using Retrofit library.',
      isDone: false,
      deadlineRisk: 'Medium',
      suggestedWeek: 11
    },
    {
      id: 't3',
      title: 'System Design Document',
      courseId: 'IPS551',
      type: TaskType.Assignment,
      dueDate: '2024-05-24',
      dueTime: '23:59',
      priority: Priority.High,
      effort: 8,
      notes: 'Prepare the DFD Level 0, 1 and ERD for the case study.',
      isDone: false,
      deadlineRisk: 'High',
      suggestedWeek: 11
    },
    {
      id: 't4',
      title: 'Quiz 2: Enterprise Patterns',
      courseId: 'CSC584',
      type: TaskType.Quiz,
      dueDate: '2024-05-21',
      dueTime: '08:00',
      priority: Priority.Medium,
      effort: 2,
      notes: 'Study MVC, Singleton, and Bridge patterns.',
      isDone: true,
      deadlineRisk: 'Low',
      suggestedWeek: 11
    },
    {
      id: 't5',
      title: 'Reflection Video: CTU551',
      courseId: 'CTU551',
      type: TaskType.Project,
      dueDate: '2024-05-26',
      dueTime: '23:59',
      priority: Priority.Low,
      effort: 3,
      notes: 'Record a 3-minute video on Islamic contributions to modern science.',
      isDone: false,
      deadlineRisk: 'Low',
      suggestedWeek: 11
    },
    {
      id: 't6',
      title: 'Infrastructure Test 1',
      courseId: 'ICT502',
      type: TaskType.Test,
      dueDate: '2024-05-15',
      dueTime: '10:00',
      priority: Priority.High,
      effort: 6,
      notes: 'Coverage: Chapter 1 to 4. OSI Model and Subnetting.',
      isDone: true,
      deadlineRisk: 'Low',
      suggestedWeek: 10
    }
  ]);

  const [notes, setNotes] = useState<Note[]>([
    { id: 'n1', subjectId: 'CSC584', title: 'MVC Architecture', content: 'Discussion on Model-View-Controller in Spring Boot...', tag: 'Lecture', updatedAt: '2024-05-15' },
    { id: 'n2', subjectId: 'CSC584', title: 'Hibernate Mapping', content: 'Entity relationships: ManyToOne, OneToMany...', tag: 'Tutorial', updatedAt: '2024-05-16' }
  ]);

  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [pendingExtraction, setPendingExtraction] = useState<string>('');
  const [quizScore, setQuizScore] = useState<number>(0);

  const navigate = (page: Page) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentPage(page);
  };

  const addTask = (task: Task) => {
    setTasks(prev => [task, ...prev]);
    navigate('planner');
  };

  const toggleTaskDone = (taskId: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, isDone: !t.isDone } : t));
  };

  const handleSaveNote = (note: Note) => {
    setNotes(prev => {
      const exists = prev.find(n => n.id === note.id);
      if (exists) return prev.map(n => n.id === note.id ? note : n);
      return [note, ...prev];
    });
    navigate('notesList');
  };

  const handleGenerateFlashcards = (newFlashcards: Flashcard[]) => {
    setFlashcards(newFlashcards);
    navigate('flashcardReview');
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'onboarding': return <Onboarding onFinish={() => navigate('login')} />;
      case 'login': return <Login onLogin={() => navigate('dashboard')} onDemo={() => navigate('dashboard')} />;
      case 'profileSetup': return <ProfileSetup user={user} courses={courses} onUpdateWorkload={() => {}} onFinish={() => navigate('dashboard')} />;
      case 'dashboard': return <Dashboard user={user} tasks={tasks} onNavigate={navigate} />;
      case 'import': return <Import onExtract={(text) => { setPendingExtraction(text); navigate('aiExtraction'); }} onNavigate={navigate} />;
      case 'aiExtraction': return <AIExtraction sourceMessage={pendingExtraction} courses={courses} onAdd={addTask} onCancel={() => navigate('import')} />;
      case 'planner': return <Planner tasks={tasks} courses={courses} onSelectTask={(t) => { setSelectedTask(t); navigate('taskDetails'); }} onNavigate={navigate} onToggleTask={toggleTaskDone} />;
      case 'taskDetails': return <TaskDetails task={selectedTask} onBack={() => navigate('planner')} onUpdate={() => {}} onToggleDone={() => toggleTaskDone(selectedTask!.id)} />;
      case 'ai': return <AIPage user={user} tasks={tasks} courses={courses} onNavigate={navigate} />;
      case 'stressMap': return <StressMap courses={courses} onBack={() => navigate('dashboard')} />;
      case 'weeklySummary': return <WeeklySummary user={user} tasks={tasks} onBack={() => navigate('dashboard')} />;
      case 'groups': return <Groups onBack={() => navigate('import')} />;
      case 'profileSettings': return <ProfileSettings user={user} setUser={setUser} onNavigate={navigate} />;
      
      // Notes Hub
      case 'notesHub': return <NotesHub courses={courses} notes={notes} onSelectSubject={(id) => { setSelectedSubjectId(id); navigate('notesList'); }} onStartQuiz={() => navigate('quizConfig')} />;
      case 'notesList': return <NotesList subjectId={selectedSubjectId!} notes={notes.filter(n => n.subjectId === selectedSubjectId)} onBack={() => navigate('notesHub')} onSelectNote={(n) => { setSelectedNote(n); navigate('notesEditor'); }} onAddNote={() => { setSelectedNote(null); navigate('notesEditor'); }} />;
      case 'notesEditor': return <NotesEditor subjectId={selectedSubjectId!} note={selectedNote} onSave={handleSaveNote} onGenerateQuiz={() => navigate('quizConfig')} onGenerateFlashcards={handleGenerateFlashcards} onBack={() => navigate('notesList')} />;
      
      // Flashcards
      case 'flashcardReview': return <FlashcardReview flashcards={flashcards} onBack={() => navigate('notesEditor')} />;
      
      // Quiz Feature
      case 'quizConfig': return <QuizConfig courses={courses} allNotes={notes} onStart={() => navigate('quizModeSelection')} onBack={() => navigate('notesHub')} initialSubjectId={selectedSubjectId || undefined} />;
      case 'quizModeSelection': return <QuizModeSelection onSelectSolo={() => navigate('quizGameplay')} onSelectMulti={() => navigate('matchLobby')} onBack={() => navigate('quizConfig')} />;
      case 'matchLobby': return <MatchLobby onStart={() => navigate('quizGameplay')} onBack={() => navigate('quizModeSelection')} />;
      case 'quizGameplay': return <QuizGameplay onComplete={(score) => { setQuizScore(score); navigate('resultsPage'); }} />;
      case 'resultsPage': return <ResultsPage score={quizScore} onFinish={() => navigate('leaderboard')} />;
      case 'leaderboard': return <Leaderboard onBack={() => navigate('notesHub')} />;

      default: return <Dashboard user={user} tasks={tasks} onNavigate={navigate} />;
    }
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-white">
      <main className="flex-1 overflow-y-auto hide-scrollbar pb-24">
        {renderPage()}
      </main>
      
      {['dashboard', 'planner', 'import', 'ai', 'profileSettings', 'notesHub'].includes(currentPage) && (
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md glass border-t border-gray-100 flex justify-around items-center py-4 px-6 z-[100] rounded-t-[2.5rem] shadow-premium">
          <NavItem active={currentPage === 'dashboard'} icon={<Icons.Calendar className="w-5 h-5" />} label="Home" onClick={() => navigate('dashboard')} />
          <NavItem active={currentPage === 'planner'} icon={<Icons.CheckCircle className="w-5 h-5" />} label="Tasks" onClick={() => navigate('planner')} />
          <div className="relative -mt-12">
            <button 
              onClick={() => navigate('import')}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-gold transition-all active:scale-90 ${currentPage === 'import' ? 'bg-uitm-gold' : 'bg-uitm-navy'} text-white`}
            >
              <Icons.Plus className="w-6 h-6" />
            </button>
          </div>
          <NavItem active={currentPage === 'notesHub'} icon={<Icons.List className="w-5 h-5" />} label="Notes" onClick={() => navigate('notesHub')} />
          <NavItem active={currentPage === 'profileSettings'} icon={<Icons.User className="w-5 h-5" />} label="Profile" onClick={() => navigate('profileSettings')} />
        </nav>
      )}
    </div>
  );
};

const NavItem = ({ active, icon, label, onClick }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all ${active ? 'text-uitm-navy' : 'text-gray-300'}`}>
    {icon}
    <span className={`text-[8px] font-black uppercase tracking-widest ${active ? 'opacity-100' : 'opacity-0'}`}>{label}</span>
  </button>
);

export default App;
