# 《撞个正着》— 玩法研究与设计交付

一个 2D 滑块解谜 H5 游戏的**玩法验证 + 选型 + 设计文档**。

> **一句话玩法**：拖一个方块，它会一直滑到底；撞上同色方块，两块一起消失。
>
> **微创新**：消除只移除、不新增，所以每消一对等于**拆掉两堵墙**。核心抉择是"这一对现在消，还是留着当刹车"。

---

## 0. 现在是什么状态

| 阶段 | 状态 |
|---|---|
| 候选玩法研究（A/B/C） | ✅ 完成 |
| 规则模拟器 + A\* 求解器 | ✅ 完成 |
| 13 个关卡实证（可解 / par / 贪心 / 乱滑） | ✅ 完成 |
| 方案对比与最终选型 | ✅ 完成（选 A） |
| 50 关难度曲线与 GDD | ✅ 完成（13 关已验证，其余为目标规格） |
| 游戏本体 | ✅ 前 3 关可玩（11-06 第 1 关 / 11-07 第 1–3 关 + 步数/撤销/结算） |

> 当前版本：3 个教学关，2/2/3 步最优；步数上限 6/6/5；支持无限撤销（退还步数）、重开、失败后撤销续玩、星级结算、音效与静音、玩法弹窗。关卡数据在 `src/levels.js`，追加新关只需按同结构写入，`npm test` 会校验 par 与可解性。

---

## 1. 文档怎么读

建议顺序：

| 顺序 | 文件 | 回答什么问题 |
|---:|---|---|
| 1 | [`docs/A_候选玩法分析与比较.md`](docs/A_候选玩法分析与比较.md) | A/B/C 各是什么？用什么指标判断？为什么 B 不是"太浅"？ |
| 2 | [`docs/B_最小关卡验证.md`](docs/B_最小关卡验证.md) | 6 个关卡逐关验证：解法、考验点、四种"跳解检查" |
| 3 | [`docs/C_最终方案选型结论.md`](docs/C_最终方案选型结论.md) | 为什么选 A？放弃 B/C 的确切理由？什么情况下该推翻？ |
| 4 | [`docs/D_游戏设计文档.md`](docs/D_游戏设计文档.md) | 完整 GDD：规则、微创新、反馈、前 3 关、50 关曲线、10 个代表关卡、界面、技术方案 |
| 5 | [`docs/E_后续开发任务清单.md`](docs/E_后续开发任务清单.md) | 11-05 → 11-15 每天做什么、验收标准、入库门槛、试玩模板 |

只想看结论：读 `C` 的 §1 与 §3。

---

## 2. 目录

```
.
├─ README.md
├─ index.html                 # 游戏入口（ES Module，需 HTTP 打开）
├─ styles.css                 # 竖屏布局 / HUD / 弹窗
├─ package.json               # 仅 scripts，无依赖
├─ .github/workflows/deploy.yml  # push main → 跑测试 → 发布 GitHub Pages
├─ src/
│  ├─ game.js                 # 规则内核（纯函数，可与 research 对拍）
│  ├─ levels.js               # 关卡数据（当前仅第 1 关）
│  ├─ render.js               # Canvas 2D 绘制 / 拖拽预览 / 动画
│  ├─ input.js                # Pointer Events 拖拽状态机
│  ├─ audio.js                # WebAudio 合成音效 + 静音持久化
│  └─ main.js                 # 状态机 / 结算 / 弹窗 / 调试钩子
├─ tools/
│  ├─ serve.mjs               # 零依赖静态服务器（5173）
│  └─ test_rules.mjs          # 规则自测 + 与 research 引擎对拍
├─ docs/
│  ├─ A_候选玩法分析与比较.md
│  ├─ B_最小关卡验证.md
│  ├─ C_最终方案选型结论.md
│  ├─ D_游戏设计文档.md
│  ├─ E_后续开发任务清单.md
│  └─ 开发日志.md
└─ research/                  # 设计期验证代码（不是游戏本体）
   ├─ engine.mjs              # A/B 规则模拟（genA/applyA/genB/applyB/analyze）
   ├─ solver_fast.mjs         # A* 求解器（支持 targetColor 清色目标）
   ├─ levels_seed.mjs         # 13 个精选关卡的源数据
   ├─ verify.mjs              # 批量校验并回写 levels_report.json
   ├─ optimal_audit.mjs       # 首步最优性 + 关键步禁用测试
   ├─ levels_report.json      # 每关 par/上限/方块/消除/铺垫/中腹停靠/贪心/乱滑/解法
   ├─ levels_md.md            # 可读版关卡报告（棋盘 + 坐标解法）
   ├─ mkdoc.mjs               # 由关卡数据生成 levels_md.md
   ├─ b_verify.mjs            # B 方案 3 关验证
   ├─ density.mjs             # 进展密度（A 17.9% vs B 47.8%）
   ├─ experiments.mjs         # 内墙/方块数/棋盘尺寸三组对照实验
   ├─ explore_c.mjs           # 方案 C 蒙特卡洛
   └─ ...                     # 早期探索脚本（gen_*/search_*/explore*）
```

---

## 3. 如何复跑

需要 Node.js 18+（无第三方依赖）。

```bash
# 启动游戏（ES Module 必须走 HTTP，file:// 会被 CORS 拦）
npm run dev            # 或 node tools/serve.mjs → http://localhost:5173

# 规则自测：第 1 关期望 + 与 research 引擎对拍
npm test               # 或 node tools/test_rules.mjs

# 全量校验 13 个关卡（会重写 levels_report.json）
node research/verify.mjs
# 期望最后一行：levels=13 failed=0

# 生成可读关卡报告
node research/mkdoc.mjs

# 首步最优性 / 关键步禁用测试
node research/optimal_audit.mjs

# B 方案 3 关验证
node research/b_verify.mjs

# 三组控制实验（内墙 / 方块数 / 棋盘尺寸）
node research/experiments.mjs

# 进展密度对比（A vs B）
node research/density.mjs

# 方案 C 蒙特卡洛（随机点击通关率 / 卡死率）
node research/explore_c.mjs
```

> `research/` 里的规则实现与 `docs/D` 中规划的 `src/game.js` **是同一套接口**（`parse / genA / applyA / goalA`，游戏内可改名 `genMoves / apply / isGoal`）。开发时直接移植，保证"设计时能过、游戏里也过"。

---

## 4. 关键数据（可复算）

### 4.1 13 个关卡

| 关卡 | par | 上限 | 方块 | 贪心 | 乱滑@par |
|---|---:|---:|---:|---|---:|
| #1 碰一下 | 2 | 6 | 4 | 过 | 6% |
| #2 挡路的 | 2 | 6 | 4 | 过 | 9% |
| #3 停在墙边 | 3 | 5 | 4 | **失败** | 1% |
| #6 双通道 | 6 | 10 | 6 | 失败 | 0% |
| #9 十字墙 | 7 | 10 | 8 | 失败 | 0% |
| #13 对角 | 8 | 11 | 8 | 失败 | 0% |
| #18 挤一挤 | 9 | 12 | 10 | 失败 | 0% |
| #22 只要红色 | 5 | 8 | 10 | 失败 | 0% |
| #27 给红色让路 | 5 | 7 | 10 | 失败 | 0% |
| #34 五色交错 | 10 | 12 | 10 | 失败 | 0% |
| #38 红海 | 7 | 9 | 12 | 失败 | 0% |
| #44 红海之外 | 7 | 8 | 12 | 失败 | 0% |
| #50 最后一撞 | 10 | 11 | 12 | 失败 | 0% |

### 4.2 三个决定性指标

| 指标 | A | B | 含义 |
|---|---:|---:|---|
| 开局合法走法中"直接减少方块"的比例 | **17.9%** | 47.8% | B 近一半的走法白送进展，选择被稀释 |
| 贪心策略失败 | **11/13 关** | 3/3 关（固定顺序） | A 的"什么时候消"是真决策 |
| 首步最优性（#3） | **1/7** | — | 教学点不可跳过；禁用后 par 3 → 4 |

### 4.3 结构性实验（每组 40 个随机盘面，7×7，A\* 求 par）

| 变量 | 平均 par | 平均中腹停靠 |
|---|---:|---:|
| 内墙 0 → 4 | 5.4 → 6.3 | **0.3 → 1.0** |
| 方块 4 → 10 | **3.8 → 6.8** | 0.3（基本不变） |
| 棋盘 7×7 → 9×9 | 5.9 → 6.6 | 0.3 → 0.5 |

**结论**：把棋盘变大几乎不会变难；加内墙改变的是"性格"（逼出停靠），不是"长度"；真正拉长 par 的是方块数——但方块越多越挤，读图越慢。**所以 50 关不靠规模，靠目标切换 + 步数收紧 + 几何打断。**

---

## 5. 结论摘要

- **选 A《碰碰消》，定名《撞个正着》**。评分 86 / 62 / 50。
- **B 不是"太浅"**：随机盘 par 5–7，与 A 同量级。放弃理由是单步认知负荷高、输入多一步、47.8% 走法白送进展、目标形态单一。
- **C 是规则层问题**：平均每步 4–9 对可选（选择不稀缺），随机通关率 6%–32%、卡死率 68%–94%（结果不可控）。
- **四个自提变体全部否决**：A+推箱、A+连锁、B+对撞、C+手动旋转。10 天内它们都会牺牲关卡质量与可验证性。
- **A 的最大风险是"边境高速路"**：必须用内墙/凹形轮廓打断，并把"中腹停靠 ≥ 1"设为关卡入库的硬性门槛。
- **还没有真人试玩**。`docs/C` §8 列出 5 个必须验证的问题与时间点。

---

## 6. 下一步

按 `docs/E_后续开发任务清单.md` 执行：

1. **11-06**：规则内核 + 单关可玩（P0）✅ 已完成
2. **11-07**：前 3 关 + 教学 + 步数/撤销（P0）✅ 已完成
3. **11-08**：关卡 schema + `verify` + 生成器（P1）
4. **11-09 ~ 11-11**：50 关入库（P1）
5. **11-12 ~ 11-13**：反馈与界面（P2）
6. **11-14 ~ 11-15**：试玩、修正、部署、提交（P3）

验收口径：`node tools/verify.mjs` 输出 `levels=50 failed=0`。

---

## 7. 发布到 GitHub Pages

游戏是纯静态文件（无构建、无后端），可以直接托管在 GitHub Pages。仓库里已放好 `.github/workflows/deploy.yml`：**push 到 `main` 会自动跑规则测试，然后把 `index.html + styles.css + src/` 发布**（`docs/`、`research/` 不会上传到站点）。

### 第一次发布

1. 在 GitHub 上新建一个空仓库（不要勾选 README / .gitignore），例如 `zhuanggezhengzhao`。
2. 本地执行：

```bash
git init -b main            # 本目录已初始化则可跳过
git add .
git commit -m "feat: 前 3 关可玩"
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

3. 打开仓库 **Settings → Pages**，把 **Source** 设为 **GitHub Actions**（只需设置一次）。
4. 等 Actions 里的 `Deploy to GitHub Pages` 变绿，站点地址是：

```
https://<你的用户名>.github.io/<仓库名>/
```

之后每次 `git push`，线上版本会在 1–2 分钟内更新。

### 备注

- 页面全部用相对路径（`styles.css`、`src/main.js`），所以放在 `/仓库名/` 子路径下也能正常加载。
- 不想用 Actions 也可以：Settings → Pages → Source 选 `Deploy from a branch`，分支 `main`、目录 `/ (root)`。缺点是 `docs/` 与 `research/` 也会被一起发布。
- 本地预览仍然用 `npm run dev`（`file://` 打开会被 ES Module 的 CORS 拦住）。
- 建议每次发版前跑一遍 `npm test`（CI 也会跑，失败会阻止发布）。