const skillData = [
    { name: "Cooling reduction", desc: "Reduces cooldown of special ability by 10%.", requirement: 10 }
];

const renderSkillTree = () => {
    const list = document.querySelector('#skill-list');
    const pointsElement = document.querySelector('#skill-points');
    pointsElement.textContent = player.skillPoints || 0;

    list.innerHTML = '';
    skillData.forEach(skill => {
        const unlocked = player.skills.includes(skill.name);
        const canUnlock = !unlocked && player.skillPoints > 0 && player.lvl >= skill.requirement;
        const item = document.createElement('div');
        item.className = 'skill-item' + (unlocked ? ' unlocked' : '');
        item.innerHTML = `
            <h4>${skill.name} (Lv.${skill.requirement})</h4>
            <p>${skill.desc}</p>
            <button data-skill="${skill.name}" ${canUnlock ? '' : 'disabled'}>${unlocked ? 'Unlocked' : 'Unlock'}</button>
        `;
        list.appendChild(item);
    });
    list.querySelectorAll('button[data-skill]').forEach(btn => {
        btn.addEventListener('click', () => unlockSkill(btn.getAttribute('data-skill')));
    });
};

const openSkillTree = () => {
    sfxOpen.play();
    dungeon.status.exploring = false;
    skillTreeOpen = true;
    const modal = document.querySelector('#skillTreeModal');
    renderSkillTree();
    modal.style.display = 'flex';
};

const closeSkillTree = () => {
    sfxDecline.play();

    const modal = document.querySelector('#skillTreeModal');
    modal.style.display = 'none';
    skillTreeOpen = false;
    continueExploring();
};

const unlockSkill = (name) => {
    if (player.skillPoints > 0 && !player.skills.includes(name)) {
        player.skillPoints--;
        player.skills.push(name);
        playerLoadStats();
        renderSkillTree();
    }
};