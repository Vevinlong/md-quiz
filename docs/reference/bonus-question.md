# 附加题（bonus）

简答/编程/选择题可通过题头 `bonus` 标记为附加题。语法定义见题库仓库的 `skills/qml-authoring/references/qml-spec.md`，本文档说明 md-quiz 的运行时行为。

## 标记方式

```markdown
## Q11 [single] (1) {answer_time=60s, bonus}
```

`bonus` 为裸属性，解析器会写入题目 `bonus: true`（spec 与 public_spec 均带）。

## 计分规则

- **不计入总分分母**：附加题的 `max_points` 不加入 `total_max`，总分满分只统计普通题。
- **加分制**：附加题答对，其得分计入总分（总分可超过 `total_max`）；答错不扣分。
- 附加题仍作为一道题参与作答与判卷（导航、未作答统计正常）。

### 计分结果字段

判卷结果 `scored_result` 与返回 dict 中单独记录：

| 字段 | 含义 |
|------|------|
| `bonus_total` | 附加题满分合计 |
| `bonus_scored` | 附加题实得分数 |

## 答题端显示

- 整卷模式：附加题**不显示分值**，显示「附加题」琥珀徽标。
- 分组索引：附加题独立成「附加题」段，段标题不显示分数。
- 线性模式：附加题同样不显示分值（线性模式本就不展示分值）。

## 评审端显示（后台答题详情）

- 逐题 review：附加题问题头部显示「附加题」徽标，正常显示该题得分（如 `1 / 1`）。
- 评分摘要：总分旁显示「附加题 X / Y」得分卡；`score_display` 分母排除附加题。

## 相关代码

- 解析：`backend/md_quiz/parsers/qml.py`（题头 `bonus` 属性）
- 计分：`backend/md_quiz/services/grading_service.py`（`bonus_total` / `bonus_scored`）
- 评审序列化：`backend/md_quiz/api/admin.py`（`_build_review_answer_item`、`_build_review_evaluation`）
- 整卷分组/显示：`static/public/modules/pages/full-quiz.js`、`static/public/views/full-quiz.html`
