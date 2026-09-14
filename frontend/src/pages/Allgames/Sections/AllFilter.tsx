import type { ChangeEvent } from "react";

type AllFilterProps = {
  categories: string[];
  activeCategory: string;
  query: string;
  placeholder: string;
  onCategoryChange: (category: string) => void;
  onQueryChange: (query: string) => void;
  onClear: () => void;
};

function AllFilter({
  categories,
  activeCategory,
  query,
  placeholder,
  onCategoryChange,
  onQueryChange,
  onClear,
}: AllFilterProps) {
  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    onQueryChange(event.target.value);
  };

  const renderCategoryButton = (category: string) => (
    <button
      type="button"
      key={category}
      className={activeCategory === category ? "active" : ""}
      onClick={() => onCategoryChange(category)}
      aria-pressed={activeCategory === category}
    >
      {category === "ALL" ? "All games" : category}
    </button>
  );

  return (
    <>
      <label className="library-search">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={query}
          onChange={handleQueryChange}
          placeholder={placeholder}
          aria-label="Search games"
        />
      </label>
      <div className="category-filter" aria-label="Filter games by category">
        {categories.slice(0, 5).map(renderCategoryButton)}
        <button type="button" className="clear-filters" onClick={onClear}>
          Clear filters
        </button>
        {categories.slice(5).map(renderCategoryButton)}
      </div>
    </>
  );
}

export default AllFilter;
