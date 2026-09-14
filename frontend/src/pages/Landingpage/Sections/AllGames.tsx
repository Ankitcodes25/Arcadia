// import { useState } from "react";
// import type { Game } from "../gameData";

// type AllGamesProps = { games: Game[] };

// function AllGames({ games }: AllGamesProps) {
//   const [query, setQuery] = useState("");
//   const filteredGames = games.filter((game) => game.name.toLowerCase().includes(query.toLowerCase()));

//   return (
//     <section className="section" id="games">
//       <div className="section-heading"><div><span className="section-label">ARCADIA LIBRARY</span><h2>All games</h2></div><label className="search-box"><span>⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search games..." aria-label="Search games" /></label></div>
//       <div className="game-grid">
//         {filteredGames.map((game) => <article className="game-card" key={game.name}>
//           <div className="game-card-top"><span className="game-category">{game.category}</span><button className="more-button" aria-label={`More options for ${game.name}`}>•••</button></div>
//           <div className="game-icon">{game.icon}</div><h3>{game.name}</h3><p>{game.description}</p><button className="game-card-button">Play <span>→</span></button>
//         </article>)}
//       </div>
//     </section>
//   );
// }

// export default AllGames;
