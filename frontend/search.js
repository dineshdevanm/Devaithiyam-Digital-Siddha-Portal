document.addEventListener('DOMContentLoaded', () => {
  const API_BASE = 'http://127.0.0.1:8000';
  const diseaseSelect = document.getElementById('disease-select');
  const ingredientContainer = document.getElementById('ingredient-filters');
  const runBtn = document.getElementById('run-search');
  const clearBtn = document.getElementById('clear-search');
  const resultsList = document.getElementById('remedy-results');
  const emptyState = document.getElementById('search-empty');

  async function loadFilters() {
    try {
      const res = await fetch(`${API_BASE}/filters`);
      const data = await res.json();

      // Populate diseases
      diseaseSelect.innerHTML = '<option value="">-- Choose Disease --</option>';
      const diseases = [...new Set(data.diseases || [])];
      diseases.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        diseaseSelect.appendChild(opt);
      });

      // Populate ingredients as checkboxes
      ingredientContainer.innerHTML = '';
      const ingredients = [...new Set(data.ingredients || [])];
      ingredients.forEach(i => {
        const label = document.createElement('label');
        label.classList.add('filter-option');
        label.innerHTML = `
          <input type="checkbox" name="ingredient" value="${i}">
          <span>${i}</span>`;
        ingredientContainer.appendChild(label);
      });
    } catch (e) {
      console.error("Filter load failed:", e);
    }
  }

  async function searchRemedies() {
    const disease = diseaseSelect.value.trim();
    const ingredients = Array.from(document.querySelectorAll('input[name="ingredient"]:checked'))
      .map(cb => cb.value.trim());

    if (!disease && ingredients.length === 0) {
      emptyState.textContent = "Please select a disease or ingredients to begin.";
      emptyState.style.display = "block";
      return;
    }

    runBtn.textContent = "Searching...";
    runBtn.disabled = true;
    resultsList.innerHTML = '';
    emptyState.style.display = 'none';

    try {
      const url = new URL(`${API_BASE}/search/filters`);
      if (disease) url.searchParams.set('disease', disease);
      if (ingredients.length) url.searchParams.set('ingredients', ingredients.join(','));
      const res = await fetch(url);
      const data = await res.json();

      if (data.results && data.results.length) {
        data.results.forEach(r => {
          const li = document.createElement('li');
          li.innerHTML = `
            <strong>${r["Remedy Name"]}</strong><br>
            <small><b>Ingredients:</b> ${r["Ingredients"]}</small><br>
            <small><b>Preparation:</b> ${r["Preparation"]}</small>`;
          resultsList.appendChild(li);
        });
      } else {
        emptyState.style.display = 'block';
        emptyState.textContent = data.message || "No remedies found.";
      }
    } catch (err) {
      console.error("Search failed:", err);
      emptyState.textContent = "Error performing search.";
      emptyState.style.display = "block";
    } finally {
      runBtn.textContent = "Search";
      runBtn.disabled = false;
    }
  }

  function clearFilters() {
    diseaseSelect.selectedIndex = 0;
    document.querySelectorAll('input[name="ingredient"]').forEach(cb => (cb.checked = false));
    resultsList.innerHTML = '';
    emptyState.textContent = "Select a disease or ingredients to begin.";
    emptyState.style.display = 'block';
  }

  runBtn.addEventListener('click', searchRemedies);
  clearBtn.addEventListener('click', clearFilters);

  loadFilters();
});
