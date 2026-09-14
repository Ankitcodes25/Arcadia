import { useEffect, useState } from "react";
import Navbar from "./components/Navbar";
import LandingPage from "./pages/Landingpage/Landingpage";
import Allgames from "./pages/Allgames/Allgames";
import { onNavigation } from "./navigation";

function App() {
  const getLocationKey = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const [path, setPath] = useState(getLocationKey);

  useEffect(() => onNavigation(() => setPath(getLocationKey())), []);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      return;
    }

    requestAnimationFrame(() => {
      const targetSection = document.getElementById(hash.slice(1));
      if (!targetSection) return;
      const navbarHeight = document.querySelector<HTMLElement>(".navbar")?.offsetHeight ?? 60;
      const topOffset = hash === "#popular" ? navbarHeight + 14 : navbarHeight + 2;
      window.scrollTo({
        top: window.scrollY + targetSection.getBoundingClientRect().top - topOffset,
        behavior: "smooth",
      });
    });
  }, [path]);

  return (
    <>
      <Navbar />
      {path.startsWith("/games") ? <Allgames /> : <LandingPage />}
    </>
  );
}

export default App;
