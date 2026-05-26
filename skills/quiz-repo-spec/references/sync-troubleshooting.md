# Quiz 仓库同步排错

## 核对顺序

遇到同步失败时，按这个顺序排：

1. 仓库根目录是否有 `md-quiz-repo.yaml`
2. 仓库根目录是否有 `README.md`
3. manifest 的 `schema_version` / `kind` / `quizzes` 是否合法
4. manifest `path` 是否严格是 `quizzes/<quiz_id>/quiz.md`
5. 若 manifest 包含 `job_descriptions`，职位 `path` 是否严格是 `job-descriptions/<jd_key>/jd.md`
6. `quiz.md` 是否存在，且 Front Matter `id` 是否等于目录名
7. `jd.md` 是否存在，且 Front Matter `id` 是否等于目录名、`title` 是否非空、`status` 是否合法
8. Markdown 是否只引用图片，不包含普通链接
9. 图片是否都在当前 quiz 目录 `assets/` 下
10. 图片是否存在、未越界、未超 1MB、扩展名合法
11. 仓库内是否出现重复 quiz id 或职位 id

## 常见错误与含义

### `仓库缺少 md-quiz-repo.yaml`

- 当前仓库不是新版 quiz 仓库
- 常见于旧的根目录 `.md + images/` 结构

### `仓库缺少 README.md`

- 仓库未满足最小发布面要求

### `md-quiz-repo.yaml kind 必须为 md-quiz-repo`

- manifest 类型错误

### `md-quiz-repo.yaml 仅支持 schema_version: 2`

- 当前仓库规范版本号不匹配
- 应与 quiz 头部推荐的 `schema_version: 2` / `format: qml-v2` 保持同一代际

### `manifest path 只支持 quizzes/<quiz_id>/quiz.md`

- 当前 path 不符合标准目录结构
- 例如：根目录 `demo.md`、`exam/demo.md`、`quizzes/demo/demo.md` 都不合法

### `职位 manifest path 只支持 job-descriptions/<jd_key>/jd.md`

- `job_descriptions` 中的职位 path 不符合标准目录结构
- 例如：`jobs/backend.md`、`job-descriptions/backend.md`、`job-descriptions/backend/profile.md` 都不合法

### `Front matter id 必须与目录名一致`

- `quizzes/backend-basic/quiz.md` 的 `id` 只能是 `backend-basic`

### `职位 Front Matter id 必须与目录名一致`

- `job-descriptions/backend-engineer/jd.md` 的 `id` 只能是 `backend-engineer`

### `职位 status 必须是 draft、active 或 archived`

- Git 仓库中的职位状态不在允许集合内
- `active` 职位会出现在候选人创建、简历入库和候选人详情增加关联的可选列表中
- `draft` / `archived` 职位会同步入库，但不会作为当前可选职位

### `Markdown 只允许引用图片`

- QML 内容里出现了普通 Markdown 链接

### `图片必须位于当前 quiz 目录 assets/ 下`

- 使用了 `images/`、`../`、其他 quiz 的路径、或仓库根共享资源

## 实现事实来源

- 同步实现：`backend/md_quiz/services/exam_repo_sync_service.py`
- 相关测试：`tests/test_exam_repo_sync_service.py`
