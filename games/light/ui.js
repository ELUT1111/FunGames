// HUD 绑定：光谱芯片、模式槽、提示弹幕、复苏/生命条
import { SPECTRUM, MODES, COLOR_OF } from './config.js';

const $ = id => document.getElementById(id);
const css = hex => '#' + hex.toString(16).padStart(6, '0');

const chipCnt = {}, slotEls = {};

export function initHUD(){
  // 右上角七色碎片计数
  const tr = $('tr'); tr.innerHTML = '';
  for (const s of SPECTRUM){
    const div = document.createElement('div');
    div.className = 'chip';
    div.innerHTML = `<span class="dot" style="color:${css(s.hex)};background:${css(s.hex)}"></span>
      <span>${s.name}色光谱</span><span class="cnt">0</span>`;
    tr.appendChild(div);
    chipCnt[s.id] = div.querySelector('.cnt');
  }
  // 底部模式槽
  const modes = $('modes'); modes.innerHTML = '';
  for (const m of MODES){
    const div = document.createElement('div');
    div.className = 'slot locked';
    div.style.setProperty('--c', css(COLOR_OF[m.id]));
    div.innerHTML = `<span class="k" style="color:${css(COLOR_OF[m.id])}">${m.key}</span>
      <span>${m.label.split('·')[1]}</span><div class="cd"></div>`;
    modes.appendChild(div);
    slotEls[m.id] = { el: div, cd: div.querySelector('.cd') };
  }
}

export function setChip(id, n){ chipCnt[id].textContent = n; }

export function setSlot(id, { locked, active, cdFrac }){
  const s = slotEls[id]; if (!s) return;
  s.el.classList.toggle('locked', !!locked);
  s.el.classList.toggle('active', !!active);
  s.cd.style.height = (cdFrac > 0 ? cdFrac * 100 : 0) + '%';
}

export function setBars(revive, hp){
  $('reviveFill').style.width = (revive * 100).toFixed(1) + '%';
  $('revivePct').textContent = Math.round(revive * 100) + '%';
  $('hpFill').style.width = Math.max(0, hp) + '%';
}

export function setStage(text){ $('stage').textContent = text; }

export function toast(text, color = '#9fd8ff'){
  const div = document.createElement('div');
  div.className = 'toast';
  div.style.color = color;
  div.textContent = text;
  $('toasts').appendChild(div);
  setTimeout(() => div.remove(), 2700);
}

export function setFusionTag(text, color){
  const el = $('fusionTag');
  if (!text){ el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.textContent = text;
  el.style.color = color;
}

export function flashDamage(){
  const el = $('dmg');
  el.style.opacity = 1;
  setTimeout(() => el.style.opacity = 0, 130);
}

export function showDead(stats){
  $('deadStats').textContent = stats;
  $('dead').classList.remove('hidden');
  $('hud').classList.add('hidden');
}

export function showGame(){
  $('start').classList.add('hidden');
  $('dead').classList.add('hidden');
  $('hud').classList.remove('hidden');
}
