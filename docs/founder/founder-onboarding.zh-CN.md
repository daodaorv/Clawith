# Founder 入门指南

## 这份文档是给谁用的

这份指南面向想用 Clawith 生成第一版多 Agent 公司脚手架的创业者。你不需要先懂 AI 工程细节，只需要能把自己的业务讲清楚。

如果你已经能说明自己的业务目标、客户是谁、卖什么、怎么获客，以及哪些环节必须保留人为审批，就已经可以开始使用 founder 流程。

## 开始前你需要准备什么

先准备好这四项：

1. 一个可以登录 Clawith、并能进入正确公司租户的账号。
2. 一个可用的 LLM provider 账号和 API Key。
3. 在 `Enterprise settings` 里至少配置并启用一个模型。
4. 一段简短的业务描述，至少覆盖产品、客户、获客、转化和交付。

你不需要先把每个 agent 手工设计出来。Founder 流程的目标，就是把这段业务描述先转换成第一版可运行的组织结构。

## 第一轮建议怎么跑

第一次使用时，建议把业务范围收窄：

- 只聚焦一个核心产品
- 只聚焦一个核心客户群
- 只聚焦一个主获客渠道
- 只保留一条主转化路径
- 明确一条简单的人类审批边界

比较适合第一轮的例子：

- 产品：咨询 + 小班训练营
- 客户：某一个细分赛道的创作者或小团队经营者
- 获客：短视频 + 邮件
- 人类审批边界：定价、对外承诺、最终客户交付内容

不要试图在第一轮 workspace 里一次性建模所有未来产品、所有市场和所有自动化规则。第一轮的目标是先得到一个可用的运营骨架，而不是一次做到完美。

## 产品内最快跑通路径

### 第 1 步：先配置 provider 和模型

打开 `Enterprise settings`，至少添加一个可用 provider 和一个已启用模型。

如果你还不知道该选哪个 provider：

- 先从 `Founder Workspace` 页面里的推荐 preset 开始。
- 优先选 API Key 好拿、在你当前网络环境里能稳定调用的 provider。

如果没有启用模型，Founder 流程无法通过第一阶段规划。

### 第 2 步：登录并选择正确租户

先登录系统。

如果你的账号属于多个租户，登录时可能会弹出租户选择框。请先选择你要创建 founder workspace 的那家公司，再继续往下走。

### 第 3 步：进入 Founder Workspace

打开：

- `/founder-workspace`

创建 workspace 时，至少填写：

- `Workspace name`
- `Core offer`
- `Acquisition channel`
- `Business brief`

这一步会先把业务外壳保存下来，然后才进入后续规划，不再是只在浏览器本地临时存状态。

### 第 4 步：为本次规划选择模型

在 founder planning 区域，选择这次规划要使用的模型。

如果模型列表是空的：

- 回到 `Enterprise settings`
- 确认 provider 已配置
- 确认模型已启用

### 第 5 步：完成 founder 访谈

把 8 个访谈字段尽量写具体。

最关键的是：

- 目标用户是谁
- 核心产品或服务是什么
- 主要获客渠道是什么
- 转化方式是什么
- 交付方式是什么
- 哪些环节可以自动化，哪些必须由人审批

写法上，更像是在给一个 Chief of Staff 做业务交接，而不是在写营销文案。

### 第 6 步：保存进度并生成草案

可以使用：

- `Save interview progress` 保存当前进度
- 在所有访谈项都准备好后点击 `Generate founder draft plan`

如果系统仍然提示补充问题，说明方案还没准备好进入 materialize，需要先把关键缺口补齐。

### 第 7 步：像运营负责人一样审草案

在 materialize 之前，请重点看：

- 团队结构是否符合你的业务
- 渠道安排是否现实
- 是否仍有开放问题
- 人类审批边界是否足够明确

如果方向基本对，但角色、渠道、交付方式或审批边界需要调整，就用 `Correction notes` 补充修正意见。

只有在你愿意把它变成第一版公司骨架时，才勾选确认。

### 第 8 步：Materialize 公司脚手架

当计划进入 deploy prep readiness 之后，就可以执行 materialize。

这一步会把结果从“草案”变成真实运行时记录，而不只是停留在规划层。

生成结果包括：

- founder workspace 记录
- 已审批的 planning context
- 真实 materialized agent 记录
- agent 之间的关系
- starter triggers 和 operating loops
- founder dashboard 快照

### 第 9 步：把 founder dashboard 当成运营面板使用

materialize 完成后，系统会跳转到：

- `/founder-workspace/dashboard`

进入 dashboard 后，请先确认：

- agent 卡片已经出现
- blocker 没有异常偏高
- relationship 数量不为 0
- starter trigger 数量不为 0

这说明你的 founder 描述已经被转换成真实可运行的多 Agent 运营骨架。

## 怎么写输入会更有效

尽量使用直接的业务语言。

好的写法：

- “我们卖给独立教练的是每周一次转化拆解服务，用短视频和私信预约咨询电话。”

不够有效的写法：

- “打造全自动 AI 增长帝国。”

系统最需要你讲清楚的是：

- 客户是谁
- 他买什么
- 他从哪里来
- 他如何转化
- 交付如何完成
- 哪些内容 AI 可以先起草，哪些必须人来拍板

## Clawith 会帮你做什么，不会替你做什么

Clawith 可以帮你：

- 把业务结构化为第一版多 Agent 公司骨架
- 生成草案规划上下文
- 创建 agents、relationships 和 starter triggers
- 提供一个 dashboard 来检查生成后的运营系统

Clawith 不会自动替你保证：

- 定价一定正确
- 法务或合规决策一定正确
- 对客户的承诺一定合理
- 市场匹配一定成立

这些决策，尤其在第一轮，仍然应该由 founder 自己审批。

## 常见卡点

### Founder Workspace 里没有模型可选

去 `Enterprise settings` 检查：

- provider 是否已配置
- 模型是否已启用
- 当前用户是否能访问这个租户下的配置

### 登录后总是停在租户选择

这对多租户账号是正常行为。先选中目标租户，再继续 founder 流程。

### 草案迟迟不能进入 materialize

通常是这些信息还不够完整：

- 访谈答案不够具体
- 没有选择模型
- 自动化与人工边界不明确
- deploy prep 所需信息还没补齐

### Dashboard 里明明是 idle，却显示 active

当前 founder dashboard 的 headline 逻辑，会把 `idle` agent 也计入 active，这是现阶段的预期行为。

## 建议的结果验证

第一轮成功跑通后，至少检查这四项：

1. 页面最终落在 `/founder-workspace/dashboard`。
2. Dashboard 里出现了生成后的团队，而不是空状态。
3. relationship 和 trigger 数量已经有值。
4. 你能说清楚每个生成角色各自负责什么。

如果这四项都满足，就说明你已经得到一套有效的第一版运营骨架，后面可以在此基础上迭代，而不是重新从零开始。

## 给操作者的本地验证入口

如果你是在本地用最新源码前端，配合稳定 Docker 后端链路做验证：

```bash
cd frontend
VITE_DEV_PROXY_TARGET=http://127.0.0.1:3008 npm run dev -- --host 127.0.0.1 --port 3010
```

然后打开：

- `http://127.0.0.1:3010/founder-workspace`

如果你想在手工浏览器验证前，先跑一遍确定性的 founder 发布就绪检查：

```bash
cd backend
python -m app.scripts.founder_release_readiness
```

如果要针对一条全新的自举公司链路执行自动化 founder 浏览器回归：

```bash
cd frontend
npm run test:e2e:founder
```

这条默认路径现在会自动：

- 注册一次性的 founder 测试账号
- 创建一次性的公司
- 当新公司还没有可用模型时，为该 tenant 注入一个验证用 dummy LLM model
- 继续跑完整 founder 主链路直到 dashboard 断言

如果你想复用一个已经配置好模型的 founder tenant，再显式提供凭据：

```bash
cd frontend
FOUNDER_E2E_EMAIL=<测试账号邮箱> \
FOUNDER_E2E_PASSWORD=<测试账号密码> \
FOUNDER_E2E_BASE_URL=http://127.0.0.1:3010 \
FOUNDER_E2E_TENANT="Solo Founder Lab (solo-founder-lab-3cf969)" \
npm run test:e2e:founder
```

现在即使没有提前导出这些浏览器 E2E 环境变量，也可以在 `backend` 目录下直接把 live 门禁追加到确定性链路后面：

```bash
cd backend
python -m app.scripts.founder_release_readiness --include-live-e2e
```
