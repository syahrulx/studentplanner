
import React, { useState } from 'react';
import { Page, UserProfile, Course, Task, TaskType, Priority, Note, Flashcard } from './types';
import { DEFAULT_COURSES, Icons } from './constants';

// --- Pages ---
import Onboarding from './pages/Onboarding';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import ForgotPassword from './pages/ForgotPassword';
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
import AddTask from './pages/AddTask';
import Tutorial from './components/Tutorial';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('onboarding');
  const [openAIChat, setOpenAIChat] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);

  const [user, setUser] = useState<UserProfile>({
    name: 'Syahrul Izwan',
    studentId: '2022456789',
    program: 'FSKM - Information System Engineering',
    part: 4,
    currentWeek: 11,
    startDate: '2025-10-14'
  });

  const [courses] = useState<Course[]>(
    DEFAULT_COURSES.map(id => ({
      id,
      name: id === 'IPS551' ? 'Information System Development' : 
            id === 'CSC584' ? 'Enterprise Programming' : 
            id === 'ICT551' ? 'Mobile App Development' : 
            id === 'ICT502' ? 'IT Infrastructure' : 
            id === 'ISP573' ? 'IS Planning & Strategy' : 
            id === 'TAC451' ? 'Third Language' :
            id === 'CTU551' ? 'Tamadun Islam & Asia' :
            id === 'LCC401' ? 'Critical Reading' : `Course ${id}`,
      creditHours: 3,
      workload: [2, 3, 4, 6, 5, 7, 8, 4, 6, 8, 10, 9, 10, 4] 
    }))
  );

  const [tasks, setTasks] = useState<Task[]>([
    // Week 11 tasks (Due this week: Dec 23-27)
    {
      id: 't1',
      title: 'Final Project: Backend API',
      courseId: 'CSC584',
      type: TaskType.Project,
      dueDate: '2024-12-27',
      dueTime: '23:59',
      priority: Priority.High,
      effort: 12,
      notes: 'Implement JWT authentication and CRUD for student modules.',
      isDone: false,
      deadlineRisk: 'High',
      suggestedWeek: 11,
      sourceMessage: 'Dr. Zali: Please ensure the API documentation is updated by Friday night.'
    },
    {
      id: 't7',
      title: 'ISP573: Case Study Analysis',
      courseId: 'ISP573',
      type: TaskType.Assignment,
      dueDate: '2024-12-26',
      dueTime: '12:00',
      priority: Priority.Medium,
      effort: 5,
      notes: 'Analyze the business process for the assigned company.',
      isDone: false,
      deadlineRisk: 'Medium',
      suggestedWeek: 11
    },
    {
      id: 't9',
      title: 'LCC401: Critical Reading Exercise',
      courseId: 'LCC401',
      type: TaskType.Assignment,
      dueDate: '2024-12-26',
      dueTime: '17:00',
      priority: Priority.Low,
      effort: 2,
      notes: 'Submit the summary for the article "AI in Education".',
      isDone: false,
      deadlineRisk: 'Low',
      suggestedWeek: 11
    },
    {
      id: 't8',
      title: 'TAC451: Mandarin Speaking Test',
      courseId: 'TAC451',
      type: TaskType.Test,
      dueDate: '2024-12-27',
      dueTime: '14:00',
      priority: Priority.High,
      effort: 4,
      notes: 'Prepare dialogue script for Chapter 3-5.',
      isDone: false,
      deadlineRisk: 'High',
      suggestedWeek: 11
    },
    // Week 12 tasks (Due next week: Dec 30 - Jan 3)
    {
      id: 't2',
      title: 'Lab 5: Retrofit & REST API',
      courseId: 'ICT551',
      type: TaskType.Lab,
      dueDate: '2024-12-30',
      dueTime: '17:00',
      priority: Priority.Medium,
      effort: 4,
      notes: 'Connect the mobile app to the mock server using Retrofit library.',
      isDone: false,
      deadlineRisk: 'Medium',
      suggestedWeek: 12
    },
    {
      id: 't13',
      title: 'CTU551: Group Discussion Report',
      courseId: 'CTU551',
      type: TaskType.Assignment,
      dueDate: '2024-12-30',
      dueTime: '23:59',
      priority: Priority.Low,
      effort: 2,
      notes: 'Summary of the forum on "Islamic Ethics in AI".',
      isDone: false,
      deadlineRisk: 'Low',
      suggestedWeek: 12
    },
    {
      id: 't10',
      title: 'ICT502: Networking Lab Report',
      courseId: 'ICT502',
      type: TaskType.Lab,
      dueDate: '2024-12-31',
      dueTime: '16:00',
      priority: Priority.Medium,
      effort: 4,
      notes: 'Documentation for Packet Tracer routing configuration.',
      isDone: false,
      deadlineRisk: 'Medium',
      suggestedWeek: 12
    },
    // Week 13 tasks (Critical Window: Jan 6-10)
    {
      id: 't14',
      title: 'CSC584: Hibernate Mapping Lab',
      courseId: 'CSC584',
      type: TaskType.Lab,
      dueDate: '2025-01-06',
      dueTime: '10:00',
      priority: Priority.High,
      effort: 3,
      notes: 'Complete the One-to-Many and Many-to-Many exercise.',
      isDone: false,
      deadlineRisk: 'High',
      suggestedWeek: 13
    },
    {
      id: 't3',
      title: 'System Design Document',
      courseId: 'IPS551',
      type: TaskType.Assignment,
      dueDate: '2025-01-08',
      dueTime: '23:59',
      priority: Priority.High,
      effort: 8,
      notes: 'Prepare the DFD Level 0, 1 and ERD for the case study.',
      isDone: false,
      deadlineRisk: 'High',
      suggestedWeek: 13
    },
    {
      id: 't5',
      title: 'Reflection Video: CTU551',
      courseId: 'CTU551',
      type: TaskType.Project,
      dueDate: '2025-01-10',
      dueTime: '23:59',
      priority: Priority.Medium,
      effort: 3,
      notes: 'Record a 3-minute video on Islamic contributions to modern science.',
      isDone: false,
      deadlineRisk: 'Medium',
      suggestedWeek: 13
    },
    // Completed tasks (Week 10 and earlier)
    {
      id: 't11',
      title: 'IPS551: Requirements Gathering Report',
      courseId: 'IPS551',
      type: TaskType.Assignment,
      dueDate: '2024-12-20',
      dueTime: '23:59',
      priority: Priority.High,
      effort: 6,
      notes: 'Interview notes and user requirement specifications.',
      isDone: true,
      deadlineRisk: 'Low',
      suggestedWeek: 10
    },
    {
      id: 't4',
      title: 'Quiz 2: Enterprise Patterns',
      courseId: 'CSC584',
      type: TaskType.Quiz,
      dueDate: '2024-12-23',
      dueTime: '08:00',
      priority: Priority.Medium,
      effort: 2,
      notes: 'Study MVC, Singleton, and Bridge patterns.',
      isDone: true,
      deadlineRisk: 'Low',
      suggestedWeek: 11
    },
    {
      id: 't6',
      title: 'Infrastructure Test 1',
      courseId: 'ICT502',
      type: TaskType.Test,
      dueDate: '2024-12-18',
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
    // CSC584 - Enterprise Programming
    { id: 'n1', subjectId: 'CSC584', title: 'MVC Architecture', content: 'Model-View-Controller separates concerns:\n\n• Model: Data and business logic\n• View: User interface presentation\n• Controller: Handles input and updates model\n\nSpring Boot uses @Controller, @Service, @Repository annotations.', tag: 'Lecture', updatedAt: '2024-12-20' },
    { id: 'n2', subjectId: 'CSC584', title: 'Hibernate Mapping', content: 'Entity relationships in JPA/Hibernate:\n\n• @OneToMany: One entity has many related entities\n• @ManyToOne: Many entities belong to one\n• @ManyToMany: Bidirectional relationship with join table\n\nUse CascadeType.ALL for automatic persistence.', tag: 'Tutorial', updatedAt: '2024-12-23' },
    { id: 'n3', subjectId: 'CSC584', title: 'REST API Design', content: 'RESTful principles:\n\n• GET: Retrieve resources\n• POST: Create new resources\n• PUT: Update existing resources\n• DELETE: Remove resources\n\nUse proper HTTP status codes: 200 OK, 201 Created, 404 Not Found.', tag: 'Lecture', updatedAt: '2024-12-25' },
    // IPS551 - IS Development
    { id: 'n4', subjectId: 'IPS551', title: 'Requirements Engineering', content: 'Gathering requirements:\n\n1. Stakeholder interviews\n2. Document analysis\n3. Observation\n4. Prototyping\n\nOutput: Software Requirements Specification (SRS) document.', tag: 'Lecture', updatedAt: '2024-12-18' },
    { id: 'n5', subjectId: 'IPS551', title: 'DFD Diagrams', content: 'Data Flow Diagram levels:\n\n• Level 0: Context diagram (single process)\n• Level 1: Major processes breakdown\n• Level 2: Detailed sub-processes\n\nComponents: Process, Data Store, External Entity, Data Flow.', tag: 'Tutorial', updatedAt: '2024-12-22' },
    // ICT551 - Mobile App Development
    { id: 'n6', subjectId: 'ICT551', title: 'Android Lifecycle', content: 'Activity lifecycle methods:\n\n• onCreate(): Initialize activity\n• onStart(): Activity becomes visible\n• onResume(): Activity gains focus\n• onPause(): Activity loses focus\n• onStop(): Activity no longer visible\n• onDestroy(): Activity destroyed', tag: 'Lecture', updatedAt: '2024-12-19' },
    { id: 'n7', subjectId: 'ICT551', title: 'Retrofit Setup', content: 'Setting up Retrofit for API calls:\n\n1. Add dependencies in build.gradle\n2. Create API interface with @GET, @POST\n3. Build Retrofit instance with base URL\n4. Use Call<T> for async requests\n5. Handle responses in callbacks', tag: 'Lab', updatedAt: '2024-12-24' },
    // ICT502 - IT Infrastructure
    { id: 'n8', subjectId: 'ICT502', title: 'OSI Model', content: 'Seven layers of networking:\n\n7. Application - HTTP, FTP\n6. Presentation - Encryption, compression\n5. Session - Connection management\n4. Transport - TCP, UDP\n3. Network - IP routing\n2. Data Link - MAC addresses\n1. Physical - Cables, signals', tag: 'Lecture', updatedAt: '2024-12-15' },
    // CTU551 - Tamadun Islam
    { id: 'n9', subjectId: 'CTU551', title: 'Islamic Ethics in Tech', content: 'Key principles:\n\n• Amanah (Trust): Data privacy responsibility\n• Maslahah (Public interest): Technology for good\n• Adalah (Justice): Fair algorithms and AI\n• Ihsan (Excellence): Quality in work\n\nApply these principles in IT career.', tag: 'Discussion', updatedAt: '2024-12-21' }
  ]);

  const [flashcards, setFlashcards] = useState<Flashcard[]>([
    // CSC584 Flashcards
    { id: 'f1', noteId: 'n1', front: 'What does MVC stand for?', back: 'Model-View-Controller - a design pattern that separates application concerns' },
    { id: 'f2', noteId: 'n1', front: 'What is the role of Controller in MVC?', back: 'Handles user input, updates the model, and selects views for response' },
    { id: 'f3', noteId: 'n2', front: 'What annotation is used for one-to-many relationships?', back: '@OneToMany - indicates one entity has multiple related entities' },
    { id: 'f4', noteId: 'n3', front: 'What HTTP method is used to create resources?', back: 'POST - creates new resources on the server' },
    { id: 'f5', noteId: 'n3', front: 'What HTTP status code means success?', back: '200 OK - request was successful' },
    // IPS551 Flashcards
    { id: 'f6', noteId: 'n5', front: 'What is a Context Diagram?', back: 'DFD Level 0 - shows the entire system as a single process with external entities' },
    { id: 'f7', noteId: 'n4', front: 'What document contains all requirements?', back: 'SRS - Software Requirements Specification' },
    // ICT502 Flashcards
    { id: 'f8', noteId: 'n8', front: 'Which OSI layer handles IP routing?', back: 'Layer 3 - Network layer' },
    { id: 'f9', noteId: 'n8', front: 'Which OSI layer uses MAC addresses?', back: 'Layer 2 - Data Link layer' },
    { id: 'f10', noteId: 'n8', front: 'What protocols work at the Transport layer?', back: 'TCP and UDP' }
  ]);
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

  const deleteTask = (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    navigate('planner');
  };

  const handleStartTutorial = () => {
    setTutorialStep(0);
    setShowTutorial(true);
    navigate('dashboard');
  };

  // Custom navigate that handles startTutorial
  const customNavigate = (page: any) => {
    if (page === 'startTutorial') {
      handleStartTutorial();
    } else {
      navigate(page);
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'onboarding': return <Onboarding onFinish={() => navigate('login')} />;
      case 'login': return <Login 
        onLogin={() => { 
          const hasSeenTutorial = localStorage.getItem('hasSeenTutorial');
          navigate('dashboard');
          if (!hasSeenTutorial) {
            setTutorialStep(0);
            setShowTutorial(true);
          }
        }} 
        onSignUp={() => navigate('signUp')}
        onForgotPassword={() => navigate('forgotPassword')}
      />;
      case 'signUp': return <SignUp onBack={() => navigate('login')} onSignUp={() => navigate('login')} />;
      case 'forgotPassword': return <ForgotPassword onBack={() => navigate('login')} />;
      case 'profileSetup': return <ProfileSetup user={user} courses={courses} onUpdateWorkload={() => {}} onFinish={() => navigate('dashboard')} />;
      case 'dashboard': return <Dashboard user={user} tasks={tasks} onNavigate={navigate} onTutorialStep={(s) => showTutorial && setTutorialStep(s)} />;
      case 'import': return <Import onExtract={(text) => { setPendingExtraction(text); navigate('aiExtraction'); }} onNavigate={navigate} />;
      case 'aiExtraction': return <AIExtraction sourceMessage={pendingExtraction} courses={courses} onAdd={addTask} onCancel={() => navigate('import')} />;
      case 'planner': return <Planner tasks={tasks} courses={courses} onSelectTask={(t) => { setSelectedTask(t); navigate('taskDetails'); }} onNavigate={navigate} onToggleTask={toggleTaskDone} onAddTask={addTask} autoOpenChat={openAIChat} onChatOpened={() => setOpenAIChat(false)} onTutorialStep={(s) => showTutorial && setTutorialStep(s)} shouldCloseChat={showTutorial && tutorialStep >= 8} />;
      case 'taskDetails': return <TaskDetails task={selectedTask} onBack={() => navigate('planner')} onUpdate={() => {}} onToggleDone={() => toggleTaskDone(selectedTask!.id)} onDelete={() => deleteTask(selectedTask!.id)} />;
      case 'ai': return <AIPage user={user} tasks={tasks} courses={courses} onNavigate={navigate} />;
      case 'stressMap': return <StressMap courses={courses} onBack={() => navigate('dashboard')} />;
      case 'weeklySummary': return <WeeklySummary user={user} tasks={tasks} onBack={() => navigate('dashboard')} />;
      case 'groups': return <Groups onBack={() => navigate('import')} />;
      case 'profileSettings': return <ProfileSettings user={user} setUser={setUser} tasks={tasks} onNavigate={customNavigate} />;
      
      // Notes Hub
      case 'notesHub': return <NotesHub courses={courses} notes={notes} onSelectSubject={(id) => { setSelectedSubjectId(id); navigate('notesList'); }} onStartQuiz={() => navigate('quizConfig')} onTutorialStep={(s) => showTutorial && setTutorialStep(s)} />;
      case 'notesList': return <NotesList subjectId={selectedSubjectId!} notes={notes.filter(n => n.subjectId === selectedSubjectId)} onBack={() => navigate('notesHub')} onSelectNote={(n) => { setSelectedNote(n); navigate('notesEditor'); }} onAddNote={() => { setSelectedNote(null); navigate('notesEditor'); }} onTutorialStep={(s) => showTutorial && setTutorialStep(s)} />;
      case 'notesEditor': return <NotesEditor subjectId={selectedSubjectId!} note={selectedNote} onSave={handleSaveNote} onGenerateQuiz={() => navigate('quizConfig')} onGenerateFlashcards={handleGenerateFlashcards} onBack={() => navigate('notesList')} onTutorialStep={(s) => showTutorial && setTutorialStep(s)} />;
      
      // Flashcards
      case 'flashcardReview': return <FlashcardReview flashcards={flashcards} onBack={() => navigate('notesEditor')} />;
      
      // Quiz Feature
      case 'quizConfig': return <QuizConfig courses={courses} allNotes={notes} onStart={() => navigate('quizModeSelection')} onBack={() => navigate('notesHub')} initialSubjectId={selectedSubjectId || undefined} />;
      case 'quizModeSelection': return <QuizModeSelection onSelectSolo={() => navigate('quizGameplay')} onSelectMulti={() => navigate('matchLobby')} onBack={() => navigate('quizConfig')} />;
      case 'matchLobby': return <MatchLobby onStart={() => navigate('quizGameplay')} onBack={() => navigate('quizModeSelection')} />;
      case 'quizGameplay': return <QuizGameplay onComplete={(score) => { setQuizScore(score); navigate('resultsPage'); }} />;
      case 'resultsPage': return <ResultsPage score={quizScore} onFinish={() => navigate('leaderboard')} />;
      case 'leaderboard': return <Leaderboard onBack={() => navigate('dashboard')} />;
      case 'addTask': return <AddTask courses={courses} onAdd={addTask} onBack={() => navigate('planner')} />;

      default: return <Dashboard user={user} tasks={tasks} onNavigate={navigate} />;
    }
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-[#F8FAFC] relative overflow-hidden">
      {/* Universal Background Texture */}
      <div className="absolute inset-0 z-0 opacity-[0.4]" style={{
        backgroundImage: 'radial-gradient(#94A3B8 1px, transparent 1px)',
        backgroundSize: '24px 24px'
      }}></div>
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-transparent via-white/50 to-white pointer-events-none"></div>

      <main className="flex-1 overflow-y-auto hide-scrollbar pb-24 relative z-10">
        {renderPage()}
      </main>
      
      {['dashboard', 'planner', 'ai', 'profileSettings', 'notesHub', 'stressMap'].includes(currentPage) && (
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md glass border-t border-gray-100 flex justify-around items-center py-4 px-6 z-[100] rounded-t-[2.5rem] shadow-premium">
          <NavItem id="nav-home" active={currentPage === 'dashboard'} icon={<Icons.Calendar className="w-5 h-5" />} label="Home" onClick={() => navigate('dashboard')} />
          <NavItem id="nav-tasks" active={currentPage === 'planner'} icon={<Icons.CheckCircle className="w-5 h-5" />} label="Tasks" onClick={() => navigate('planner')} />
          <div className="relative -mt-12">
            <button 
              id="nav-center-btn"
              onClick={() => { if (showTutorial && tutorialStep === 5) setTutorialStep(6); setShowAddMenu(true); }}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-gold transition-all active:scale-90 ${showAddMenu ? 'bg-uitm-gold rotate-45' : 'bg-uitm-navy'} text-white`}
            >
              <Icons.Plus className="w-7 h-7" />
            </button>
          </div>
          <NavItem id="nav-notes" active={currentPage === 'notesHub'} icon={<Icons.List className="w-5 h-5" />} label="Notes" onClick={() => { if (showTutorial && tutorialStep === 10) setTutorialStep(11); navigate('notesHub'); }} />
          <NavItem id="nav-profile" active={currentPage === 'profileSettings'} icon={<Icons.User className="w-5 h-5" />} label="Profile" onClick={() => navigate('profileSettings')} />
        </nav>
      )}

      {/* Add Task Menu Popup */}
      {showAddMenu && (
        <div className="fixed inset-0 z-[150] bg-black/50" onClick={() => setShowAddMenu(false)}>
          <div 
            className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-2xl p-2 w-64"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => { setShowAddMenu(false); navigate('addTask'); }}
              className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 rounded-xl transition-colors"
            >
              <div className="w-10 h-10 bg-uitm-navy rounded-xl flex items-center justify-center">
                <Icons.Plus className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <div className="text-sm font-black text-gray-800">Add Manually</div>
                <div className="text-[10px] text-gray-400 font-medium">Create a new task yourself</div>
              </div>
            </button>
            <div className="h-px bg-gray-100 mx-4"></div>
            <button 
              id="ai-planner-option"
              onClick={() => { 
                if (showTutorial && tutorialStep === 6) setTutorialStep(7);
                setShowAddMenu(false); 
                setOpenAIChat(true); 
                navigate('planner'); 
              }}
              className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 rounded-xl transition-colors"
            >
              <div className="w-10 h-10 bg-uitm-gold rounded-xl flex items-center justify-center">
                <Icons.Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <div className="text-sm font-black text-gray-800">AI Planner</div>
                <div className="text-[10px] text-gray-400 font-medium">Let AI create tasks for you</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Tutorial Overlay */}
      {showTutorial && (
        <Tutorial 
          step={tutorialStep}
          onNext={() => {
            // Navigate back to dashboard after step 3 (graph explanation)
            if (tutorialStep === 2) navigate('dashboard');
            setTutorialStep(prev => prev + 1);
          }}
          onSkip={() => {
            setShowTutorial(false);
            setTutorialStep(1);
          }}
          onFinish={() => {
            setShowTutorial(false);
            setTutorialStep(0);
            localStorage.setItem('hasSeenTutorial', 'true');
          }}
        />
      )}
    </div>
  );
};

const NavItem = ({ id, active, icon, label, onClick }: any) => (
  <button id={id} onClick={onClick} className={`flex flex-col items-center gap-1 transition-all ${active ? 'text-uitm-navy' : 'text-gray-300'}`}>
    {icon}
    <span className={`text-[8px] font-black uppercase tracking-widest ${active ? 'opacity-100' : 'opacity-0'}`}>{label}</span>
  </button>
);

export default App;
