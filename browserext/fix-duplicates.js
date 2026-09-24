// "Fix duplicates": takes the duplicates marked in the viewer, groups linked ids
// (chains like a -> b -> c become one group), lets the user pick each group's primary
// exercise and builds a merge prompt to copy. Uses globals from viewer.js.

const fixDialog = document.getElementById("fix-dialog");
const fixTitle = document.getElementById("fix-title");
const fixGroupsEl = document.getElementById("fix-groups");
const fixPromptBtn = document.getElementById("fix-generate");
const fixPromptWrap = document.getElementById("fix-prompt-wrap");
const fixPromptText = document.getElementById("fix-prompt");

let fixGroups = [];
let fixPrimaries = [];

function groupDuplicatePairs(pairs) {
  const parent = new Map();
  const find = (id) => {
    if (!parent.has(id)) parent.set(id, id);
    while (parent.get(id) !== id) {
      parent.set(id, parent.get(parent.get(id)));
      id = parent.get(id);
    }
    return id;
  };
  pairs.forEach(([a, b]) => parent.set(find(a), find(b)));

  const groups = new Map();
  [...parent.keys()].forEach((id) => {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  });
  return [...groups.values()];
}

function describeExercise(id) {
  const index = exercises.findIndex((e) => e.id === id);
  return { index, exercise: exercises[index] };
}

function renderFixGroups() {
  const done = fixPrimaries.filter(Boolean).length;
  fixTitle.textContent = `Fix duplicates: pick a primary to include a group (${done}/${fixGroups.length})`;
  fixPromptBtn.disabled = done === 0;
  fixGroupsEl.innerHTML = "";

  fixGroups.forEach((ids, groupIndex) => {
    const section = document.createElement("section");
    section.className = "fix-group";
    const heading = document.createElement("h3");
    heading.textContent = `Group ${groupIndex + 1}`;
    const options = document.createElement("div");
    options.className = "fix-options";

    ids.forEach((id) => {
      const { index, exercise } = describeExercise(id);
      const option = document.createElement("button");
      option.className = fixPrimaries[groupIndex] === id ? "picker-option selected" : "picker-option";
      option.onclick = () => {
        // Clicking the selected primary again unselects it, which leaves the group out of the prompt.
        fixPrimaries[groupIndex] = fixPrimaries[groupIndex] === id ? null : id;
        renderFixGroups();
      };
      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = exercise?.name || id;
      if (exercise?.imageFileId) img.src = imageUrl(exercise.imageFileId);
      const label = document.createElement("span");
      label.textContent = exercise ? `${index + 1}. ${exercise.name}` : `Unknown exercise ${id}`;
      option.append(img, label);
      options.appendChild(option);
    });

    section.append(heading, options);
    fixGroupsEl.appendChild(section);
  });
}

function exerciseLabel(id) {
  const { exercise } = describeExercise(id);
  return exercise ? `${id} (${exercise.name})` : id;
}

function buildMergePrompt() {
  // Groups without a primary are skipped.
  const selected = fixGroups
    .map((ids, groupIndex) => ({ ids, primary: fixPrimaries[groupIndex] }))
    .filter(({ primary }) => primary);
  const groups = selected.map(({ ids, primary }, groupIndex) => {
    const others = ids.filter((id) => id !== primary);
    return [
      `Group ${groupIndex + 1}:`,
      `- Primary: ${exerciseLabel(primary)}`,
      ...others.map((id) => `- Merge into primary: ${exerciseLabel(id)}`),
    ].join("\n");
  });
  return [
    "Merge the following exercises including their aliases in catalog/exercises.json.",
    "For each group, keep the primary exercise (its id and imageFileId) and move into it the information from the other exercises: " +
      "searchAlias and searchAliasPT (no repeated entries, and add the other exercises' name/namePT as aliases when they differ from the primary's), " +
      "plus any other field the primary is missing. Then remove the merged exercises from the catalog.",
    "",
    groups.join("\n\n"),
  ].join("\n");
}

document.getElementById("fix-duplicates").onclick = () => {
  const pairs = Object.entries(duplicates);
  if (!pairs.length) {
    showToast("No duplicates marked");
    return;
  }
  fixGroups = groupDuplicatePairs(pairs);
  fixPrimaries = fixGroups.map(() => null);
  fixPromptWrap.hidden = true;
  renderFixGroups();
  fixDialog.showModal();
};
fixPromptBtn.onclick = () => {
  fixPromptText.value = buildMergePrompt();
  fixPromptWrap.hidden = false;
  fixPromptWrap.scrollIntoView({ behavior: "smooth" });
};
document.getElementById("fix-copy").onclick = () => copy(fixPromptText.value, "merge prompt");
document.getElementById("close-fix").onclick = () => fixDialog.close();
fixDialog.onclick = (e) => { if (e.target === fixDialog) fixDialog.close(); };
