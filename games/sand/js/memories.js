/* =========================================================
 * memories.js — 记忆之沙：十段叙事、融入/埋葬抉择、进化与结局
 * ========================================================= */
'use strict';

const MEMORY_DATA = [
  {
    id: 'windchime', color: 'gold', pos: [10, 15], title: '风铃',
    story: '一串贝壳做的风铃挂在窗前。小女孩每天踮起脚去够它，够不着，就咯咯地笑。风穿过小巷，铃声叮咚，混着晚饭的香气。那是这座城市最普通、也最幸福的一个黄昏。',
    after: '沙漏深处，传来一声极轻的铃响。',
  },
  {
    id: 'baker', color: 'gold', pos: [-63, -43], title: '面包师的清晨',
    story: '天还没亮，炉火已经醒了。面包师把揉好的面团排进炉膛，哼着不成调的歌。第一炉麦香漫出窗口时，整条街都会跟着醒来。他说：只要炉火不灭，这条街就有明天。',
    after: '你闻到了麦香——在这片沙海里，那不可能存在的麦香。',
  },
  {
    id: 'wedding', color: 'gold', pos: null, title: '婚礼之瓶', hidden: true,
    story: '陶匠为女儿的婚礼烧制了这只花瓶，釉色是晚霞的颜色。婚礼那天，全城的人都来了，花瓶里插满沙漠玫瑰。新娘说，要让它传给女儿，再传给女儿的女儿。',
    after: '釉色里的晚霞，此刻正落在你的沙漏里。',
  },
  {
    id: 'lighthouse', color: 'gold', pos: null, tower: true, title: '灯塔守望者',
    story: '商队在沙海中迷途时，只要望见这座塔上的光，就知道家的方向。守塔人五十年没有离开过塔顶一步。有人问他孤不孤独，他指着远方说：每一盏归来的灯，都是我的朋友。',
    after: '塔顶的风里，你听见五十年的灯火在低语。',
  },
  {
    id: 'ship', color: 'blue', pos: [33, -87], title: '离港的船',
    story: '沙海曾经是真正的海。少年站在码头，看那艘白船越来越小。船上的人答应过会回来，带着满舱的故事。后来海干了，码头沉进沙里，少年变成了老人，还是每天来这里张望。',
    after: '一滴咸涩的东西，落进了你的金沙之中。',
  },
  {
    id: 'lesson', color: 'blue', pos: [108, 4], title: '最后一课',
    story: '沙暴的警钟响起时，老教师没有跑。他对最后一排空了一半的孩子们说：把这一段抄完，历史不能停在半句话上。粉笔灰落在他的肩头，像提前到来的沙。那一课，没有下课铃。',
    after: '半句话的历史，终于在你掌心写完了。',
  },
  {
    id: 'well', color: 'blue', pos: [-40, 120], title: '枯井',
    story: '旱季的第三年，井底只剩一汪月亮。母亲每夜把水桶放下去，再空着提上来，却总对孩子说：明天就有水了。孩子睡着后，她对着井口轻轻地哭，哭声落进井里，也没有回音。',
    after: '井底的月亮，碎成了蓝色的沙。',
  },
  {
    id: 'clocktower', color: 'gray', pos: [-3, 98], title: '钟楼上的影子',
    story: '大钟停摆的那个下午，全城的人都抬头看。修钟匠爬上钟楼，却在齿轮间发现了不该存在的东西——沙，从机械的缝隙里渗出来，像伤口渗血。他第一次感到，时间本身在害怕。',
    after: '齿轮间的恐惧，冰冷地硌着你的指尖。',
  },
  {
    id: 'flight', color: 'gray', pos: [120, -12], title: '逃亡之夜',
    story: '沙墙吞掉南城的那一夜，所有人都在跑。有人摔倒了，没有人停下来。火把、哭喊、被踩碎的家当。一个声音在人群里喊：别回头！于是没有人回头，没有人看见城市最后的样子。',
    after: '你替他们回了头。你看见了。',
  },
  {
    id: 'sin', color: 'black', pos: [-120, -100], title: '启沙之人',
    story: '是我。是我打开了时之器。他们说沙漏底层封着神明的时间，足够让枯海复生。我只是想让雨回来……仪式失败的瞬间，我看见时间从裂缝里倒灌而出，凝成沙，淹没了一切。我造出了你——最后的沙漏，把世界的记忆装进去。如果你恨我，就把这粒沙埋了吧。',
    after: '最沉重的一粒沙。它在你的沙漏里，烫得像一颗心脏。',
  },
];

/* ---------------- 生成沙粒 ---------------- */
G.buildGrains = function (scene) {
  for (const m of MEMORY_DATA) {
    let p;
    if (m.tower) {
      p = new THREE.Vector3(G.tower.x, G.tower.topY + 1.6, G.tower.z);
    } else if (m.hidden) {
      p = new THREE.Vector3(0, -100, 0); // 等待花瓶重圆后出现
    } else {
      p = new THREE.Vector3(m.pos[0], G.terrainHeight(m.pos[0], m.pos[1]) + 1.6, m.pos[1]);
    }
    const vis = G.fx.makeGrainVisual(scene, p, GRAIN_COLORS[m.color].hex);
    if (m.hidden) vis.grp.visible = false;
    G.grains.push({ data: m, vis, taken: false, active: !m.hidden });
  }
  // 花瓶重圆 → 婚礼之瓶现身
  G.onVaseComplete = function (pos) {
    const g = G.grains.find(g => g.data.id === 'wedding');
    g.vis.grp.position.copy(pos);
    g.vis.baseY = pos.y;
    g.vis.grp.visible = true;
    g.active = true;
    G.fx.burst(pos, 0xffd780, 70, 6);
  };
};

/* ---------------- 拾取 → 抉择弹窗 ---------------- */
let currentGrain = null;
G.modalOpen = false;

G.checkGrains = function (playerPos) {
  if (G.modalOpen) return;
  for (const g of G.grains) {
    if (g.taken || !g.active) continue;
    if (playerPos.distanceTo(g.vis.grp.position) < 2.8) {
      openMemoryModal(g);
      return;
    }
  }
};
G.updateGrains = function (dt, playerPos) {
  for (const g of G.grains) {
    if (g.taken || !g.active) continue;
    g.vis.update(dt, playerPos);
  }
};

function openMemoryModal(g) {
  currentGrain = g;
  G.modalOpen = true;
  G.paused = true;
  document.exitPointerLock && document.exitPointerLock();
  const c = GRAIN_COLORS[g.data.color];
  $('memOrb').style.background = `radial-gradient(circle at 35% 30%, #fff, ${c.css})`;
  $('memColorName').textContent = c.name;
  $('memTitle').textContent = '「 ' + g.data.title + ' 」';
  $('memStory').textContent = g.data.story;
  $('memoryModal').classList.add('open');
  G.audio && G.audio.memoryOpen();
}

function closeMemoryModal() {
  $('memoryModal').classList.remove('open');
  G.modalOpen = false;
  G.paused = false;
  setHint('点击画面继续');
}

function absorbedTotal() {
  return G.absorbed.gold + G.absorbed.blue + G.absorbed.gray + G.absorbed.black;
}

const STAGE_TOASTS = [
  null,
  '形态进化 · 沙肤初成 —— 获得「沙之脉冲」（左键）',
  '形态进化 · 晶骨流金 —— 晶体关节亮起',
  '形态进化 · 时之完体 —— 金沙流光，可二段跳',
];

function decideGrain(absorb) {
  const g = currentGrain;
  if (!g) return;
  g.taken = true;
  const pos = g.vis.grp.position.clone();
  const colorHex = GRAIN_COLORS[g.data.color].hex;

  if (absorb) {
    G.absorbed[g.data.color]++;
    G.restorationTarget = absorbedTotal() / G.totalGrains;
    G.fx.burst(pos, colorHex, 80, 7);
    G.fx.burst(G.player.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xffe9b0, 50, 4);
    G.audio && G.audio.absorb();
    subtitle(g.data.after);
    // 进化检查
    const t = absorbedTotal();
    const newStage = t >= 8 ? 3 : t >= 5 ? 2 : t >= 2 ? 1 : 0;
    if (newStage > G.stage) {
      G.player.applyStage(newStage);
      setTimeout(() => toast(STAGE_TOASTS[newStage], 3.5), 1200);
      G.audio && setTimeout(() => G.audio.evolve(), 1200);
    }
    // 世界复苏的涟漪
    if (t === 3) setTimeout(() => subtitle('远处——流沙正从废墟的表面缓缓退去……'), 4000);
    if (t === 5) setTimeout(() => subtitle('枯树的枝头泛起了绿意。虚影们的轮廓，清晰了一些。'), 4000);
    if (t === 7) setTimeout(() => subtitle('你听见了吗？河水回来了。'), 4000);
  } else {
    G.buried[g.data.color]++;
    G.speedBonus += 0.05;
    G.fx.burst(pos, 0x777788, 60, 3);
    G.audio && G.audio.bury();
    subtitle('沙粒沉入沙海深处。有些重量，你选择不再背负。');
  }

  g.vis.dispose();
  G.decided++;
  updateMemChips();

  if (G.decided >= G.totalGrains) {
    setTimeout(() => {
      G.altar.risen = true;
      $('objText').textContent = '前往世界中心 · 圣坛';
      subtitle('沙海的中心，有什么东西正在升起——去吧，做出最后的回答。');
      toast('中央圣坛 · 苏醒');
      G.audio && G.audio.altarRise();
    }, 2500);
  } else {
    $('objText').textContent = `找回散落的记忆之沙（${G.decided} / ${G.totalGrains}）`;
  }
  currentGrain = null;
  closeMemoryModal();
}

function updateMemChips() {
  $('cGold').textContent = G.absorbed.gold;
  $('cBlue').textContent = G.absorbed.blue;
  $('cGray').textContent = G.absorbed.gray;
  $('cBlack').textContent = G.absorbed.black;
}

G.bindMemoryUI = function () {
  $('btnAbsorb').addEventListener('click', () => decideGrain(true));
  $('btnBury').addEventListener('click', () => decideGrain(false));
};

/* ---------------- 结局 ---------------- */
G.computeEnding = function () {
  const t = absorbedTotal();
  const buriedTotal = G.buried.gold + G.buried.blue + G.buried.gray + G.buried.black;
  const stats = `融入 ${t} 粒 · 埋葬 ${buriedTotal} 粒 ｜ 金 ${G.absorbed.gold} · 蓝 ${G.absorbed.blue} · 灰 ${G.absorbed.gray} · 黑 ${G.absorbed.black}`;

  if (t >= 10) {
    return {
      title: '完 整 之 世', stats,
      text: '你把一切都装了回去——欢笑与泪水，恐惧与罪孽。沙漏在你胸中燃烧如心脏，世界轰然苏醒：河流奔涌，钟楼重新走动，街道上的人们彼此呼唤着名字。他们记得疼痛，所以懂得珍惜。\n\n启沙之人在圣坛前向你跪下。你扶起了他。\n\n你终于明白自己是谁：不是沙漏的囚徒，而是世界的记忆本身。只要你还行走，这个世界就再也不会遗忘。',
    };
  }
  if (G.buried.black > 0 && t >= 6) {
    return {
      title: '虚 假 天 堂', stats,
      text: '你埋葬了那些太过沉重的沙。世界苏醒了——明亮、温暖、处处欢歌。没有人记得沙暴，没有人记得罪孽，连离别都变得轻飘飘的。\n\n只是偶尔，在黄昏，人们会突然停下脚步，望着地平线发怔，仿佛丢失了什么重要的东西，却怎么也想不起来。\n\n你站在人群之外。只有你知道沙海深处埋着什么。这份完美，由你一个人的记忆来偿还。',
    };
  }
  if (t <= 3) {
    return {
      title: '永 恒 沙 海', stats,
      text: '你几乎什么都没有留下。沙粒一一沉入海底，世界保持着它金色的、寂静的形状。\n\n或许这才是仁慈——不再有人需要哭泣，因为不再有人记得哭泣的理由。风继续雕刻着废墟，把它们磨成温柔的弧线。\n\n一个几乎透明的身影仍在沙海上行走，不知疲倦。她已经忘了自己在寻找什么。但她仍在行走。这是她唯一记得的事。',
    };
  }
  return {
    title: '不 完 整 的 黎 明', stats,
    text: '世界半梦半醒。有些街道重新喧闹起来，有些却永远沉默地留在沙下。复苏的人们偶尔会指着记忆里的空白处发问，然后耸耸肩，继续生活。\n\n残缺，但是真实。就像所有从灾难里站起来的世界一样。\n\n你坐在圣坛边缘，看第一场真正的雨落在沙海上。雨水冲出的小小沟壑里，有什么东西在发芽。',
  };
};
