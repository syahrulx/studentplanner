/**
 * Connections-style word game puzzles.
 * Each puzzle has 4 groups of 4 words. The player must find which words belong together.
 * Difficulty: yellow (easiest) → green → blue → purple (hardest).
 */

export interface ConnectionsGroup {
  label: string;
  words: [string, string, string, string];
  color: 'yellow' | 'green' | 'blue' | 'purple';
}

export interface ConnectionsPuzzle {
  id: number;
  groups: [ConnectionsGroup, ConnectionsGroup, ConnectionsGroup, ConnectionsGroup];
}

const PUZZLES: ConnectionsPuzzle[] = [
  {
    id: 1,
    groups: [
      { label: 'Programming Languages', color: 'yellow', words: ['PYTHON', 'JAVA', 'KOTLIN', 'RUST'] },
      { label: 'Coffee Drinks', color: 'green', words: ['LATTE', 'MOCHA', 'ESPRESSO', 'AMERICANO'] },
      { label: 'University Assessments', color: 'blue', words: ['QUIZ', 'EXAM', 'TEST', 'VIVA'] },
      { label: 'Things That Are Graded', color: 'purple', words: ['EGGS', 'ROADS', 'STEEL', 'DIAMONDS'] },
    ],
  },
  {
    id: 2,
    groups: [
      { label: 'Parts of a Book', color: 'yellow', words: ['CHAPTER', 'INDEX', 'SPINE', 'COVER'] },
      { label: 'Body Parts', color: 'green', words: ['ELBOW', 'KNEE', 'SHOULDER', 'WRIST'] },
      { label: 'Data Structures', color: 'blue', words: ['STACK', 'QUEUE', 'TREE', 'GRAPH'] },
      { label: '_____ Table', color: 'purple', words: ['ROUND', 'HASH', 'TIMES', 'PERIODIC'] },
    ],
  },
  {
    id: 3,
    groups: [
      { label: 'Malaysian Foods', color: 'yellow', words: ['RENDANG', 'SATAY', 'LAKSA', 'LEMAK'] },
      { label: 'Math Operations', color: 'green', words: ['SUM', 'PRODUCT', 'DIFFERENCE', 'QUOTIENT'] },
      { label: 'Things in a Lab', color: 'blue', words: ['BEAKER', 'FLASK', 'PIPETTE', 'BURETTE'] },
      { label: 'Types of Keys', color: 'purple', words: ['PRIMARY', 'FOREIGN', 'COMPOSITE', 'CANDIDATE'] },
    ],
  },
  {
    id: 4,
    groups: [
      { label: 'Colors', color: 'yellow', words: ['RED', 'BLUE', 'GREEN', 'ORANGE'] },
      { label: 'Fruits', color: 'green', words: ['MANGO', 'BANANA', 'GRAPE', 'APPLE'] },
      { label: 'Tech Companies', color: 'blue', words: ['AMAZON', 'GOOGLE', 'META', 'TESLA'] },
      { label: 'Can Follow "BLACK"', color: 'purple', words: ['BERRY', 'BOARD', 'LIST', 'MARKET'] },
    ],
  },
  {
    id: 5,
    groups: [
      { label: 'School Subjects', color: 'yellow', words: ['BIOLOGY', 'PHYSICS', 'CHEMISTRY', 'HISTORY'] },
      { label: 'Card Games', color: 'green', words: ['POKER', 'BRIDGE', 'HEARTS', 'SOLITAIRE'] },
      { label: 'Network Protocols', color: 'blue', words: ['HTTP', 'FTP', 'SMTP', 'TCP'] },
      { label: '_____ Code', color: 'purple', words: ['ZIP', 'BAR', 'DRESS', 'SOURCE'] },
    ],
  },
  {
    id: 6,
    groups: [
      { label: 'Campus Locations', color: 'yellow', words: ['LIBRARY', 'CAFETERIA', 'DORM', 'STADIUM'] },
      { label: 'Musical Instruments', color: 'green', words: ['DRUM', 'GUITAR', 'PIANO', 'VIOLIN'] },
      { label: 'SQL Commands', color: 'blue', words: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
      { label: 'Types of Drive', color: 'purple', words: ['HARD', 'FLASH', 'TEST', 'GOOGLE'] },
    ],
  },
  {
    id: 7,
    groups: [
      { label: 'Study Methods', color: 'yellow', words: ['FLASHCARD', 'SUMMARY', 'MINDMAP', 'OUTLINE'] },
      { label: 'Weather', color: 'green', words: ['THUNDER', 'LIGHTNING', 'TORNADO', 'CYCLONE'] },
      { label: 'Design Patterns', color: 'blue', words: ['FACTORY', 'OBSERVER', 'SINGLETON', 'ADAPTER'] },
      { label: 'Famous _____ ', color: 'purple', words: ['FIVE', 'LAST', 'WORDS', 'GROUSE'] },
    ],
  },
  {
    id: 8,
    groups: [
      { label: 'Stationery', color: 'yellow', words: ['PENCIL', 'ERASER', 'RULER', 'STAPLER'] },
      { label: 'Planets', color: 'green', words: ['MARS', 'VENUS', 'SATURN', 'JUPITER'] },
      { label: 'Sorting Algorithms', color: 'blue', words: ['BUBBLE', 'MERGE', 'QUICK', 'HEAP'] },
      { label: 'Types of Memory', color: 'purple', words: ['CACHE', 'FLASH', 'VIRTUAL', 'RANDOM'] },
    ],
  },
  {
    id: 9,
    groups: [
      { label: 'Breakfast Items', color: 'yellow', words: ['TOAST', 'CEREAL', 'PANCAKE', 'WAFFLE'] },
      { label: 'Units of Measurement', color: 'green', words: ['METER', 'KILOGRAM', 'SECOND', 'AMPERE'] },
      { label: 'Git Commands', color: 'blue', words: ['COMMIT', 'BRANCH', 'MERGE', 'FETCH'] },
      { label: 'Things That Can Be "PULLED"', color: 'purple', words: ['MUSCLE', 'PORK', 'REQUEST', 'STRINGS'] },
    ],
  },
  {
    id: 10,
    groups: [
      { label: 'Sports', color: 'yellow', words: ['BADMINTON', 'FOOTBALL', 'CRICKET', 'TENNIS'] },
      { label: 'Punctuation', color: 'green', words: ['COMMA', 'COLON', 'PERIOD', 'DASH'] },
      { label: 'Cloud Services', color: 'blue', words: ['LAMBDA', 'DYNAMO', 'AURORA', 'GLACIER'] },
      { label: 'Also Greek Letters', color: 'purple', words: ['DELTA', 'SIGMA', 'ALPHA', 'OMEGA'] },
    ],
  },
  {
    id: 11,
    groups: [
      { label: 'Animals', color: 'yellow', words: ['TIGER', 'EAGLE', 'DOLPHIN', 'COBRA'] },
      { label: 'Computer Parts', color: 'green', words: ['MONITOR', 'KEYBOARD', 'MOUSE', 'SPEAKER'] },
      { label: 'Accounting Terms', color: 'blue', words: ['DEBIT', 'CREDIT', 'LEDGER', 'JOURNAL'] },
      { label: '_____ Board', color: 'purple', words: ['WHITE', 'CARD', 'DART', 'MOTHER'] },
    ],
  },
  {
    id: 12,
    groups: [
      { label: 'Drinks', color: 'yellow', words: ['WATER', 'JUICE', 'MILK', 'SODA'] },
      { label: 'Types of Graphs', color: 'green', words: ['BAR', 'PIE', 'LINE', 'SCATTER'] },
      { label: 'Philosophy Terms', color: 'blue', words: ['ETHICS', 'LOGIC', 'VIRTUE', 'TRUTH'] },
      { label: 'Can Follow "WHITE"', color: 'purple', words: ['HOUSE', 'NOISE', 'SPACE', 'COLLAR'] },
    ],
  },
  {
    id: 13,
    groups: [
      { label: 'Furniture', color: 'yellow', words: ['CHAIR', 'TABLE', 'SHELF', 'DESK'] },
      { label: 'Types of Loops', color: 'green', words: ['FOR', 'WHILE', 'DO', 'FOREACH'] },
      { label: 'Economics Terms', color: 'blue', words: ['SUPPLY', 'DEMAND', 'INFLATION', 'DEFICIT'] },
      { label: 'Things With Legs', color: 'purple', words: ['SPIDER', 'TRIPOD', 'JOURNEY', 'ARGUMENT'] },
    ],
  },
  {
    id: 14,
    groups: [
      { label: 'Vegetables', color: 'yellow', words: ['CARROT', 'POTATO', 'ONION', 'GARLIC'] },
      { label: 'Math Symbols', color: 'green', words: ['PLUS', 'MINUS', 'EQUALS', 'PERCENT'] },
      { label: 'Networking Devices', color: 'blue', words: ['ROUTER', 'SWITCH', 'MODEM', 'FIREWALL'] },
      { label: 'Also a Layer', color: 'purple', words: ['CAKE', 'OZONE', 'SESSION', 'TRANSPORT'] },
    ],
  },
  {
    id: 15,
    groups: [
      { label: 'Shapes', color: 'yellow', words: ['CIRCLE', 'SQUARE', 'TRIANGLE', 'HEXAGON'] },
      { label: 'Social Media', color: 'green', words: ['TWITTER', 'SNAPCHAT', 'TIKTOK', 'REDDIT'] },
      { label: 'Machine Learning', color: 'blue', words: ['NEURON', 'EPOCH', 'BATCH', 'TENSOR'] },
      { label: '_____ Net', color: 'purple', words: ['HAIR', 'SAFETY', 'BASKET', 'NEURAL'] },
    ],
  },
  {
    id: 16,
    groups: [
      { label: 'Clothes', color: 'yellow', words: ['SHIRT', 'JACKET', 'PANTS', 'HOODIE'] },
      { label: 'Chemical Elements', color: 'green', words: ['IRON', 'GOLD', 'SILVER', 'COPPER'] },
      { label: 'UX Design Terms', color: 'blue', words: ['WIREFRAME', 'PROTOTYPE', 'PERSONA', 'JOURNEY'] },
      { label: 'Types of Testing', color: 'purple', words: ['UNIT', 'SMOKE', 'STRESS', 'BETA'] },
    ],
  },
  {
    id: 17,
    groups: [
      { label: 'Emotions', color: 'yellow', words: ['HAPPY', 'ANGRY', 'SAD', 'EXCITED'] },
      { label: 'Database Types', color: 'green', words: ['MYSQL', 'POSTGRES', 'MONGO', 'REDIS'] },
      { label: 'Marketing Terms', color: 'blue', words: ['BRAND', 'SEGMENT', 'FUNNEL', 'REACH'] },
      { label: 'Types of Pitch', color: 'purple', words: ['SALES', 'PERFECT', 'ELEVATOR', 'FOOTBALL'] },
    ],
  },
  {
    id: 18,
    groups: [
      { label: 'Kitchen Items', color: 'yellow', words: ['SPOON', 'FORK', 'KNIFE', 'PLATE'] },
      { label: 'Virus Types', color: 'green', words: ['TROJAN', 'WORM', 'RANSOM', 'SPYWARE'] },
      { label: 'Statistical Terms', color: 'blue', words: ['MEAN', 'MEDIAN', 'MODE', 'VARIANCE'] },
      { label: 'Also Means "Average"', color: 'purple', words: ['FAIR', 'ORDINARY', 'MEDIUM', 'STANDARD'] },
    ],
  },
  {
    id: 19,
    groups: [
      { label: 'Trees', color: 'yellow', words: ['OAK', 'PINE', 'MAPLE', 'PALM'] },
      { label: 'CSS Properties', color: 'green', words: ['MARGIN', 'PADDING', 'BORDER', 'DISPLAY'] },
      { label: 'HR Terms', color: 'blue', words: ['HIRING', 'ONBOARD', 'APPRAISAL', 'PAYROLL'] },
      { label: '_____ Box', color: 'purple', words: ['SAND', 'CHECK', 'DROP', 'FLEX'] },
    ],
  },
  {
    id: 20,
    groups: [
      { label: 'Ocean Creatures', color: 'yellow', words: ['SHARK', 'WHALE', 'SQUID', 'CORAL'] },
      { label: 'API Methods', color: 'green', words: ['GET', 'POST', 'PUT', 'PATCH'] },
      { label: 'Business Models', color: 'blue', words: ['FREEMIUM', 'SAAS', 'FRANCHISE', 'STARTUP'] },
      { label: 'Things That Are "DEEP"', color: 'purple', words: ['LEARNING', 'SLEEP', 'FAKE', 'STATE'] },
    ],
  },
];

export function getPuzzle(id: number): ConnectionsPuzzle | undefined {
  return PUZZLES.find((p) => p.id === id);
}

export function getTotalPuzzles(): number {
  return PUZZLES.length;
}

export function getAllPuzzles(): ConnectionsPuzzle[] {
  return PUZZLES;
}
