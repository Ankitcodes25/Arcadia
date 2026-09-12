export type Game = {
  name: string;
  category: string;
  icon: string;
  description: string;
  plays: number;
};

export const games: Game[] = [
  { name: "Ludo", category: "BOARD GAME", icon: "🎲", description: "Classic fun, anytime.", plays: 9800 },
  { name: "Snake", category: "ARCADE", icon: "🐍", description: "Grow longer and beat your high score.", plays: 8600 },
  { name: "Tic Tac Toe", category: "CLASSIC", icon: "⭕", description: "The classic X and O battle.", plays: 7400 },
  { name: "Rock Paper Scissors", category: "QUICK PLAY", icon: "✊", description: "Make your choice and challenge the computer.", plays: 6100 },
  { name: "Snake & Ladder", category: "BOARD GAME", icon: "🪜", description: "Climb ladders and avoid the snakes.", plays: 5200 },
  { name: "Memory", category: "PUZZLE", icon: "🧠", description: "Match the cards and test your memory.", plays: 4300 },
];
