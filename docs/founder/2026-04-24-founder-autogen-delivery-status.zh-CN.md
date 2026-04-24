# Founder Autogen 交付状态（2026-04-24）

## 当前阶段

基于 Clawith 底座的 founder 产品主线，当前已经进入可运行的 MVP 阶段：

- 创业者不需要再从原始单 Agent 创建入口起步，而是先创建一个持久化的 founder workspace。
- 系统已经能跑通 `interview -> draft -> approval -> materialize` 主链路。
- materialize 之后会在现有 Clawith 运行时里生成可直接使用的多 Agent 公司脚手架。
- 创业者最终会落到专属 dashboard，上面同时呈现物化快照和实时 agent 运行状态。

这条交付线对应的主实现规划见：

- `docs/superpowers/plans/2026-04-23-founder-autogen-framework.md`

## 已交付内容

### 后端

- `backend/app/models/founder_workspace.py`
  - 在单 Agent 创建之上增加持久化 founder workspace 壳层
- `backend/app/api/founder_workspaces.py`
  - 提供 founder workspace 创建、规划和物化 API
- `backend/app/services/founder_company_materializer.py`
  - 将审批后的 founder 方案转换为真实公司包
- `backend/app/services/founder_company_wiring.py`
  - 将生成角色映射到 Clawith 模板化 agents、skills、relationships、permissions 和 starter triggers

关键后端提交：

- `de5d5e45` `Make founder-generated companies usable inside the Clawith runtime`

### 前端

- `frontend/src/pages/FounderWorkspace.tsx`
  - founder 专属工作流入口页
- `frontend/src/pages/FounderCompanyDashboard.tsx`
  - materialize 后的 founder 控制台
- `frontend/src/services/founderCompanyDashboard.ts`
  - dashboard 汇总与 blocker 推导
- `frontend/src/services/founderWorkspace.ts`
  - founder workspace API 客户端
- `frontend/src/services/founderMainlineE2e.ts`
  - founder 主链路浏览器回归的共享配置与场景构造器
- `frontend/tests/e2e/founderMainlineE2e.mjs`
  - founder 主链路的自举式真实浏览器 E2E runner

关键前端提交：

- `89fd4d3e` `Ground founder dashboards in live runtime state and blocker signals`

## 自动化验证

2026-04-24 已完成验证：

- `python -m pytest backend/tests -q`
  - 通过：`85 passed`
- `python -m ruff check backend/app/services/founder_company_materializer.py backend/app/services/founder_company_wiring.py backend/tests/test_founder_company_materializer.py backend/tests/test_founder_company_wiring.py`
  - 通过
- `node --test frontend/tests/*.mjs`
  - 通过：`19/19`
- `node --test frontend/tests/founderCompanyDashboard.test.mjs frontend/tests/founderMainlineE2eRuntime.test.mjs`
  - 通过
- `cd frontend && npm run build`
  - 通过

Founder 浏览器自动化现已纳入仓库，可通过以下命令运行：

```bash
cd frontend
FOUNDER_E2E_EMAIL=<测试账号邮箱> \
FOUNDER_E2E_PASSWORD=<测试账号密码> \
FOUNDER_E2E_BASE_URL=http://127.0.0.1:3010 \
FOUNDER_E2E_TENANT="Solo Founder Lab (solo-founder-lab-3cf969)" \
npm run test:e2e:founder
```

该浏览器 runner 的特点：

- 按需把 `playwright-core@1.59.1` 安装到临时 runtime 目录，不新增仓库依赖。
- 直接调用本机 Microsoft Edge，并把截图输出到 `output/playwright/`。
- 覆盖 `登录 -> 多租户选择（如需要） -> 创建 founder workspace -> 访谈 -> draft -> 确认 -> materialize -> founder dashboard 断言`。

## 真实 UI / API 主链路验证

Founder happy path 已于 2026-04-24 通过真实 UI / API 跑通，并完成了自动化浏览器回归。

环境：

- 最新源码前端：`http://127.0.0.1:3010`
- 后端/API 通过稳定 Docker Web 入口代理：`http://127.0.0.1:3008`

实际跑通流程：

1. 注册或登录
2. 在需要多租户登录时选择正确租户
3. 创建公司
4. 创建 founder workspace
5. 选择已配置模型
6. 填写 8 个访谈问题
7. 保存访谈进度
8. 生成 draft plan
9. 确认可开始物化
10. materialize 公司
11. 跳转到 founder dashboard

观测到的 API 证据：

- `POST /api/tenants/self-create` -> `201`
- `POST /api/founder-workspaces` -> `201`
- `POST /api/founder-workspaces/{id}/planning/interview-progress` -> `200`
- `POST /api/founder-workspaces/{id}/planning/draft-plan` -> `200`
- 确认后第二次 `POST /api/founder-workspaces/{id}/planning/draft-plan` -> `200`
- `POST /api/founder-workspaces/{id}/materialize` -> `200`

自动化运行得到的最终结果：

- workspace 名称：`Founder Workspace 13-10-15`
- 最终路由：`/founder-workspace/dashboard`
- dashboard 标题：`Founder Workspace 13-10-15 currently has 4 active agents`
- 展示的 agents 数量：`4`
- blockers：`0`
- relationships：`3`
- starter triggers：`4`

Dashboard 上确认出现的 4 个 agent：

- `Founder Copilot`
- `Project Chief of Staff`
- `Content Strategy Lead`
- `Global Distribution Lead`

截图产物：

- `output/playwright/2026-04-24T13-10-15-461Z-*.png`
- `output/playwright/founder-natural-dashboard.png`
- `output/playwright/founder-natural-dashboard-full.png`
- `output/playwright/founder-dashboard-final.png`
- `output/playwright/founder-dashboard-full.png`

## 当前已知说明

- 现在 dashboard 会把 `idle` 也计入 active，这是当前实现的预期，因此 headline 显示 4 个 active agents 是正常结果。
- 本地测试租户里仍保留了更早期手工注入的旧 agent 数据；当前 dashboard 之所以没有混淆，是因为它按 snapshot 中存储的 `agent.id` 去 hydrate 实时状态，而不是只按名称匹配。
- Founder 自动化 E2E 已经补齐，但它仍依赖可用的前后端环境、预置的多租户测试账号以及本机 Microsoft Edge，目前还没有接入 CI。

## 建议的下一步

- 在测试账号策略稳定后，把 `npm run test:e2e:founder` 接入可选 CI 或 release-readiness 流水线。
- 为本地 founder demo tenants 增加 reset / cleanup 机制，减少手工验收时的脏数据影响。
- 如果要面向零 AI / 零工程经验用户继续交付，可以补一份 founder onboarding 文档，说明模型准备要求与首次启动步骤。
