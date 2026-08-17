# AI 痕迹检测（ai_flavor）

对简答/编程题的作答进行 AI 生成痕迹检测，辅助人工复核候选人在主观题上是否可能借助了 AI 工具。

## 概览

- 评卷 LLM 在判分的同时，对每道简答/编程题输出一个 `ai_flavor` 分级（0-3）和一段 `ai_flavor_reason`（判定依据）。
- `ai_flavor` 不参与计分，仅作为人工复核参考信号。
- 当某题 `ai_flavor` 达到阈值（`AI_FLAVOR_THRESHOLD`，默认 2）时，后台列表卡片和答题详情会打上「AI痕迹」标签。
- 当某题 `ai_flavor >= 1` 时，`ai_flavor_reason` 会拼接到该题「判分理由」末尾，便于审阅核对。

## ai_flavor 分级

| 值 | 含义 |
|:---:|------|
| 0 | 无明显 AI 痕迹 |
| 1 | 轻微（个别措辞略正式） |
| 2 | 明显（模板化、大量套话、堆砌概念、缺少具体场景） |
| 3 | 极明显（通篇空泛、无任何具体细节） |

## 判定四信号

判定**不依据答案是否分点/结构化**——题目要求分维度作答时，结构化是正常且被期待的。核心看四个信号：

- **覆盖度**：真人每个角度点到 1-2 点、有侧重；AI 每个角度都面面俱到、列全。
- **措辞**：真人口语化、有自己的话；AI 教科书式、术语密集、模板化。
- **深度均匀**：真人有深有浅（熟悉的展开、不熟的带过）；AI 各点深度均匀到反常。
- **个人判断**：真人体现取舍（如「我会先测急停，因为安全最重要」）；AI 无优先级、无取舍、无个人经验。

命中越多、越明显则 `ai_flavor` 越高。

## 三层提示词共同作用

一次判卷的 prompt 由三层拼接而成（前缀 + 正文），优先级逐层升高：

### 第①层：通用前缀（全局兜底）

`backend/md_quiz/services/grading_short_answer.py` 的 `_short_grading_prefix` / `_short_batch_grading_prefix`，拼接 `_AI_FLAVOR_CRITERIA`：

- 要求 JSON 必须包含 `score`、`reason`、`relevance`、`contradiction`、`ai_flavor`、`ai_flavor_reason`
- 定义四信号判定标准
- 明确「不要仅因答案分点/结构化就判高」
- 声明「评分标准优先级最高」（见下）

### 第②层：套题 front matter 的 `llm.prompt_template`

试题仓库（shire）里每套题的 front matter 定义了本套题的评分提示词模板：

```yaml
llm:
  model: gpt-5
  temperature: 0.0
  prompt_template: |
    请根据评分标准对考生答案打分，允许部分得分。
    只输出 JSON，不要解释，不要 Markdown。
    JSON 必须包含字段：score、reason、relevance、contradiction、ai_flavor、ai_flavor_reason。
    ...
    题目：{{question}}
    评分标准：{{rubric}}
    考生回答：{{answer}}
```

该模板以 `{{question}}` / `{{rubric}}` / `{{answer}}` / `{{max_points}}` 填充后作为正文。

### 第③层：每题 `[rubric]` 的「AI痕迹提示」（最优先）

每题 rubric 末尾可追加一段方向级或题目级的 AI 痕迹提示。方向级（C++/Java/前端/QA）由题库统一维护：

```text
AI痕迹提示（不计分）：若堆砌教科书式 C++ 概念（如 RAII、虚函数表、智能指针定义等）
而脱离题目具体代码/设备场景，倾向于高 ai_flavor；若给出实际代码取舍与个人判断，倾向于低。
```

针对特定题目还可以写得更细，例如 C++ 应届「通信模块」题：

```text
AI痕迹提示（不计分）：以是否结合本题场景给出细节与取舍为准。若作答能落到串口/TCP 差异、
切换通道时的资源处理、日志对实时通信的性能影响、所有权归属等具体场景，倾向于低 ai_flavor；
若只停留在模式名称与教科书概念层面、空泛套话，倾向于高（2-3）。
```

### 优先级规则

通用前缀写明：

> 评分标准优先级最高；若评分标准明确写出特殊判分规则，必须优先执行评分标准。

因此第③层（每题 rubric）**压过**第①层（通用前缀）。判定某题的 `ai_flavor` 时：

1. 四信号作为底线，适用于所有题；
2. 若该题 rubric 有额外的 AI 痕迹提示（方向级或题目级），优先按它细化判定。

## 数据流

```
考生提交
  → 后台触发判卷（单题或批量，见 grading_short_answer.py）
  → 拼接三层提示词 → 调用 LLM
  → LLM 返回 JSON { score, reason, relevance, contradiction, ai_flavor, ai_flavor_reason }
  → _coerce_short_grade_payload 解析
  → _append_ai_flavor_reason：ai_flavor >= 1 时拼入 reason
        reason = "得分依据…；AI痕迹=2（判定依据）"
  → 写入 subjective 判分明细 { qid, score, max, reason, ai_flavor }
  → 随 assignment / archive 持久化
```

相关代码：

- 提示词与解析：`backend/md_quiz/services/grading_short_answer.py`
- 判分明细组装：`backend/md_quiz/services/grading_service.py`
- 列表/详情暴露：`backend/md_quiz/api/admin.py` 的 `_compute_ai_flavor_suspect`、`_build_review_answer_item`

## 阈值与配置

`AI_FLAVOR_THRESHOLD`（`.env`，默认 2）：

- 列表卡片「AI痕迹」badge：扫描 `grading.subjective`，任一题 `ai_flavor >= 阈值` 即打标（红色）。
- 答题详情逐题「AI痕迹 N」标签：`< 阈值` 绿色，`>= 阈值` 红色。
- 阈值由后端下发到前端（`ai_flavor_threshold`），前端不写死。

## 前端显示位置

- 后台 → 邀约与答题列表卡片：**AI痕迹** 红色 badge。
- 后台 → 答题详情头部：**AI痕迹** 红色 badge。
- 后台 → 答题详情每题：**AI痕迹 N** 分值标签（绿/红）+ 「判分理由」末尾的 `；AI痕迹=N（判定依据）`。

## 与试题仓库的约定

试题仓库（shire/assessment-bank）中简答/编程题的 `[rubric]` 需维护「AI痕迹提示」段落。约定：

- 方向级：四套方向（C++/Java/前端/QA）各统一一句，随题库维护。
- 题目级：当某题有独特的 AI 痕迹特征时，在该题 rubric 中写得更详细（例如通信模块题的特有细节信号）。
- 前端字段清单（`JSON 必须包含字段`）需包含 `ai_flavor` 与 `ai_flavor_reason`。

## 注意：元数据改动会生成新版本

`content_hash = sha256(整份 quiz.md 文本 + assets)`，front matter 的任何改动（如 tags/description）都会改变 hash，同步时自动生成新版本（`version_no + 1`）。旧答案仍指向旧版本，不受影响。
