# 答题过程监控（process_signals）

> **状态：已实现（2026-09-09）。** 本文档记录设计方案与口径决策，代码已按五步实现并落测试。

记录候选人在主观题（简答 `short`、编程 `code`）作答过程中的**客观行为信号**，辅助人工复核是否存在「复制粘贴 / 切屏查答案」等非自主作答行为。

与 `ai_flavor`（读答案文本、由 LLM 判断"像不像 AI"）不同，本机制采集的是**确定性的行为事实**（有没有粘贴、切没切屏），不依赖文字风格。

## 与 ai_flavor 的区别

| | ai_flavor（AI 痕迹） | process_signals（过程监控） |
|---|---|---|
| 数据来源 | 答案文本，LLM 判断 | 前端输入事件，确定性事实 |
| 性质 | 概率性风格判断 | 客观行为记录 |
| 判断异常 | 是（0-3 分级 + 阈值） | 否（只客观呈现，不判异常） |
| 是否计分 | 不参与 | 不参与 |
| 展示 | 蓝/紫「AI痕迹」badge | 橙「过程」badge + 折叠面板 |

## 四个客观维度

### 1. 粘贴次数 `paste_count`

- 采集：`paste` 事件触发次数。
- 客观含义：明确使用了 Ctrl+V / 右键粘贴。
- 与「大块瞬时输入」分开计数（来源不同、证据强度不同）。

### 2. 大块瞬时输入 `chunk_inputs`

- 采集：单次 `input` 事件的文本净增 ≥ **20 字**记为一次。
- 记录：`[{ at_sec, chars }]`，即"相对首字第几秒灌入多少字"。
- 兜底：粘贴之外的拖放、输入法整句上屏、脚本注入等。
- **口径说明**：`20` 是「大块」这一标签的操作化归类（正常逐字输入每次净增 1 字），**不是异常阈值**——系统只归类呈现、不据此判可疑。

### 3. 切屏次数 `tab_switches`

- 采集：`document.visibilitychange` 变为 `hidden` 记一次（切 tab / 切后台 / 最小化）。
- 记录：`[{ at_sec, duration_sec }]`。
- 不记 `blur`（点别的窗口也算 blur，visibility 才是"页面真不可见"）。

### 4. 编辑时长 `edit_duration_seconds`（**辅助，不参与 flag**）

- 起点：该题 `value` **首次从空 → 非空**的第一次输入事件（**focus 不计时**）。
- 终点：该题答案提交 / 离开时。
- 时长 = 首字输入 → 提交的**墙钟时间**（**含中间切屏时段**，切屏由维度 3 独立呈现，两者不互相篡改）。
- 空答（无首字输入）→ 无 `edit_start_ts`，展示为「—」。

## flag 机制

**判据：三个计数维度（粘贴 / 大块输入 / 切屏）任一 > 0。编辑时长不参与。**

- **题目级** `process_flag`：该题任一计数维度 > 0 → 打标。
- **卷面级** `process_suspect`：任一题 `process_flag` → 打标（地位等同 `ai_flavor_suspect`）。

## 非空处理

- **采集侧**：只对 `short` / `code` 题采集；选择题（选项点击）不产生过程信号，不建条目。
- **传输侧**：`signals` 为可选字段，无有意义值则不携带。
- **存储侧**：`if signals` 才写入，不存空对象。
- **展示侧**：防御式读取，字段缺省不报错；「作答过程」面板 short/code 题**无条件显示**（全 0 也显示），题头橙色 badge 仅 flag 命中时才亮。

## 数据模型

```jsonc
// assignment.data.process_signals = { "<qid>": {
//   "paste_count": 2,
//   "chunk_inputs": [ { "at_sec": 12, "chars": 132 }, { "at_sec": 45, "chars": 238 } ],
//   "edit_start_ts": 1720000000,
//   "edit_duration_seconds": 108,
//   "tab_switches": [ { "at_sec": 20, "duration_sec": 45 } ]
// } }
```

前端本地聚合、提交时携带全量值，服务端直接覆盖（事件唯一发生在前端，避免后端合并复杂度）；随现有 `answers` / `submit` 请求附带，**零新增请求、低存储**。

## 数据流

```
前端采集（input/paste/visibilitychange）→ 本地聚合到 process_signals[qid]
  → 提交答案时附带 signals 字段
  → _apply_answer_action 落 assignment.data.process_signals
  → 判卷归档写入 archive.process_signals
  → 判卷详情序列化透传 process_signals / process_flag / process_suspect
  → 后台展示（答题卡片 / 评价汇总 / 题目头部 / 作答过程面板）
```

## 代码位置

- 前端采集器：`static/public/modules/process-signals.js`
- 提交附带：`static/public/modules/quiz.js` `performAnswerAction`、`static/public/modules/pages/full-quiz.js` `saveAnswer` / `confirmSubmit`
- 后端落库：`backend/md_quiz/api/public.py` `_apply_answer_action` / `_merge_process_signals`
- 归档透传：`backend/md_quiz/services/runtime_jobs.py` `_archive_candidate_attempt`
- 详情透传与 flag：`backend/md_quiz/api/admin.py` `_build_review_answers` / `_serialize_assignment_row` / `_serialize_attempt_detail`
- 展示：`static/admin/pages/attempt-detail.html`、`static/admin/pages/assignments.html`、`static/admin/modules/pages/assignments.js`
- 测试：`tests/test_process_signals.py`

## 前端显示位置

- 后台 → 邀约与答题列表卡片：**过程** badge（`process_suspect`）。
- 后台 → 答题详情头部 / 评价汇总：**过程** badge。
- 后台 → 答题详情每题：题头橙色 `process_flag` badge + 「作答过程」折叠面板（四维度客观罗列）。

## 自测用例

### 大块瞬时输入

| # | 操作 | 预期 |
|---|---|---|
| 1 | 逐字输入 50 字 | `chunk_inputs=[]`、`paste_count=0` |
| 2 | Ctrl+V 粘 132 字 | `paste_count=1`、`chunk_inputs` 含 `{chars:132}` |
| 3 | 右键粘贴 80 字 | `paste_count=1`、`chunk_inputs` 含 `{chars:80}` |
| 4 | 拖拽文字进框 | `paste_count=0`、`chunk_inputs` 含 ≥20 那一条 |
| 5 | 一次粘贴 15 字 | `paste_count=1`、`chunk_inputs=[]`（<20 不进大块）|

### 编辑时长

| # | 操作 | 预期 |
|---|---|---|
| 1 | 移入等 30s → 打字 10s → 提交 | `edit_duration≈10s` |
| 2 | 打字 5s → 切屏 60s → 回来 → 提交 | 时长含 60s；`tab_switches=1` |
| 3 | 不输入直接提交 | 无 `edit_start_ts`，显示「—」|
| 4 | 打 1 字→清空→重打，全程 8min | 时长≈8min（不重置）|

### 切屏

| # | 操作 | 预期 |
|---|---|---|
| 1 | 切 tab 再回 ×3 | `tab_switches` 3 条 |
| 2 | 最小化再恢复 | 1 条 |
| 3 | 页内点其他元素 | 0（不记 blur）|

### 集成

| # | 操作 | 预期（判卷详情）|
|---|---|---|
| 1 | 简答"先搜后粘"：focus→切屏 60s→粘贴 132 字→提交 | 卡片/汇总/题头均出现 flag，面板显示粘贴1·切屏1 |
| 2 | 正常逐字输入、无切屏 | 无 badge，面板显示 `编辑时长 N · 粘贴 0 · 切屏 0` |
| 3 | code 题粘贴大段代码 | 题头 flag + 面板粘贴/大块 |

## 实现顺序

1. 前端进程信号采集器 + 提交附带
2. 后端接收落库（`_apply_answer_action`）
3. 归档 + 判卷详情透传
4. 展示组件（三层 + flag）
5. 按自测用例验收

## 与 ai_flavor 的关系约定

两套信号并列、互补、互为正证：文本像 AI + 行为有粘贴 = 高度可疑；文本像 AI 但过程干净 = 可能只是写作风格。**本机制不自动扣分，仅作人工复核证据。**
