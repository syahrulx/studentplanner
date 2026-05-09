/**
 * Connections-style word game puzzles.
 * Difficulty tiers:
 *   Levels  1–20 : Easy   — straightforward categories
 *   Levels 21–40 : Medium — slight wordplay in purple
 *   Levels 41–60 : Hard   — double meanings, red herrings
 *   Levels 61–80 : Very Hard — tricky wordplay, misleading groups
 *   Levels 81–100: Expert — abstract, very sneaky connections
 */
import { PUZZLES_21_60 } from './puzzles21to60';
import { PUZZLES_61_100 } from './puzzles61to100';

export interface ConnectionsGroup {
  label: string;
  words: [string, string, string, string];
  color: 'yellow' | 'green' | 'blue' | 'purple';
}

export interface ConnectionsPuzzle {
  id: number;
  groups: [ConnectionsGroup, ConnectionsGroup, ConnectionsGroup, ConnectionsGroup];
}

const PUZZLES_1_20: ConnectionsPuzzle[] = [
  {
    id: 1,
    groups: [
      { label: 'Fruits', color: 'yellow', words: ['APPLE', 'MANGO', 'GRAPE', 'BANANA'] },
      { label: 'Colors', color: 'green', words: ['RED', 'BLUE', 'GREEN', 'ORANGE'] },
      { label: 'Countries', color: 'blue', words: ['TURKEY', 'CHILE', 'JORDAN', 'CHINA'] },
      { label: 'Also a Brand', color: 'purple', words: ['PUMA', 'JAGUAR', 'DOVE', 'SHELL'] },
    ],
  },
  {
    id: 2,
    groups: [
      { label: 'Kitchen Items', color: 'yellow', words: ['SPOON', 'FORK', 'KNIFE', 'PLATE'] },
      { label: 'Weather', color: 'green', words: ['THUNDER', 'RAIN', 'SNOW', 'WIND'] },
      { label: 'Musical Instruments', color: 'blue', words: ['DRUM', 'GUITAR', 'PIANO', 'VIOLIN'] },
      { label: '_____ Board', color: 'purple', words: ['SKATE', 'DART', 'KEY', 'CARD'] },
    ],
  },
  {
    id: 3,
    groups: [
      { label: 'Malaysian Food', color: 'yellow', words: ['RENDANG', 'SATAY', 'LAKSA', 'ROTI'] },
      { label: 'Furniture', color: 'green', words: ['CHAIR', 'TABLE', 'SHELF', 'DESK'] },
      { label: 'Things That Are Round', color: 'blue', words: ['COIN', 'WHEEL', 'CLOCK', 'PIZZA'] },
      { label: '_____ Light', color: 'purple', words: ['FLASH', 'SPOT', 'MOON', 'HIGH'] },
    ],
  },
  {
    id: 4,
    groups: [
      { label: 'Animals', color: 'yellow', words: ['TIGER', 'EAGLE', 'DOLPHIN', 'COBRA'] },
      { label: 'Emotions', color: 'green', words: ['HAPPY', 'ANGRY', 'SAD', 'EXCITED'] },
      { label: 'Types of Dance', color: 'blue', words: ['SALSA', 'WALTZ', 'TANGO', 'SWING'] },
      { label: 'Can Follow "SUN"', color: 'purple', words: ['FLOWER', 'BURN', 'RISE', 'SET'] },
    ],
  },
  {
    id: 5,
    groups: [
      { label: 'Breakfast Items', color: 'yellow', words: ['TOAST', 'CEREAL', 'PANCAKE', 'WAFFLE'] },
      { label: 'Sports', color: 'green', words: ['BADMINTON', 'FOOTBALL', 'CRICKET', 'TENNIS'] },
      { label: 'Parts of a House', color: 'blue', words: ['ROOF', 'WINDOW', 'DOOR', 'WALL'] },
      { label: 'Things That Can Be "BROKEN"', color: 'purple', words: ['HEART', 'RECORD', 'ICE', 'NEWS'] },
    ],
  },
  {
    id: 6,
    groups: [
      { label: 'Drinks', color: 'yellow', words: ['WATER', 'JUICE', 'MILK', 'SODA'] },
      { label: 'Vehicles', color: 'green', words: ['TRUCK', 'PLANE', 'BOAT', 'TRAIN'] },
      { label: 'Planets', color: 'blue', words: ['MARS', 'VENUS', 'SATURN', 'JUPITER'] },
      { label: 'Also a Chocolate Bar', color: 'purple', words: ['BOUNTY', 'TWIRL', 'BOOST', 'KIT'] },
    ],
  },
  {
    id: 7,
    groups: [
      { label: 'Clothes', color: 'yellow', words: ['SHIRT', 'JACKET', 'PANTS', 'HOODIE'] },
      { label: 'Shapes', color: 'green', words: ['CIRCLE', 'SQUARE', 'TRIANGLE', 'DIAMOND'] },
      { label: 'Things in a Classroom', color: 'blue', words: ['MARKER', 'ERASER', 'PROJECTOR', 'WHITEBOARD'] },
      { label: 'Also a Card Suit', color: 'purple', words: ['CLUB', 'SPADE', 'HEART', 'JACK'] },
    ],
  },
  {
    id: 8,
    groups: [
      { label: 'Vegetables', color: 'yellow', words: ['CARROT', 'POTATO', 'ONION', 'GARLIC'] },
      { label: 'Jobs', color: 'green', words: ['DOCTOR', 'PILOT', 'TEACHER', 'LAWYER'] },
      { label: 'Things With Strings', color: 'blue', words: ['KITE', 'PUPPET', 'GUITAR', 'BOW'] },
      { label: '_____ Stone', color: 'purple', words: ['MILE', 'KEY', 'LIME', 'SAND'] },
    ],
  },
  {
    id: 9,
    groups: [
      { label: 'Body Parts', color: 'yellow', words: ['ELBOW', 'KNEE', 'SHOULDER', 'WRIST'] },
      { label: 'Social Media', color: 'green', words: ['TWITTER', 'SNAPCHAT', 'TIKTOK', 'REDDIT'] },
      { label: 'Things That Melt', color: 'blue', words: ['ICE', 'CHEESE', 'BUTTER', 'SNOW'] },
      { label: 'Things That Are Also "FIRE"', color: 'purple', words: ['ALARM', 'TRUCK', 'WORK', 'PLACE'] },
    ],
  },
  {
    id: 10,
    groups: [
      { label: 'Desserts', color: 'yellow', words: ['CAKE', 'BROWNIE', 'COOKIE', 'PUDDING'] },
      { label: 'Flowers', color: 'green', words: ['ROSE', 'LILY', 'DAISY', 'TULIP'] },
      { label: 'Superheroes', color: 'blue', words: ['BATMAN', 'FLASH', 'THOR', 'HULK'] },
      { label: 'Also a Name', color: 'purple', words: ['GRACE', 'FAITH', 'HOPE', 'IRIS'] },
    ],
  },
  {
    id: 11,
    groups: [
      { label: 'Stationery', color: 'yellow', words: ['PENCIL', 'ERASER', 'RULER', 'STAPLER'] },
      { label: 'Ocean Creatures', color: 'green', words: ['SHARK', 'WHALE', 'SQUID', 'CORAL'] },
      { label: 'Things You Charge', color: 'blue', words: ['PHONE', 'LAPTOP', 'WATCH', 'TABLET'] },
      { label: 'Can Follow "BOOK"', color: 'purple', words: ['WORM', 'MARK', 'SHELF', 'STORE'] },
    ],
  },
  {
    id: 12,
    groups: [
      { label: 'Footwear', color: 'yellow', words: ['BOOTS', 'SANDALS', 'HEELS', 'SNEAKERS'] },
      { label: 'Trees', color: 'green', words: ['OAK', 'PINE', 'MAPLE', 'PALM'] },
      { label: 'Things in a Bag', color: 'blue', words: ['WALLET', 'KEYS', 'TISSUE', 'CHARGER'] },
      { label: 'Words Before "HOUSE"', color: 'purple', words: ['WARE', 'GREEN', 'FIRE', 'POWER'] },
    ],
  },
  {
    id: 13,
    groups: [
      { label: 'Spices', color: 'yellow', words: ['PEPPER', 'GINGER', 'CINNAMON', 'TURMERIC'] },
      { label: 'Types of Music', color: 'green', words: ['POP', 'JAZZ', 'ROCK', 'BLUES'] },
      { label: 'Things at a Beach', color: 'blue', words: ['SAND', 'WAVE', 'SHELL', 'SURF'] },
      { label: 'Also a Gemstone', color: 'purple', words: ['RUBY', 'JADE', 'AMBER', 'PEARL'] },
    ],
  },
  {
    id: 14,
    groups: [
      { label: 'Rooms in a House', color: 'yellow', words: ['KITCHEN', 'BEDROOM', 'BATHROOM', 'GARAGE'] },
      { label: 'Types of Bread', color: 'green', words: ['BAGUETTE', 'NAAN', 'PITA', 'CROISSANT'] },
      { label: 'Movie Genres', color: 'blue', words: ['COMEDY', 'HORROR', 'ACTION', 'DRAMA'] },
      { label: 'Things That Can Be "DOUBLE"', color: 'purple', words: ['DUTCH', 'AGENT', 'TAKE', 'CHECK'] },
    ],
  },
  {
    id: 15,
    groups: [
      { label: 'Dairy Products', color: 'yellow', words: ['CHEESE', 'YOGURT', 'CREAM', 'BUTTER'] },
      { label: 'Board Games', color: 'green', words: ['CHESS', 'MONOPOLY', 'SCRABBLE', 'RISK'] },
      { label: 'Things in the Sky', color: 'blue', words: ['CLOUD', 'STAR', 'RAINBOW', 'MOON'] },
      { label: 'Words After "PAPER"', color: 'purple', words: ['BACK', 'CLIP', 'WEIGHT', 'WORK'] },
    ],
  },
  {
    id: 16,
    groups: [
      { label: 'Metals', color: 'yellow', words: ['IRON', 'GOLD', 'SILVER', 'COPPER'] },
      { label: 'Hobbies', color: 'green', words: ['PAINTING', 'COOKING', 'FISHING', 'HIKING'] },
      { label: 'Things That Spin', color: 'blue', words: ['TOP', 'WHEEL', 'FAN', 'GLOBE'] },
      { label: '_____ Ring', color: 'purple', words: ['EAR', 'BOXING', 'SPRING', 'KEY'] },
    ],
  },
  {
    id: 17,
    groups: [
      { label: 'Fruits With Seeds', color: 'yellow', words: ['WATERMELON', 'PAPAYA', 'GUAVA', 'POMEGRANATE'] },
      { label: 'Seasons', color: 'green', words: ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] },
      { label: 'Things That Buzz', color: 'blue', words: ['BEE', 'PHONE', 'ALARM', 'RAZOR'] },
      { label: 'Words Before "BALL"', color: 'purple', words: ['FOOT', 'BASE', 'BASKET', 'SNOW'] },
    ],
  },
  {
    id: 18,
    groups: [
      { label: 'Pets', color: 'yellow', words: ['DOG', 'CAT', 'HAMSTER', 'RABBIT'] },
      { label: 'School Supplies', color: 'green', words: ['NOTEBOOK', 'PEN', 'FOLDER', 'CALCULATOR'] },
      { label: 'Things That Drip', color: 'blue', words: ['TAP', 'CANDLE', 'PAINT', 'SWEAT'] },
      { label: 'Also a Type of "SHOT"', color: 'purple', words: ['MOON', 'LONG', 'BIG', 'HEAD'] },
    ],
  },
  {
    id: 19,
    groups: [
      { label: 'Insects', color: 'yellow', words: ['ANT', 'BEETLE', 'FIREFLY', 'CRICKET'] },
      { label: 'Currencies', color: 'green', words: ['RINGGIT', 'DOLLAR', 'POUND', 'EURO'] },
      { label: 'Things That Are Sticky', color: 'blue', words: ['TAPE', 'GLUE', 'HONEY', 'GUM'] },
      { label: 'Can Follow "WATER"', color: 'purple', words: ['FALL', 'PROOF', 'MARK', 'MELON'] },
    ],
  },
  {
    id: 20,
    groups: [
      { label: 'Berries', color: 'yellow', words: ['BLUEBERRY', 'RASPBERRY', 'CRANBERRY', 'BLACKBERRY'] },
      { label: 'Things With Wheels', color: 'green', words: ['BICYCLE', 'TROLLEY', 'SKATEBOARD', 'SCOOTER'] },
      { label: 'Things That Pop', color: 'blue', words: ['BALLOON', 'BUBBLE', 'CORN', 'CHAMPAGNE'] },
      { label: 'Words After "BREAK"', color: 'purple', words: ['FAST', 'DOWN', 'THROUGH', 'AWAY'] },
    ],
  },
];

// Merge all 100 puzzles
const ALL_PUZZLES: ConnectionsPuzzle[] = [
  ...PUZZLES_1_20,
  ...PUZZLES_21_60,
  ...PUZZLES_61_100,
];

export function getPuzzle(id: number): ConnectionsPuzzle | undefined {
  return ALL_PUZZLES.find((p) => p.id === id);
}

export function getTotalPuzzles(): number {
  return ALL_PUZZLES.length;
}

export function getAllPuzzles(): ConnectionsPuzzle[] {
  return ALL_PUZZLES;
}
