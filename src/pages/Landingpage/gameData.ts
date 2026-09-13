export type Game = {
  name: string;
  category: string;
  icon: string;
  description: string;
  plays: number;
};

export const games: Game[] = [

  { 
    name: "Ludo", 
    category: "BOARD GAME", 
    icon: "🎲", 
    description: "Outplay Arcadion and rule the board.", 
    plays: 9800 
  },

  { 
    name: "Snake", 
    category: "ARCADE", 
    icon: "🐍", 
    description: "Grow longer and survive Arcadion's challenge.", 
    plays: 8600 
  },

  { 
    name: "Tic Tac Toe", 
    category: "CLASSIC", 
    icon: "⭕", 
    description: "Outsmart Arcadion in the X and O battle.", 
    plays: 7400 
  },

  { 
    name: "Rock Paper Scissors", 
    category: "QUICK PLAY", 
    icon: "✊", 
    description: "Make your move and challenge Arcadion.", 
    plays: 6100 
  },

  { 
    name: "Snake & Ladder", 
    category: "BOARD GAME", 
    icon: "🪜", 
    description: "Climb your way up and escape Arcadion.", 
    plays: 5200 
  },

  { 
    name: "Memory", 
    category: "PUZZLE", 
    icon: "🧠", 
    description: "Match the cards and outthink Arcadion.", 
    plays: 4300 
  },

];