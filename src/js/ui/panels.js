import { QUESTS, TECHNOLOGIES, itemName } from "../domain/recipes.js?v=36";

function rewardText(reward = {}) {
  const parts = [];
  if (reward.money) parts.push(`$${reward.money}`);
  if (reward.research) parts.push(`연구점 ${reward.research}`);
  Object.entries(reward.items || {}).forEach(([id, amount]) => parts.push(`${itemName(id)} ${amount}`));
  return parts.join(" · ");
}

export function researchMarkup({ state, availableTech, lockExcept = null }) {
  return Object.values(TECHNOLOGIES).map((tech) => {
    const done = Boolean(state.research.completed[tech.id]);
    const available = availableTech(tech.id);
    const tutorialLocked = Boolean(lockExcept) && tech.id !== lockExcept && !done;
    const blocked = done || !available || tutorialLocked || state.research.points < tech.cost;
    const prerequisites = tech.requires.length
      ? tech.requires.map((id) => TECHNOLOGIES[id]?.name || id).join(", ")
      : "없음";
    const label = done
      ? "연구 완료"
      : tutorialLocked
        ? "튜토리얼 중 잠금"
        : available
          ? `연구 ${tech.cost}점`
          : "선행 연구 필요";
    return `
      <article class="recipe tech-card ${done ? "done" : available && !tutorialLocked ? "available" : "locked"}">
        <header><strong>${tech.name}</strong><span class="tier">${tech.cost} RP</span></header>
        <p>${tech.description}</p>
        <small class="placement-rule">선행: ${prerequisites}</small>
        <button type="button" class="primary-btn" data-research="${tech.id}"
          ${blocked ? "disabled" : ""}>
          ${label}
        </button>
      </article>
    `;
  }).join("");
}

export function questMarkup(state) {
  return QUESTS.map((quest) => {
    const done = Boolean(state.quests.completed[quest.id]);
    const value = Math.min(quest.target, state.quests.progress[quest.id] || 0);
    return `
      <article class="recipe quest-card ${done ? "done" : ""}">
        <header><strong>${quest.name}</strong><span class="tier">${value}/${quest.target}</span></header>
        <div class="progress-meter"><i style="width:${Math.round(value / quest.target * 100)}%"></i></div>
        <small class="reward-line">보상: ${rewardText(quest.reward)}</small>
        <p>${done ? "완료 · 보상 지급됨" : "공장 가동 이벤트를 자동 추적합니다."}</p>
      </article>
    `;
  }).join("");
}
