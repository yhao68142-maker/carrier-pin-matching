const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function delta(s){const n=Number(s);if(n===0)return '0';if(Math.abs(n)<.000001)return '≈0';return `${n>0?'+':''}${Number(n.toFixed(6))}`;}
const dimension=(value,difference,pass)=>`<td class="${pass?'dimension-pass':'dimension-fail'}"><strong>${esc(value)}</strong><small>${pass?'✓ 符合':'✕ 超差'} · Δ ${delta(difference)} mm</small></td>`;
export function renderResults(rows){
  if(!rows.length)return '尺寸库暂无可比较的记录。';
  const qualified=rows.filter(r=>r.qualified).length,top=rows.filter(r=>r.rank===1);
  const best=rows[0];
  return `<div class="match-summary"><strong>${qualified} 条符合公差 / 共 ${rows.length} 条候选</strong><p>${qualified?'最接近且符合要求':'最接近的候选（仍不符合公差）'}：${esc(best.code)} · ${esc(best.model)} · ${esc(best.x)} × ${esc(best.y)} mm${top.length>1?`，另有 ${top.length-1} 条并列第 1`:''}。</p></div>
  <p class="hint">绿色 ✓：该方向在 ±0.01 mm 内；红色 ✕：该方向超差。先排列两项均符合的候选，再按尺寸相似度从高到低排列；同相似度按总尺寸偏差排序，相同结果并列。</p>
  <details class="score-definition"><summary>尺寸相似度怎么算？</summary><p>相似度 = 100 × [1 − (X 相对偏差 + Y 相对偏差) ÷ 2]；每项相对偏差 = |测量值 − 标准值| ÷ 两者较大值，两者均为 0 时偏差为 0。相似度不是合格率或通用性概率，是否符合仍以 X/Y 各 ±0.01 mm 判断。数值仅为显示而简化，计算使用原始精度；Δ≈0 表示偏差小于 0.000001 mm。</p></details>
  <table class="ranking-table"><thead><tr><th>排名</th><th>尺寸相似度</th><th>结论</th><th>项目代码 / 机种</th><th>标准 X / mm</th><th>标准 Y / mm</th><th>原始字段 / 来源</th></tr></thead><tbody>${rows.map(r=>`<tr><td><span class="rank-number">${r.rank}</span></td><td><strong class="score-number">${r.similarity}%</strong></td><td><span class="match-badge ${r.qualified?'pass':'fail'}">${r.qualified?'✓ 两项符合':'✕ 不符合'}</span></td><td><strong>${esc(r.code)}</strong><small>${esc(r.model)}</small></td>${dimension(r.x,r.deltaX,r.passX)}${dimension(r.y,r.deltaY,r.passY)}<td>${esc(r.raw)}<small>${esc(r.sheet)}!${esc(r.cell)}</small></td></tr>`).join('')}</tbody></table>`;
}
