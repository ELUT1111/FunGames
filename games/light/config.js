// 棱镜光鱼 · 全局配置
export const SPECTRUM = [
  { id:'red',    name:'红', hex:0xff3b4e },
  { id:'orange', name:'橙', hex:0xff9233 },
  { id:'yellow', name:'黄', hex:0xffe93b },
  { id:'green',  name:'绿', hex:0x3bff8e },
  { id:'cyan',   name:'青', hex:0x35e8ff },
  { id:'blue',   name:'蓝', hex:0x3b6cff },
  { id:'purple', name:'紫', hex:0xb44bff },
];
export const COLOR_OF = Object.fromEntries(SPECTRUM.map(s => [s.id, s.hex]));

// 五种可切换光谱模式（数字键 1-5）
export const MODES = [
  { key:'1', id:'red',    label:'红·烈焰冲刺', need:3, cd:0 },
  { key:'2', id:'blue',   label:'蓝·冰霜护盾', need:3, cd:8 },
  { key:'3', id:'green',  label:'绿·生命再生', need:3, cd:0 },
  { key:'4', id:'purple', label:'紫·虚空潜行', need:3, cd:10 },
  { key:'5', id:'yellow', label:'黄·电磁脉冲', need:3, cd:6 },
];

// 光谱融合表（无序组合）
export const FUSIONS = {
  'blue+red':    { name:'紫色虚空火焰', hex:0xc44dff },
  'green+yellow':{ name:'电磁生命藤蔓', hex:0xb8ff4d },
  'green+red':   { name:'剧毒腐蚀酸液', hex:0x7dff2e },
  'blue+yellow': { name:'雷电风暴',     hex:0x4de0ff },
};
export function fusionKey(a, b){ return [a, b].sort().join('+'); }

// 成长阶段：按已收集碎片总数
export const STAGES = [
  { at:0,  name:'无色透明',     scale:1.0 },
  { at:4,  name:'微光初染',     scale:1.25 },
  { at:9,  name:'双色辉光',     scale:1.55 },
  { at:16, name:'虹彩渐变',     scale:1.95 },
  { at:26, name:'钻石切割面',   scale:2.45 },
  { at:38, name:'七彩棱镜巨龙', scale:3.1 },
];

export const WORLD = {
  radius: 230,          // 活动半径
  floorY: -46,          // 海底高度
  ceilY: 60,            // 水面高度
  fishCount: 64,        // 光鱼数量
  predatorCount: 7,     // 掠食者数量
  reviveGoal: 49,       // 吞噬碎片达到此数 → 复苏度 100%
};
