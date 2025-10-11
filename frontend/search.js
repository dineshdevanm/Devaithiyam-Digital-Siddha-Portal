document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = "http://127.0.0.1:8000";
  const diseaseSelect = document.getElementById("disease-select");
  const ingredientFilters = document.getElementById("ingredient-filters");
  const runSearch = document.getElementById("run-search");
  const clearSearch = document.getElementById("clear-search");
  const resultsContainer = document.getElementById("ingredient-remedies");
  const diseaseResults = document.getElementById("disease-results");
  const resultGroup = document.getElementById("col-ingredient-remedies");
  const emptyMsg = document.getElementById("search-empty");

  async function loadFilters() {
    try {
      const res = await fetch(`${API_BASE}/filters`);
      const data = await res.json();

      // Populate diseases
      data.diseases.forEach(d => {
        const option = document.createElement("option");
        option.value = d;
        option.textContent = d;
        diseaseSelect.appendChild(option);
      });

      // Populate ingredients
      data.ingredients.forEach(i => {
        const label = document.createElement("label");
        label.classList.add("checkbox-item");
        label.innerHTML = `<input type="checkbox" value="${i}"> ${i}`;
        ingredientFilters.appendChild(label);
      });
    } catch (err) {
      console.error("Error loading filters:", err);
      emptyMsg.textContent = "Failed to load filters.";
    }
  }

  async function performSearch() {
    const disease = diseaseSelect.value.trim();
    const ingredients = Array.from(
      ingredientFilters.querySelectorAll("input:checked")
    ).map(cb => cb.value);

    if (!disease && ingredients.length === 0) {
      emptyMsg.textContent = "Please select a disease or ingredients to begin.";
      return;
    }

    emptyMsg.textContent = "Searching...";
    resultsContainer.innerHTML = "";
    resultGroup.style.display = "none";

    try {
      const url = new URL(`${API_BASE}/search/filters`);
      if (disease) url.searchParams.set("disease", disease);
      if (ingredients.length) url.searchParams.set("ingredients", ingredients.join(","));

      const res = await fetch(url);
      const data = await res.json();

      if (!data.results || data.results.length === 0) {
        emptyMsg.textContent = data.message || "No results found.";
        return;
      }

      emptyMsg.textContent = data.message;
      resultGroup.style.display = "block";

      data.results.forEach(r => {
        const li = document.createElement("li");
        li.classList.add("result-card");
        li.innerHTML = `
          <h3>${r["Remedy Name"]}</h3>
          <p><strong>Disease:</strong> ${r["Disease"]}</p>
          <p><strong>Ingredients:</strong> ${r["Ingredients"]}</p>
          <p><strong>Preparation:</strong> ${r["Preparation"]}</p>
        `;
        resultsContainer.appendChild(li);
      });
    } catch (err) {
      console.error("Search error:", err);
      emptyMsg.textContent = "Search failed. Try again.";
    }
  }

  function clearFilters() {
    diseaseSelect.value = "";
    ingredientFilters.querySelectorAll("input").forEach(cb => cb.checked = false);
    resultsContainer.innerHTML = "";
    emptyMsg.textContent = "Select a disease or ingredients to begin.";
    resultGroup.style.display = "none";
  }

  loadFilters();
  runSearch.addEventListener("click", performSearch);
  clearSearch.addEventListener("click", clearFilters);
});
