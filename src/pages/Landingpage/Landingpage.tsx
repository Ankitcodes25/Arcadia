import Footer from "../../components/Footer";
import { games } from "./gameData";
import HeroSection from "./Sections/HeroSection";
import PopularGames from "./Sections/PopularGames";
//import AllGames from "./Sections/AllGames";
import BottomCta from "./Sections/BottomCta";
import ContinuePlaying from "./Sections/ContinuePlaying";
import DailyChallenge from "./Sections/DailyChallenge";
import Arcadion from "./Sections/Arcadion";

function LandingPage() {
  return (
    <div className="app">
      <div className="background-glow glow-one" />
      <div className="background-glow glow-two" />
      <div className="background-glow glow-three" />
      <main>
        <HeroSection games={games} />
        <PopularGames games={games} />
        {/* <AllGames games={games} /> */}
        <ContinuePlaying />
        <Arcadion />
        <DailyChallenge games={games} />
        <BottomCta />
      </main>
      <Footer />
    </div>
  );
}

export default LandingPage;