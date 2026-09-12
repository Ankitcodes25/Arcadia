import { useEffect, useMemo, useState } from "react";
import Footer from "../../components/Footer";
import { games, type Game } from "../Landingpage/gameData";
import AllFilter from "./Sections/AllFilter";
import AllGameCards from "./Sections/AllGameCards";
import WeeklyTrending from "./Sections/WeeklyTrending";
import "./Allgames.css";

const SEARCH_TEXT = "Search games...";

function Allgames() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [placeholder, setPlaceholder] = useState("");
  const categories = ["ALL", ...new Set(games.map((game) => game.category))];

  useEffect(() => {
    let index = 0;
    let deleting = false;
    const timer = setInterval(() => {
      if (!deleting) {
        index += 1;
        setPlaceholder(SEARCH_TEXT.slice(0, index));
        if (index >= SEARCH_TEXT.length) deleting = true;
      } else {
        index -= 1;
        setPlaceholder(SEARCH_TEXT.slice(0, index));
        if (index <= 0) deleting = false;
      }
    }, 125);

    return () => clearInterval(timer);
  }, []);

  const filteredGames = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return games.filter((game: Game) => {
      const matchesCategory = activeCategory === "ALL" || game.category === activeCategory;
      const matchesQuery = !normalizedQuery || [game.name, game.category, game.description]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, query]);

  const clearFilters = () => {
    setQuery("");
    setActiveCategory("ALL");
  };

  return (
    <div className="app all-games-page">
      <div className="background-glow glow-one" />
      <div className="background-glow glow-three" />
      <main>
        <section className="games-browser" aria-label="Browse all games">
          <div className="games-browser-layout">
            <div className="games-browser-controls">
              <div className="games-browser-top">
                <div>
                  <span className="section-label explore-label">EXPLORE</span>
                  <h2>All games</h2>
                </div>
              </div>
              <AllFilter
                categories={categories}
                activeCategory={activeCategory}
                query={query}
                placeholder={placeholder}
                onCategoryChange={setActiveCategory}
                onQueryChange={setQuery}
                onClear={clearFilters}
              />
            </div>
            <WeeklyTrending games={games} />
          </div>
          <AllGameCards
            games={filteredGames}
            heading={activeCategory === "ALL" ? "ALL GAMES" : activeCategory}
          />
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default Allgames;
