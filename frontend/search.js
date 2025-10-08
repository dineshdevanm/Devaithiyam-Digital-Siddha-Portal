document.addEventListener('DOMContentLoaded', () => {
  const diseaseInput = document.getElementById('disease-input');
  const ingredientsInput = document.getElementById('ingredients-input');
  const runBtn = document.getElementById('run-search');
  const clearBtn = document.getElementById('clear-search');

  const diseaseResults = document.getElementById('disease-results');
  const diseasesForIngredientsEl = document.getElementById('diseases-for-ingredients');
  const ingredientRemedies = document.getElementById('ingredient-remedies');
  const remediesIntersectionEl = document.getElementById('remedies-intersection');
  // column wrappers for conditional display
  const colDisease = document.getElementById('col-disease');
  const colDisIng = document.getElementById('col-diseases-for-ingredients');
  const colIngRem = document.getElementById('col-ingredient-remedies');
  const colIntersect = document.getElementById('col-remedies-intersection');

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }
  function renderList(el, rows, type, matchInfo) {
    el.innerHTML = '';
    if (!rows || rows.length === 0) {
      el.innerHTML = '<li class="muted">No results</li>';
      return;
    }
    const frag = document.createDocumentFragment();
    rows.forEach((row, idx) => {
  const li = document.createElement('li');
      if (type === 'disease') {
        const name = escapeHtml(row.disease || row.name || 'Unknown');
        const symptoms = escapeHtml(row.sign_and_symptoms || '');
        const score = row.score !== undefined ? `<br/><small>Score: ${escapeHtml(String(row.score))}${row.token_coverage !== undefined ? ' | Coverage: ' + escapeHtml(String(row.token_coverage)) : ''}${row.matched_ingredients ? ' | Ingredients: ' + escapeHtml(row.matched_ingredients.join(', ')) : ''}</small>` : '';
        li.innerHTML = `<strong>${name}</strong><br/><small>${symptoms}</small>${score}`;
      } else if (type === 'remedy') {
        // Support two remedy shapes:
        // 1) remedy.csv rows with fields 'Remedy Name','Preparation','Usage'
        // 2) disease CSV rows where remedies are free text in 'remedy'
        const name = escapeHtml(row['Remedy Name'] || row.name || (row.disease ? ('From disease: ' + row.disease) : 'Remedy'));
        const prep = escapeHtml(row['Preparation'] || row['preparation'] || row.remedy || '');
        const usage = escapeHtml(row['Usage'] || row.usage || '');
        const url = `remedies.html?query=${encodeURIComponent(name)}`;
        let matchLine = '';
        if (matchInfo && matchInfo[idx]) {
          const mi = matchInfo[idx];
          const matched = (mi.matched || []).join(', ');
          const missing = (mi.missing || []).join(', ');
          matchLine = `<br/><small>Matched: ${escapeHtml(matched)}${missing ? ' | Missing: ' + escapeHtml(missing) : ''}${mi.coverage !== undefined ? ' | Coverage: ' + escapeHtml(String(mi.coverage)) : ''}${mi.score !== undefined ? ' | Score: ' + escapeHtml(String(mi.score)) : ''}</small>`;
        }
        const scoreBadge = row.score !== undefined ? `<br/><small>Overall Score: ${escapeHtml(String(row.score))}</small>` : '';
        li.innerHTML = `<strong>${name}</strong><br/><small>Prep: ${prep}</small><br/><small>Usage: ${usage}</small>${matchLine}${scoreBadge}`;
      }
      // Attach click to show modal with remedy/procedure details when applicable
      li.addEventListener('click', () => {
        try {
          const modal = document.getElementById('remedy-modal');
          const body = document.getElementById('remedy-modal-body');
          if (!modal || !body) return;
          // Build content
          let title = '';
          let content = '';
          if (type === 'remedy') {
            title = row['Remedy Name'] || row.name || 'Remedy Details';
            content += `<h2 id="remedy-modal-title">${escapeHtml(title)}</h2>`;
            if (row['Preparation'] || row.preparation || row.remedy) {
              content += `<h3>Preparation</h3><p>${escapeHtml(row['Preparation'] || row.preparation || row.remedy)}</p>`;
            }
            if (row['Usage'] || row.usage) {
              content += `<h3>Usage</h3><p>${escapeHtml(row['Usage'] || row.usage)}</p>`;
            }
          } else if (type === 'disease') {
            title = row.disease || row.name || 'Disease';
            content += `<h2 id="remedy-modal-title">${escapeHtml(title)}</h2>`;
            if (row.sign_and_symptoms) content += `<h3>Symptoms</h3><p>${escapeHtml(row.sign_and_symptoms)}</p>`;
            if (row.remedy) content += `<h3>Remedies / Procedure</h3><p>${escapeHtml(row.remedy)}</p>`;
            // If the backend attached a remedies array, show them
            if (row.remedies && Array.isArray(row.remedies) && row.remedies.length) {
              content += `<h3>Related Remedies</h3>`;
              row.remedies.forEach(r => {
                content += `<div style="margin-bottom:10px"><strong>${escapeHtml(r.name || '')}</strong><p>${escapeHtml(r.preparation || '')}</p><p>${escapeHtml(r.usage || '')}</p></div>`;
              });
            }
          }
          body.innerHTML = content || '<p>No additional details available.</p>';
          modal.style.display = 'block';
          modal.setAttribute('aria-hidden','false');
        } catch (e) {
          console.warn('Failed to open modal', e);
        }
      });
      frag.appendChild(li);
    });
    el.appendChild(frag);
  }

  async function runSearch() {
    const disease = diseaseInput.value.trim();
    const ingredients = ingredientsInput.value.trim();
    const url = new URL('http://127.0.0.1:8000/search/filters');
    if (disease) url.searchParams.set('disease', disease);
    if (ingredients) url.searchParams.set('ingredients', ingredients);

    runBtn.disabled = true;
    runBtn.textContent = 'Searching...';

    try {
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Determine which sections to show
      const hasDiseaseQuery = !!disease;
      const hasIngredientQuery = !!ingredients;

      // Clear & hide all first
  [colDisease, colDisIng, colIngRem].forEach(c => { if (c) c.style.display = 'none'; });
      diseaseResults.innerHTML = '';
      diseasesForIngredientsEl.innerHTML = '';
      ingredientRemedies.innerHTML = '';

      if (hasDiseaseQuery) {
        colDisease.style.display = 'block';
        renderList(diseaseResults, data.disease_matches, 'disease');
        const singlePrimary = data.disease_matches && data.disease_matches.length === 1 && data.disease_matches[0].primary;
        if (singlePrimary) {
          // Render embedded remedies under the disease list item
          const primaryLi = diseaseResults.querySelector('li');
          if (primaryLi) {
            const remedies = data.disease_matches[0].remedies || [];
            if (remedies.length) {
              const sub = document.createElement('ul');
              sub.className = 'nested-remedies';
              remedies.forEach(r => {
                const ri = document.createElement('li');
                ri.classList.add('result-card-item');
                ri.innerHTML = `<strong>${escapeHtml(r.name || 'Remedy')}</strong><br/><small>Preparation: ${escapeHtml(r.preparation || '')}</small><br/><small>Usage: ${escapeHtml(r.usage || '')}</small>`;
                sub.appendChild(ri);
              });
              primaryLi.appendChild(sub);
            }
          }
          // Also render any remedies_for_disease returned by the backend
          if (data.remedies_for_disease && data.remedies_for_disease.length) {
            colIngRem.style.display = 'block';
            renderList(ingredientRemedies, data.remedies_for_disease, 'remedy');
          }
        }
        else {
          // For non-primary matches, if backend provided remedies_for_disease, show them as well
          if (data.remedies_for_disease && data.remedies_for_disease.length) {
            colIngRem.style.display = 'block';
            renderList(ingredientRemedies, data.remedies_for_disease, 'remedy');
          }
        }
      }
      if (hasIngredientQuery) {
        colIngRem.style.display = 'block';
        renderList(ingredientRemedies, data.remedies_using_ingredients, 'remedy', data.ingredient_match_info);
        if (!hasDiseaseQuery) {
          colDisIng.style.display = 'block';
          renderList(diseasesForIngredientsEl, data.diseases_for_ingredients, 'disease');
        }
      }

      // If both disease and ingredient filters provided, compute intersection
      if (hasDiseaseQuery && hasIngredientQuery) {
        // Build maps by normalized name for quick lookup
        const norm = s => (s || '').toString().trim().toLowerCase();
        const byName = new Map();
        (data.remedies_for_disease || []).forEach(r => {
          const key = norm(r['Remedy Name'] || r.name || r.ResolvedName || '');
          if (key) byName.set(key, r);
        });
        const ingredientMatches = (data.remedies_using_ingredients || []);
        const intersection = [];
        const seen = new Set();
        // name-based intersection
        ingredientMatches.forEach(r => {
          const key = norm(r['Remedy Name'] || r.name || '');
          if (key && byName.has(key) && !seen.has(key)) {
            intersection.push(byName.get(key));
            seen.add(key);
          }
        });
        // fallback: try matching by checking if ingredient tokens are contained in the disease-remedy text
        if (intersection.length === 0 && data.query && data.query.ingredients && data.query.ingredients.length) {
          const tokens = data.query.ingredients.map(t => t.toLowerCase());
          const fallback = (data.remedies_for_disease || []).filter(r => {
            const prep = (r['Preparation'] || r.preparation || r.remedy || '').toLowerCase();
            return tokens.every(tok => prep.includes(tok));
          });
          fallback.forEach(r => { const k = norm(r['Remedy Name'] || r.name || ''); if (!seen.has(k)) { intersection.push(r); seen.add(k); } });
        }
        if (intersection.length) {
          colIntersect.style.display = 'block';
          renderList(remediesIntersectionEl, intersection, 'remedy');
        } else {
          colIntersect.style.display = 'none';
        }
      } else {
        if (colIntersect) colIntersect.style.display = 'none';
      }
      // If neither (shouldn't happen because user can click with empty) show message
      if (!hasDiseaseQuery && !hasIngredientQuery) {
        colDisease.style.display = 'block';
        diseaseResults.innerHTML = '<li class="muted">Enter a disease, ingredients, or both.</li>';
      }
    } catch (e) {
      console.error(e);
  [colDisease, colDisIng, colIngRem].forEach(c => { if (c) c.style.display = 'block'; });
      diseaseResults.innerHTML = '<li class="error">Search failed. Check server.</li>';
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = 'Search';
    }
  }

  runBtn.addEventListener('click', runSearch);
  clearBtn.addEventListener('click', () => {
    diseaseInput.value = '';
    ingredientsInput.value = '';
  [colDisease, colDisIng, colIngRem].forEach(c => { if (c) c.style.display = 'none'; });
  });

  // Modal close handlers
  const modal = document.getElementById('remedy-modal');
  const modalClose = document.getElementById('remedy-modal-close');
  if (modalClose) modalClose.addEventListener('click', () => {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden','true');
  });
  // Close when clicking outside modal-content
  if (modal) modal.addEventListener('click', (ev) => {
    if (ev.target === modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden','true');
    }
  });
  // Close on Escape key
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && modal && modal.style.display === 'block') {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden','true');
    }
  });
});
